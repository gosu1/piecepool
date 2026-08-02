// eval 러너 CLI. 실행:
//   npm run eval:chunk                 # 어댑터 하나
//   npm run eval:chunk -- --dry        # judge(LLM-as-judge) 호출만 생략 — 대상 모델 호출은 그대로 나간다
//   npm run eval:chunk -- --case <id>  # fixture 하나
//   npm run eval:all                   # 전체 어댑터
//   npm run eval:llm -- --adapter generate --model gemini-3.1-flash-lite   # 모델 축을 바꿔 비교
//   npm run eval:llm -- --adapter generate --base-url http://localhost:1234/v1
// 게이트가 깨지면 exit 1 (scripts/feynman-eval.ts 와 같은 규약).

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GEMINI_MODEL, GEMINI_OPENAI_ENDPOINT } from "../../src/llm/gemini";
import { resolveJudgeModel } from "./judge";
import { evaluateGates, type EvalAdapter, type Metrics, type RunCtx, type Sample } from "./core";
import { ADAPTERS } from "./registry";

export interface RunReport {
  id: string;
  dry: boolean;
  // 어느 모델·엔드포인트로 잰 baseline 인지가 없으면 다른 실행과 비교할 근거가 없다.
  // 모델을 호출하지 않는 어댑터(chunk·classify·dedupConcepts)는 null.
  model: string | null;
  baseUrl: string | null;
  judgeModel: string | null; // subject 와 별개 축 — judge.ts 주석 참조
  metrics: Metrics;
  gateFails: string[];
  samples: Sample<any, any>[];
  runAt: string;
}

export function loadFixtures<F>(dir: string, caseId?: string): F[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const all = files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as F);
  if (!caseId) return all;
  return all.filter((f) => (f as { id?: string }).id === caseId);
}

export async function runAdapter<F, O>(
  adapter: EvalAdapter<F, O>,
  ctx: RunCtx,
  opts: { caseId?: string; onSample?: (s: Sample<F, O>) => void },
): Promise<RunReport> {
  const fixtures = loadFixtures<F>(adapter.fixturesDir, opts.caseId);
  const samples: Sample<F, O>[] = [];
  for (const fixture of fixtures) {
    const t0 = Date.now();
    try {
      const out = await adapter.run(fixture, ctx);
      samples.push({ fixture, out, latencyMs: Date.now() - t0 });
    } catch (e) {
      // 실행 실패도 지표다 — 기록하고 다음 fixture 로 간다.
      samples.push({ fixture, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 });
    }
    opts.onSample?.(samples[samples.length - 1]);
  }
  const metrics = await adapter.metrics(samples, ctx);
  // 모델을 안 부르는 어댑터에 모델명을 적으면 결과 JSON 이 거짓말을 한다.
  const callsModel = adapter.needsApiKey;
  return {
    id: adapter.id,
    dry: ctx.dry,
    model: callsModel ? ctx.model ?? adapter.defaultModel ?? GEMINI_MODEL : null,
    baseUrl: callsModel ? ctx.baseUrl ?? GEMINI_OPENAI_ENDPOINT : null,
    judgeModel: callsModel ? resolveJudgeModel(ctx.judgeModel) : null,
    metrics,
    gateFails: evaluateGates(metrics, adapter.gates, ctx.dry),
    samples,
    runAt: new Date().toISOString(),
  };
}

function resultsDir(adapterId: string): string {
  return join(process.cwd(), "docs/30-llm/evals", adapterId, "results");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const dry = args.includes("--dry");
  const caseId = flag("--case");
  const all = args.includes("--all");
  const which = flag("--adapter");

  // 측정 축. CLI > env > undefined(각 기능 함수의 기본값). undefined 를 유지하는 것이 중요하다 —
  // 여기서 기본값을 채워 넣으면 pdfsummary 의 lite 고정 같은 기능별 기본값을 덮어쓴다.
  const model = flag("--model") || process.env.PIECEPOOL_LLM_MODEL || undefined;
  const baseUrl = flag("--base-url") || process.env.PIECEPOOL_LLM_BASE_URL || undefined;
  // 심판은 subject 를 따라가지 않는다 — model 을 여기 흘려보내지 않는 것이 그 분리 지점이다.
  const judgeModel = flag("--judge-model") || process.env.PIECEPOOL_JUDGE_MODEL || undefined;

  const ids = all ? Object.keys(ADAPTERS).sort() : which ? [which] : [];
  if (!ids.length) {
    console.error(
      "사용법: --adapter <id> [--case <id>] [--dry] [--model <name>] [--base-url <url>] [--judge-model <name>] | --all [--dry]",
    );
    console.error(`등록된 어댑터: ${Object.keys(ADAPTERS).sort().join(", ") || "(없음)"}`);
    process.exit(2);
  }

  const apiKey = process.env.GEMINI_API_KEY || "";
  let anyFail = false;

  for (const id of ids) {
    const load = ADAPTERS[id];
    if (!load) {
      console.error(`알 수 없는 어댑터: ${id}`);
      process.exit(2);
    }
    const adapter = await load();
    // --dry 는 judge 만 생략한다 — 대상 모델 호출은 그대로 나가므로 키 요구를 면제하지 않는다.
    // (전에는 !dry 조건이 붙어 있어, 키 없이 --dry 를 돌리면 "싸게 스모크" 인 줄 알고
    //  어댑터마다 제각각인 auth 실패를 보게 됐다.)
    if (adapter.needsApiKey && !apiKey) {
      console.error(`[${id}] GEMINI_API_KEY 필요 — 대상 모델 호출이 측정 대상이다. --dry 도 대상 호출은 나간다(judge 만 생략).`);
      process.exit(2);
    }

    console.log(`\n=== ${id} ${dry ? "(dry)" : ""} ===`);
    const report = await runAdapter(adapter, { dry, apiKey, model, baseUrl, judgeModel }, {
      caseId,
      onSample: (s) => console.log(`  ${s.error ? "💥" : "·"} ${(s.fixture as { id?: string }).id ?? "?"}${s.error ? ` ${s.error}` : ""} (${s.latencyMs}ms)`),
    });

    const dir = resultsDir(id);
    mkdirSync(dir, { recursive: true });
    const stamp = report.runAt.replace(/[:.]/g, "-");
    writeFileSync(join(dir, `run-${stamp}${dry ? "-dry" : ""}.json`), JSON.stringify(report, null, 2), "utf-8");

    // 어느 모델로 잰 수치인지 콘솔에서도 바로 보이게 한다 — 모델을 바꿔 돌릴 때 헷갈리면 비교가 무의미하다.
    if (report.model) console.log(`모델: ${report.model} @ ${report.baseUrl} / 심판: ${report.judgeModel}`);
    console.log("지표:", JSON.stringify(report.metrics, null, 2));
    if (report.gateFails.length) {
      anyFail = true;
      console.error("게이트 실패:");
      for (const f of report.gateFails) console.error(`  ✗ ${f}`);
    } else {
      console.log(dry ? "게이트 통과 ✅ (dry — 미산출 지표는 건너뜀)" : "게이트 통과 ✅");
    }
  }

  if (anyFail) process.exit(1);
}

// tsx 직접 실행 시에만 main() — import(테스트) 시에는 실행 안 함. scripts/eval.ts 와 같은 규약.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
