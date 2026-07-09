// 파인만 되묻기(probe) 행동 품질 eval 러너. 실행: `npm run eval:feynman -- --all`
//   npm run eval:feynman -- --case trap-wrong-fact
//   npm run eval:feynman -- --all --dry          # LLM judge 생략(cheap check 만)
//   npm run eval:feynman -- --all --repeat 3     # 케이스당 3회 반복(비결정성 표본)
//
// 왜 단위 테스트가 아니라 eval 인가: 프롬프트의 약속(답 금지·판정 금지·구멍 하나)은
// 코드가 아니라 모델의 행동이다. 정답 유출은 스펙트럼(정의 제공 → 답 박힌 유도 질문 →
// 핵심 어휘 힌트)이라 expect() 로 못 잡고, 현실 입력 N개 × 실호출 → 비율로만 말할 수 있다.
// 프롬프트를 고칠 때마다 이 러너를 다시 돌려 회귀를 잡는다.
//
// 구조는 scripts/eval.ts 와 동형: fixtures → src/llm 직호출(재구현 없음) → results JSON.
// 키: process.env.GEMINI_API_KEY (앱과 달리 CLI 는 env — embeddings.ts 와 동일 규약).

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { probeExplanation, type Probe, type Turn } from "../src/llm/feynman";
import { extractChatJson, GEMINI_OPENAI_ENDPOINT } from "../src/llm/gemini";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_DIR = join(ROOT, "docs/30-llm/evals/feynman");
const FIXTURES_DIR = join(EVAL_DIR, "fixtures");
const RESULTS_DIR = join(EVAL_DIR, "results");

// ── fixture 스키마 ──────────────────────────────────────────
type Fixture = {
  id: string;
  persona: string; // 어떤 학생 행동 유형인가
  concept: string;
  note: string; // 원본 노트 (파편 톤)
  studentSays: string[]; // 라운드별 학생 설명 — 각 라운드 뒤 probe 가 붙는다
  whyHard: string; // 이 케이스가 모델을 어떻게 함정에 빠뜨리는가
};

// ── cheap checks — LLM 없이 코드로 잡는 층 ─────────────────────
type CheapFlags = {
  korean: boolean; // 한국어인가
  oneQuestion: boolean; // 물음표 ≥1, 문장 ≤2 (한 번에 하나만)
  short: boolean; // 200자 이하
  judgmentWords: string | null; // 판정 어휘 발견 시 그 단어 (오탐 가능 → judge 가 확정)
  thirdPerson: string | null; // 사용자를 3인칭으로 부름 ("학생은…") — 존댓말 2인칭이어야 한다
};

const JUDGMENT_RE = /(잘하셨|잘 이해|훌륭|충분(히|한|합)|부족(한|합|해)|완벽(히|한|합)|정확(히|하게) (이해|설명)|맞(아요|습니다|게 이해)|틀렸)/;
// 사용자를 향해 말해야 한다. "학생" 은 어떤 형태로도 쓰면 안 된다
// ("학생의 단어로", "학생분께서" 모두 어색하다) → 단어 자체를 금지.
const THIRD_PERSON_RE = /학생/;

function cheapCheck(probe: string): CheapFlags {
  const sentences = probe.split(/[.!?…]+/).filter((s) => s.trim().length > 0);
  return {
    korean: /[가-힣]/.test(probe),
    oneQuestion: (probe.match(/[?？]/g)?.length ?? 0) >= 1 && sentences.length <= 2,
    short: probe.length <= 200,
    judgmentWords: JUDGMENT_RE.exec(probe)?.[0] ?? null,
    thirdPerson: THIRD_PERSON_RE.exec(probe)?.[0] ?? null,
  };
}

// ── LLM-as-judge — 유출·판정은 스펙트럼이라 기계 판정이 필요한 층 ──
// 판정자가 관대해지는 것을 막는 장치: (1) 근거 인용 강제 (2) "의심스러우면 유출로 본다" 명시
// (3) 유출을 4단계 스펙트럼으로 강제 분류 — none 으로 도망가기 어렵게.
type Verdict = {
  answerLeak: "none" | "hint" | "partial" | "full";
  answerLeakEvidence: string;
  judged: boolean; // 충분/부족/잘함 판정 발화
  judgedEvidence: string;
  multiGap: boolean; // 구멍을 둘 이상 짚음
};

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answerLeak", "answerLeakEvidence", "judged", "judgedEvidence", "multiGap"],
  properties: {
    answerLeak: { type: "string", enum: ["none", "hint", "partial", "full"] },
    answerLeakEvidence: { type: "string" },
    judged: { type: "boolean" },
    judgedEvidence: { type: "string" },
    multiGap: { type: "boolean" },
  },
} as const;

const JUDGE_SYSTEM = [
  "You audit a Feynman-tutor's probe question. The tutor must NEVER reveal the answer.",
  "Classify answerLeak on a strict spectrum:",
  "- full: the probe states the definition/mechanism of the concept (even partially rephrased).",
  "- partial: the probe is a question but the correct explanation is embedded in it (e.g. '~때문 아닐까요?').",
  "- hint: the probe injects key technical vocabulary that appears NOWHERE in the student's explanation",
  "  or in their own note, steering them to the answer. Quoting a term the student themselves wrote",
  "  (in the explanation OR the note) and asking them to define it is NOT a hint — that is the intended behavior.",
  "- none: the probe only points at a gap in the STUDENT's own words.",
  "When in doubt between two levels, choose the MORE severe one. Quote the exact offending words in answerLeakEvidence (empty string only when none).",
  "judged=true if the probe evaluates the student (good/enough/lacking/correct/wrong). Quote in judgedEvidence.",
  "multiGap=true if the probe asks about two or more distinct gaps.",
  "Respond ONLY with JSON conforming to the schema.",
].join("\n");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// judge 도 503 을 맞는다 — 판정 실패는 지표를 갉아먹으므로 probeExplanation 과 같은 규약으로 재시도.
async function judgeProbe(concept: string, note: string, studentSaid: string, probe: string, apiKey: string): Promise<Verdict> {
  const body = JSON.stringify({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    temperature: 0,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      // 노트를 함께 넘긴다 — 학생이 자기 노트에 쓴 용어를 인용하는 것은 hint 가 아니다.
      { role: "user", content: JSON.stringify({ concept, studentNote: note, student: studentSaid, probe }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "Verdict", strict: false, schema: JUDGE_SCHEMA } },
  });
  let last = "";
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(250 * 2 ** (attempt - 1));
    const res = await fetchWithTimeout(`${GEMINI_OPENAI_ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body,
    });
    if (res.ok) {
      const v = extractChatJson(await res.json()) as Verdict | null;
      if (v?.answerLeak) return v;
      last = "no structured output";
      continue;
    }
    last = `HTTP ${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(`judge: ${last}`);
}

// probeExplanation 은 타임아웃이 없다 — eval 은 걸려도 전체가 멈추면 안 되므로 여기서 감싼다.
const fetchWithTimeout = ((url: string, init: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })) as typeof fetch;

// ── 러너 ────────────────────────────────────────────────────
type RoundResult = {
  round: number;
  studentSaid: string;
  probe?: Probe;
  latencyMs?: number;
  error?: string;
  cheap?: CheapFlags;
  verdict?: Verdict | { error: string };
};

type CaseResult = { id: string; persona: string; concept: string; rounds: RoundResult[] };

async function runCase(fx: Fixture, apiKey: string, dry: boolean): Promise<CaseResult> {
  const rounds: RoundResult[] = [];
  const history: Turn[] = [];
  for (let i = 0; i < fx.studentSays.length; i++) {
    const said = fx.studentSays[i];
    history.push({ role: "user", text: said });
    const t0 = Date.now();
    try {
      const probe = await probeExplanation(fx.concept, fx.note, history, apiKey, { fetchFn: fetchWithTimeout });
      const latencyMs = Date.now() - t0;
      history.push({ role: "probe", text: probe.probe });
      const r: RoundResult = { round: i + 1, studentSaid: said, probe, latencyMs, cheap: cheapCheck(probe.probe) };
      if (!dry) {
        try {
          r.verdict = await judgeProbe(fx.concept, fx.note, said, probe.probe, apiKey);
        } catch (e) {
          r.verdict = { error: String(e) };
        }
      }
      rounds.push(r);
    } catch (e) {
      // 스키마 실패·HTTP 오류도 지표다 — 기록하고 다음 라운드는 의미 없으니 중단.
      rounds.push({ round: i + 1, studentSaid: said, error: String(e) });
      break;
    }
  }
  return { id: fx.id, persona: fx.persona, concept: fx.concept, rounds };
}

// ── 집계 — 대회 Q&A 에서 숫자로 답할 지표 ───────────────────────
function aggregate(results: CaseResult[], dry: boolean) {
  const all = results.flatMap((c) => c.rounds);
  const ok = all.filter((r) => r.probe);
  const verdicts = ok.map((r) => r.verdict).filter((v): v is Verdict => !!v && !("error" in v));
  const leak = (lv: Verdict["answerLeak"]) => verdicts.filter((v) => v.answerLeak === lv).length;
  const lat = ok.map((r) => r.latencyMs!).sort((a, b) => a - b);
  return {
    probes: all.length,
    schemaOrHttpFail: all.length - ok.length,
    judgeFail: dry ? 0 : ok.length - verdicts.length, // dry 는 judge 를 안 부른다 — 거짓 경보 금지
    answerLeak: { full: leak("full"), partial: leak("partial"), hint: leak("hint"), none: leak("none") },
    judged: verdicts.filter((v) => v.judged).length,
    multiGap: verdicts.filter((v) => v.multiGap).length,
    cheapFlags: {
      notKorean: ok.filter((r) => !r.cheap!.korean).length,
      notOneQuestion: ok.filter((r) => !r.cheap!.oneQuestion).length,
      tooLong: ok.filter((r) => !r.cheap!.short).length,
      judgmentWords: ok.filter((r) => r.cheap!.judgmentWords).length,
      thirdPerson: ok.filter((r) => r.cheap!.thirdPerson).length,
    },
    latencyMs: lat.length ? { p50: lat[Math.floor(lat.length / 2)], max: lat[lat.length - 1] } : null,
  };
}

// 합격선 — 이 수치를 깨면 프롬프트 회귀다. (docs/30-llm/evals.md 관례에 맞춰 러너가 exit 1)
function gate(agg: ReturnType<typeof aggregate>): string[] {
  const fails: string[] = [];
  if (agg.answerLeak.full > 0) fails.push(`답 유출 full ${agg.answerLeak.full}건 — 허용 0`);
  if (agg.answerLeak.partial > 0) fails.push(`답 유출 partial ${agg.answerLeak.partial}건 — 허용 0`);
  const judgedTotal = agg.probes - agg.schemaOrHttpFail - agg.judgeFail;
  if (judgedTotal > 0 && agg.answerLeak.hint / judgedTotal > 0.1)
    fails.push(`답 유출 hint ${agg.answerLeak.hint}/${judgedTotal} — 허용 ≤10%`);
  if (agg.judged > 0) fails.push(`판정 발화 ${agg.judged}건 — 허용 0`);
  if (agg.probes > 0 && agg.schemaOrHttpFail / agg.probes > 0.02)
    fails.push(`스키마/HTTP 실패 ${agg.schemaOrHttpFail}/${agg.probes} — 허용 ≤2%`);
  // "구멍 하나만" 은 프롬프트의 약속이다. 측정만 하고 안 막으면 회귀한다.
  if (judgedTotal > 0 && agg.multiGap / judgedTotal > 0.1)
    fails.push(`구멍 2개 이상 ${agg.multiGap}/${judgedTotal} — 허용 ≤10%`);
  if (agg.cheapFlags.thirdPerson > 0) fails.push(`3인칭 호칭("학생은…") ${agg.cheapFlags.thirdPerson}건 — 허용 0`);
  return fails;
}

// ── CLI ─────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const repeat = Math.max(1, Number(args[args.indexOf("--repeat") + 1]) || 1);
  const caseId = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;

  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.error("GEMINI_API_KEY 필요 — 되묻기는 실제 모델 행동이 테스트 대상이다.");
    process.exit(2);
  }

  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  let fixtures = files.map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as Fixture);
  if (caseId) fixtures = fixtures.filter((f) => f.id === caseId);
  if (!fixtures.length) {
    console.error(caseId ? `케이스 없음: ${caseId}` : "fixtures 비어 있음");
    process.exit(2);
  }

  const probeCalls = fixtures.reduce((n, f) => n + f.studentSays.length, 0) * repeat;
  const judgeCalls = dry ? 0 : probeCalls;
  console.log(`케이스 ${fixtures.length} × ${repeat}회 → probe ${probeCalls}콜 + judge ${judgeCalls}콜 (gemini-2.5-flash)\n`);

  const results: CaseResult[] = [];
  for (let rep = 0; rep < repeat; rep++) {
    for (const fx of fixtures) {
      const r = await runCase(fx, apiKey, dry);
      results.push(r);
      for (const round of r.rounds) {
        const v = round.verdict && !("error" in round.verdict) ? round.verdict : null;
        const mark = round.error ? "💥" : v?.answerLeak === "full" || v?.answerLeak === "partial" ? "❌" : v?.answerLeak === "hint" ? "⚠️" : "✅";
        console.log(
          `${mark} [${fx.id} r${round.round}] ${round.error ?? `${round.probe!.probe} (${round.probe!.targetGap}, ${round.latencyMs}ms${v ? `, leak=${v.answerLeak}${v.judged ? ", JUDGED" : ""}` : ""})`}`,
        );
      }
    }
  }

  const agg = aggregate(results, dry);
  const fails = dry ? [] : gate(agg);
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(RESULTS_DIR, `run-${stamp}${dry ? "-dry" : ""}.json`);
  writeFileSync(outPath, JSON.stringify({ dry, repeat, aggregate: agg, gateFails: fails, results }, null, 2));

  console.log("\n== 집계 ==");
  console.log(JSON.stringify(agg, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
  if (fails.length) {
    console.error("\n== 게이트 실패 ==");
    for (const f of fails) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(dry ? "\n(dry — judge 생략, 게이트 미적용)" : "\n게이트 통과 ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
