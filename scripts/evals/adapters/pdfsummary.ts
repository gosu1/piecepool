// pdfsummary eval — 섹션 재현율·수식 보존·콜아웃 형식·환각·스트리밍 지연을 본다.
// 번역 요약이라 원문 용어(알고리즘 이름·수식 기호)는 그대로 남아야 하고, 내용은 한국어여야 한다.
// 실제 시그니처: runPdfSummary(input, apiKey?, opts?) → PdfSummaryResult{markdown, truncated, warning?}
// (src/llm/pdfsummary.ts). 키가 없으면 throw 한다 — 오프라인 폴백이 없어 runFailed 로 잡힌다.
import { join } from "node:path";
import { GEMINI_SUMMARY_MODEL } from "../../../src/llm/gemini";
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
  // 입력이 SUMMARY_MAX_CHARS 를 넘어 잘리는 것이 **정상**인 케이스만 true.
  // 미지정 = false = 잘리면 안 된다(기존 fixture 의 게이트 의미 유지).
  expectTruncated?: boolean;
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
  truncationMismatch: boolean; // 기대(expectTruncated)와 실제가 다른가
  charsPerSection: number;
  calloutSections: number; // 출력의 `## ` 섹션 수
  calloutCompliant: number; // 그중 [!easy] 콜아웃 형식을 지킨 섹션 수
  ttftMs: number; // 첫 delta 까지 (스트리밍 미수신이면 NaN)
  totalMs: number; // 호출 시작 → 완료
};

// ── 콜아웃 형식 준수 ─────────────────────────────────────
// 프롬프트(src/llm/pdfsummary.ts SYSTEM_PROMPT §5)는 "모든 `##` 섹션마다 예외 없이" 마지막에
// `[!easy]` 콜아웃을 넣고 "콜아웃의 모든 줄은 `> ` 로 시작" 하라고 요구한다. 이 지표는 그 준수율이다.
//
// 판정 규칙(README 에 같은 문구로 적혀 있다):
//  1. 섹션 안에 `> [!easy]` 헤더 줄이 있어야 한다.
//  2. 그 헤더 줄부터 섹션 끝(뒤쪽 빈 줄 제외)까지 **모든 줄**이 인용 줄이어야 한다.
//     콜아웃은 섹션 마지막에 오므로, 도중에 인용 접두사가 끊기면 위반이다.
//  3. 헤더 말고 내용이 있는 인용 줄이 최소 1줄 있어야 한다(헤더만 찍는 우회 차단).
// 인용 줄 = `>` + (공백 | 줄끝). 빈 줄을 `>` 하나로만 쓰는 것은 실제 출력의 정상 형태라 허용한다.
// 선행 공백 3칸까지는 CommonMark 가 같은 인용문으로 렌더링하므로 허용한다.
const QUOTE_LINE = /^ {0,3}>( |$)/;
const EASY_HEADER = /^ {0,3}> *\[!easy\]/;
const H2 = /^## \S/;
const ANY_HEADING = /^#{1,6} /;

export function calloutStats(md: string): { sections: number; compliant: number } {
  const lines = md.split(/\r?\n/);
  const sections: string[][] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    if (H2.test(line)) {
      cur = [];
      sections.push(cur);
    } else if (ANY_HEADING.test(line)) {
      cur = null; // `#`/`###` 헤딩은 `##` 섹션을 닫는다 (콜아웃 안의 `> #### ...` 는 인용이라 여기 안 걸린다)
    } else {
      cur?.push(line);
    }
  }
  const compliant = sections.filter(isCalloutCompliant).length;
  return { sections: sections.length, compliant };
}

function isCalloutCompliant(sectionLines: string[]): boolean {
  const start = sectionLines.findIndex((l) => EASY_HEADER.test(l));
  if (start === -1) return false;
  let end = sectionLines.length;
  while (end > start + 1 && sectionLines[end - 1].trim() === "") end--; // 섹션 뒤쪽 빈 줄은 콜아웃 밖
  const block = sectionLines.slice(start, end);
  if (!block.every((l) => QUOTE_LINE.test(l))) return false;
  return block.slice(1).some((l) => l.replace(/^ {0,3}> ?/, "").trim() !== "");
}

const finite = (xs: number[]): number[] => xs.filter((x) => Number.isFinite(x));
const maxOf = (xs: number[]): number => (xs.length ? Math.max(...xs) : NaN);

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
  // 이 기능만 프로덕션에서 lite 모델 고정(속도)이다 — 결과 JSON 에 그대로 기록하기 위해 선언한다.
  // --model 을 주면 그 값이 우선한다(모델 축 비교용).
  defaultModel: GEMINI_SUMMARY_MODEL,

  async run(fx, ctx) {
    // 스트리밍 지연. 이 기능은 결과가 delta 로 화면에 흘러나오므로 "첫 글자까지"가 사용자 체감이고
    // (PIE-45 측정 항목), 완료 시간은 별개다. run.ts 의 latencyMs 로는 둘을 못 가른다.
    const t0 = Date.now();
    let firstDeltaAt = 0;
    const onDelta = () => {
      if (!firstDeltaAt) firstDeltaAt = Date.now();
    };
    // 모델·엔드포인트 축(undefined 면 runPdfSummary 의 기본값 = lite 모델 그대로).
    const r = await runPdfSummary(fx.input, ctx.apiKey, { endpoint: ctx.baseUrl, model: ctx.model, onDelta });
    const md = r.markdown;
    const callout = calloutStats(md);
    return {
      markdown: md,
      sectionHits: fx.expectSections.filter((s) => md.includes(s)).length,
      termHits: fx.expectTerms.filter((t) => md.includes(t)).length,
      absentHits: fx.absentFacts.filter((a) => md.includes(a)),
      formulaKept: md.includes(fx.expectFormula),
      korean: koreanRatio(md) >= MIN_KOREAN_RATIO,
      truncated: r.truncated,
      truncationMismatch: r.truncated !== (fx.expectTruncated ?? false),
      charsPerSection: fx.expectSections.length ? bodyChars(md) / fx.expectSections.length : NaN,
      calloutSections: callout.sections,
      calloutCompliant: callout.compliant,
      // delta 없이 끝나는 경로(스트리밍 미지원 폴백은 1회 전달하므로 여기 안 걸린다)는 NaN.
      ttftMs: firstDeltaAt ? firstDeltaAt - t0 : NaN,
      totalMs: Date.now() - t0,
    };
  },

  async metrics(samples: Sample<Fixture, Out>[], ctx): Promise<Metrics> {
    const outs = samples.filter((s) => s.out);
    const secTotal = samples.reduce((a, s) => a + s.fixture.expectSections.length, 0);
    const termTotal = samples.reduce((a, s) => a + s.fixture.expectTerms.length, 0);
    const calloutTotal = outs.reduce((a, s) => a + s.out!.calloutSections, 0);

    const m: Metrics = {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      sectionRecall: secTotal ? outs.reduce((a, s) => a + s.out!.sectionHits, 0) / secTotal : NaN,
      termRecall: termTotal ? outs.reduce((a, s) => a + s.out!.termHits, 0) / termTotal : NaN,
      absentFactLeak: outs.reduce((a, s) => a + s.out!.absentHits.length, 0),
      formulaBroken: outs.filter((s) => !s.out!.formulaKept).length,
      notKorean: outs.filter((s) => !s.out!.korean).length,
      // "잘렸는가" 가 아니라 "예상과 다르게 잘렸는가". 상한 초과 fixture(expectTruncated:true)는
      // 잘리는 것이 정상이고, 오히려 안 잘리면 상한 계산이 깨진 것이라 양방향 불일치를 다 센다.
      unexpectedTruncation: outs.filter((s) => s.out!.truncationMismatch).length,
      // 케이스별 최소 — 평균은 내용 없는 케이스를 긴 케이스로 덮는다.
      charsPerSectionMin: outs.length ? Math.min(...outs.map((s) => s.out!.charsPerSection)) : NaN,
      // 출력 `##` 섹션 중 [!easy] 콜아웃 형식을 지킨 비율. 섹션이 0개면 NaN → 게이트 실패(코어 규약).
      calloutCompliance: calloutTotal ? outs.reduce((a, s) => a + s.out!.calloutCompliant, 0) / calloutTotal : NaN,
      // 지연은 게이트가 없다 — 로컬 모델 vs Gemini 비교 기록용(PIE-45). 평균이 아니라 최대를 적는다:
      // 스트리밍 UX 에서 사용자가 겪는 것은 평균이 아니라 가장 오래 기다린 케이스다.
      // 케이스별 값은 결과 JSON 의 samples[].out.ttftMs / totalMs 에 그대로 남는다.
      ttftMsMax: maxOf(finite(outs.map((s) => s.out!.ttftMs))),
      totalMsMax: maxOf(finite(outs.map((s) => s.out!.totalMs))),
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
          ctx.judgeModel, // subject(ctx.model)가 아니다 — judge.ts 주석 참조
        );
        // 판정을 케이스에 붙여 둔다(PIE-59). hallucination 이 false 여도 남긴다 —
        // "판정을 받았고 깨끗했다" 와 "판정 자체가 없었다" 는 다른 사실이고,
        // 근거 문장(hallucinationEvidence)이 없으면 게이트가 깨져도 재확인할 것이 없다.
        s.judge = { verdict: v };
        if (v.hallucination) hallu++;
      } catch (e) {
        s.judge = { error: e instanceof Error ? e.message : String(e) };
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
    { metric: "unexpectedTruncation", op: "<=", threshold: 0, label: "예상과 다른 잘림 0건" },
    { metric: "calloutCompliance", op: ">=", threshold: 1, label: "[!easy] 콜아웃 형식 준수율 1.0 (잠정)" },
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
