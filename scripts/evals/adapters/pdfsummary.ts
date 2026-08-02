// pdfsummary eval — 섹션 재현율·수식 보존·환각을 본다.
// 번역 요약이라 원문 용어(알고리즘 이름·수식 기호)는 그대로 남아야 하고, 내용은 한국어여야 한다.
// 실제 시그니처: runPdfSummary(input, apiKey?, opts?) → PdfSummaryResult{markdown, truncated, warning?}
// (src/llm/pdfsummary.ts). 키가 없으면 throw 한다 — 오프라인 폴백이 없어 runFailed 로 잡힌다.
import { join } from "node:path";
import { runPdfSummary, type PdfSummaryInput } from "../../../src/llm/pdfsummary";
import { judgeJson } from "../judge";
import { bodyChars, koreanRatio, type EvalAdapter, type Metrics, type Sample } from "../core";

// 절당 최소 본문 길이. 절 제목과 용어만 나열한 덤프가 sectionRecall·termRecall 1.0 으로
// 전 게이트를 통과한다(적대적 검증에서 실증). 길이는 하한일 뿐 요약의 질을 재지 않는다.
const MIN_CHARS_PER_SECTION = 25;
// 서술 언어. 원문 용어·절 제목을 영문으로 보존하는 것이 요구사항이라 라틴 문자 비중이
// 구조적으로 높다 — 그래서 synthesize(0.5)보다 낮게 잡는다. 실측: 정상 요약 0.61, 용어 덤프 0.05.
const MIN_KOREAN_RATIO = 0.4;

type Fixture = {
  id: string;
  input: PdfSummaryInput;
  expectSections: string[];
  expectTerms: string[];
  absentFacts: string[];
  expectFormula: string;
  whyHard: string;
};

type Out = {
  markdown: string;
  sectionHits: number;
  termHits: number;
  absentHits: string[];
  formulaKept: boolean;
  korean: boolean;
  truncated: boolean;
  charsPerSection: number;
};

type Verdict = { hallucination: boolean; hallucinationEvidence: string };

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hallucination", "hallucinationEvidence"],
  properties: { hallucination: { type: "boolean" }, hallucinationEvidence: { type: "string" } },
} as const;

const JUDGE_SYSTEM = [
  "You audit a Korean summary of an English source document.",
  "hallucination=true if the summary asserts any fact, term, or number the source does not state.",
  "Translation and condensation are NOT hallucination. Introducing a concept absent from the source IS.",
  "Quote the exact offending sentence in hallucinationEvidence (empty string only when false).",
  "When in doubt, set hallucination=true. A lenient auditor makes this metric useless.",
  "Respond ONLY with JSON conforming to the schema.",
].join("\n");

const adapter: EvalAdapter<Fixture, Out> = {
  id: "pdfsummary",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/pdfsummary/fixtures"),
  needsApiKey: true,

  async run(fx, ctx) {
    const r = await runPdfSummary(fx.input, ctx.apiKey);
    const md = r.markdown;
    return {
      markdown: md,
      sectionHits: fx.expectSections.filter((s) => md.includes(s)).length,
      termHits: fx.expectTerms.filter((t) => md.includes(t)).length,
      absentHits: fx.absentFacts.filter((a) => md.includes(a)),
      formulaKept: md.includes(fx.expectFormula),
      korean: koreanRatio(md) >= MIN_KOREAN_RATIO,
      truncated: r.truncated,
      charsPerSection: fx.expectSections.length ? bodyChars(md) / fx.expectSections.length : NaN,
    };
  },

  async metrics(samples: Sample<Fixture, Out>[], ctx): Promise<Metrics> {
    const outs = samples.filter((s) => s.out);
    const secTotal = samples.reduce((a, s) => a + s.fixture.expectSections.length, 0);
    const termTotal = samples.reduce((a, s) => a + s.fixture.expectTerms.length, 0);

    const m: Metrics = {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      sectionRecall: secTotal ? outs.reduce((a, s) => a + s.out!.sectionHits, 0) / secTotal : NaN,
      termRecall: termTotal ? outs.reduce((a, s) => a + s.out!.termHits, 0) / termTotal : NaN,
      absentFactLeak: outs.reduce((a, s) => a + s.out!.absentHits.length, 0),
      formulaBroken: outs.filter((s) => !s.out!.formulaKept).length,
      notKorean: outs.filter((s) => !s.out!.korean).length,
      unexpectedTruncation: outs.filter((s) => s.out!.truncated).length,
      // 케이스별 최소 — 평균은 내용 없는 케이스를 긴 케이스로 덮는다.
      charsPerSectionMin: outs.length ? Math.min(...outs.map((s) => s.out!.charsPerSection)) : NaN,
    };

    if (ctx.dry) return m;
    let hallu = 0, judgeFail = 0;
    for (const s of outs) {
      try {
        const v = await judgeJson<Verdict>(
          JUDGE_SYSTEM,
          { source: s.fixture.input, summary: s.out!.markdown },
          VERDICT_SCHEMA,
          ctx.apiKey,
        );
        if (v.hallucination) hallu++;
      } catch {
        judgeFail++;
      }
    }
    m.hallucination = hallu;
    m.judgeFail = judgeFail;
    return m;
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "absentFactLeak", op: "<=", threshold: 0, label: "원문에 없는 용어 등장 0건" },
    { metric: "formulaBroken", op: "<=", threshold: 0, label: "수식 기호 유실 0건" },
    { metric: "notKorean", op: "<=", threshold: 0, label: `한국어 비율 ${MIN_KOREAN_RATIO} 미만 0건` },
    { metric: "unexpectedTruncation", op: "<=", threshold: 0, label: "예상치 못한 잘림 0건" },
    {
      metric: "charsPerSectionMin",
      op: ">=",
      threshold: MIN_CHARS_PER_SECTION,
      label: `절당 본문 ≥ ${MIN_CHARS_PER_SECTION}자 (잠정)`,
    },
    { metric: "sectionRecall", op: ">=", threshold: 0.8, label: "섹션 재현율 ≥ 0.8 (잠정)" },
    { metric: "termRecall", op: ">=", threshold: 0.8, label: "용어 재현율 ≥ 0.8 (잠정)" },
    { metric: "hallucination", op: "<=", threshold: 0, label: "환각 0건 (잠정)" },
    { metric: "judgeFail", op: "<=", threshold: 0, label: "judge 실패 0건" },
  ],
};

export default adapter;
