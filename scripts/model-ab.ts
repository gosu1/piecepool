// 블라인드 모델 A/B 러너 — Gemini 후보 모델을 3작업(위키·파인만·PDF요약)에 돌려
// 익명 컬럼 report.html 을 만든다. 판정·개봉·집계는 HTML 안에서 완결.
//   npm run eval:ab -- --list                     # 지금 살아있는 모델 나열
//   npm run eval:ab                               # 기본 후보 (3.1-flash-lite vs 3.5-flash)
//   npm run eval:ab -- --models a,b [--task wiki|feynman|pdfsummary]
// 구조는 eval.ts·feynman-eval.ts 와 동형: fixtures → src/llm 직호출(재구현 없음) → results.
// 키: process.env.GEMINI_API_KEY (CLI 규약). 설계: docs/superpowers/specs/2026-07-12-model-ab-harness-design.md

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GEMINI_OPENAI_ENDPOINT, GeminiProvider } from "../src/llm/gemini";
import { probeExplanation, type Turn } from "../src/llm/feynman";
import { runPdfSummary } from "../src/llm/pdfsummary";
import { validateLlmWikiResult } from "../src/llm/validate";
import type { LlmWikiInput } from "../src/llm/index";
import { assertCase } from "./eval";
import {
  buildReportData,
  mulberry32,
  renderReportHtml,
  type AbTask,
  type FeynmanRound,
  type ProbeResult,
  type RawOutput,
} from "./model-ab-report";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AB_DIR = join(ROOT, "docs/30-llm/evals/model-ab");
const WIKI_FIXTURES = join(ROOT, "docs/30-llm/evals/fixtures");
const WIKI_EXPECTED = join(ROOT, "docs/30-llm/evals/expected");
const FEYNMAN_FIXTURES = join(ROOT, "docs/30-llm/evals/feynman/fixtures");
const SUMMARY_FIXTURES = join(AB_DIR, "fixtures/pdfsummary");

// 현재 모델 + 승격 후보 (gemini.ts:28 주석의 결정 대기 사항 그대로)
const DEFAULT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
// 18개 중 유형 다양성 기준 6개 — 모범/오답함정/답요구/모순/위장판정/수식붙여넣기
const FEYNMAN_CASES = [
  "clarify-01-diligent-deadlock",
  "clarify-03-wrong-pvalue-trap",
  "clarify-04-just-tell-me-opportunity-cost",
  "clarify-09-contradiction-clt",
  "clarify-15-disguised-judgment-request-osmosis",
  "clarify-17-formula-only-paste-variance",
];
const CALL_GAP_MS = 500; // 무료 티어 배려 — 호출 사이 간격
const PREVIEW_CHARS = 600;
const TASKS: AbTask[] = ["wiki", "feynman", "pdfsummary"];

type WikiFixture = { id: string; title: string; input: LlmWikiInput };
type WikiExpected = Parameters<typeof assertCase>[1];
type FeynmanFixture = { id: string; persona: string; concept: string; note: string; studentSays: string[] };
type SummaryFixture = { id: string; title: string; sourceText: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
// probeExplanation 은 자체 타임아웃이 없다 — feynman-eval 과 같은 규약으로 감싼다.
const fetchWithTimeout = ((url: string, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })) as typeof fetch;

async function listModels(apiKey: string): Promise<void> {
  const res = await fetch(`${GEMINI_OPENAI_ENDPOINT}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    console.error(`GET /models 실패: HTTP ${res.status}`);
    process.exit(1);
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (body.data ?? [])
    .map((m) => m.id ?? "")
    .filter((id) => id.includes("gemini"))
    .sort();
  console.log(ids.join("\n") || "(gemini 모델 없음)");
}

// 초소형 chat 1회 — 404=단종 즉시 탈락, 429/5xx 는 3회 재시도 후 탈락.
async function probeModel(model: string, apiKey: string): Promise<ProbeResult> {
  let reason = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * attempt);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${GEMINI_OPENAI_ENDPOINT}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      reason = `network: ${errMsg(e)}`;
      continue;
    }
    if (res.ok) return { model, alive: true, latencyMs: Date.now() - t0 };
    reason = `HTTP ${res.status}`;
    if (res.status === 404) return { model, alive: false, reason: "404 — 단종/미존재" };
    if (res.status !== 429 && res.status < 500) break;
  }
  return { model, alive: false, reason: `${reason} 지속` };
}

async function runWiki(models: string[], raw: RawOutput[]): Promise<void> {
  const caseIds = readdirSync(WIKI_FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  for (const caseId of caseIds) {
    const fx = JSON.parse(readFileSync(join(WIKI_FIXTURES, `${caseId}.json`), "utf-8")) as WikiFixture;
    const expected = JSON.parse(readFileSync(join(WIKI_EXPECTED, `${caseId}.expected.json`), "utf-8")) as WikiExpected;
    for (const model of models) {
      const base = {
        task: "wiki" as AbTask,
        caseId,
        caseTitle: fx.title,
        inputPreview: fx.input.sourceText.slice(0, PREVIEW_CHARS),
        model,
      };
      process.stdout.write(`  [wiki] ${caseId} × ${model} ... `);
      const t0 = Date.now();
      try {
        const provider = new GeminiProvider({ config: { model } });
        const result = await provider.generateWikiStructured(fx.input);
        const latencyMs = Date.now() - t0;
        const v = validateLlmWikiResult(result);
        const outcome = assertCase(result, expected, v.valid);
        raw.push({
          ...base,
          ok: true,
          latencyMs,
          wiki: { result, rulePasses: outcome.passes, ruleFailures: outcome.failures, ruleWarnings: outcome.warnings },
        });
        console.log(`${outcome.ok ? "✅" : "⚠️ 규칙 위반"} ${latencyMs}ms`);
      } catch (e) {
        raw.push({ ...base, ok: false, latencyMs: Date.now() - t0, error: errMsg(e) });
        console.log(`💥 ${errMsg(e)}`);
      }
      await sleep(CALL_GAP_MS);
    }
  }
}

async function runFeynman(models: string[], apiKey: string, raw: RawOutput[]): Promise<void> {
  for (const caseId of FEYNMAN_CASES) {
    const fx = JSON.parse(readFileSync(join(FEYNMAN_FIXTURES, `${caseId}.json`), "utf-8")) as FeynmanFixture;
    for (const model of models) {
      const rounds: FeynmanRound[] = [];
      const history: Turn[] = [];
      let llmMs = 0;
      let failed: string | undefined;
      process.stdout.write(`  [feynman] ${caseId} × ${model} ... `);
      for (const said of fx.studentSays) {
        history.push({ role: "user", text: said });
        const t0 = Date.now();
        try {
          const probe = await probeExplanation(fx.concept, fx.note, history, apiKey, { model, fetchFn: fetchWithTimeout });
          llmMs += Date.now() - t0;
          history.push({ role: "probe", text: probe.probe });
          rounds.push({ studentSaid: said, probe: probe.probe, targetGap: probe.targetGap });
        } catch (e) {
          llmMs += Date.now() - t0;
          failed = errMsg(e);
          rounds.push({ studentSaid: said, error: failed });
          break; // 라운드 실패 뒤는 의미 없음 (feynman-eval 규약)
        }
        await sleep(CALL_GAP_MS);
      }
      raw.push({
        task: "feynman",
        caseId,
        caseTitle: `${fx.concept} — ${fx.persona}`,
        inputPreview: fx.note.slice(0, PREVIEW_CHARS),
        model,
        ok: !failed,
        latencyMs: llmMs,
        error: failed,
        feynman: { rounds },
      });
      console.log(failed ? `💥 ${failed}` : `✅ ${rounds.length}라운드 ${llmMs}ms`);
    }
  }
}

async function runSummary(models: string[], apiKey: string, raw: RawOutput[]): Promise<void> {
  const files = readdirSync(SUMMARY_FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of files) {
    const fx = JSON.parse(readFileSync(join(SUMMARY_FIXTURES, file), "utf-8")) as SummaryFixture;
    for (const model of models) {
      const base = {
        task: "pdfsummary" as AbTask,
        caseId: fx.id,
        caseTitle: fx.title,
        inputPreview: fx.sourceText.slice(0, PREVIEW_CHARS),
        model,
      };
      process.stdout.write(`  [pdfsummary] ${fx.id} × ${model} ... `);
      const t0 = Date.now();
      try {
        const r = await runPdfSummary({ sourceTitle: fx.title, sourceText: fx.sourceText }, apiKey, { model });
        const latencyMs = Date.now() - t0;
        raw.push({ ...base, ok: true, latencyMs, summaryMarkdown: r.markdown });
        console.log(`✅ ${latencyMs}ms${r.warning ? ` (${r.warning})` : ""}`);
      } catch (e) {
        raw.push({ ...base, ok: false, latencyMs: Date.now() - t0, error: errMsg(e) });
        console.log(`💥 ${errMsg(e)}`);
      }
      await sleep(CALL_GAP_MS);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.error("GEMINI_API_KEY 필요 (.env — CLI 규약. 앱의 localStorage 키와 별개)");
    process.exit(2);
  }

  if (args.includes("--list")) return listModels(apiKey);

  const models = (get("--models") ?? DEFAULT_MODELS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const only = get("--task") as AbTask | undefined;
  if (only && !TASKS.includes(only)) {
    console.error(`알 수 없는 task: ${only} (${TASKS.join(" | ")})`);
    process.exit(2);
  }

  console.log(`\n=== 모델 A/B — 후보: ${models.join(", ")} ===\n\n[1/3] 가용성 프로브`);
  const probe: ProbeResult[] = [];
  for (const m of models) {
    const p = await probeModel(m, apiKey);
    probe.push(p);
    console.log(`  ${p.alive ? "✅" : "❌"} ${m}${p.alive ? ` ${p.latencyMs}ms` : ` — ${p.reason}`}`);
  }
  const alive = probe.filter((p) => p.alive).map((p) => p.model);
  if (alive.length < 2) {
    console.error(`\n생존 모델 ${alive.length}개 — A/B 비교 무의미. 종료.`);
    process.exit(1);
  }

  console.log(`\n[2/3] 생성 — 케이스 × ${alive.length}모델 순차 호출`);
  const raw: RawOutput[] = [];
  if (!only || only === "wiki") await runWiki(alive, raw);
  if (!only || only === "feynman") await runFeynman(alive, apiKey, raw);
  if (!only || only === "pdfsummary") await runSummary(alive, apiKey, raw);

  console.log("\n[3/3] 리포트 생성");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(AB_DIR, "results", runId);
  mkdirSync(join(runDir, "raw"), { recursive: true });
  for (const r of raw) {
    writeFileSync(join(runDir, "raw", `${r.task}-${r.caseId}-${r.model}.json`), JSON.stringify(r, null, 2), "utf-8");
  }
  const data = buildReportData(runId, alive, probe, raw, mulberry32(Date.now() >>> 0));
  const htmlPath = join(runDir, "report.html");
  writeFileSync(htmlPath, renderReportHtml(data), "utf-8");
  console.log(`\n판정 리포트: ${htmlPath}\n브라우저로 열어 블라인드 판정 → 개봉 → (선택) verdicts JSON 저장.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
