// synthesize eval — 합성 요약의 최악은 환각(원문에 없는 주장)이다.
// keyPoints 재현율은 코드로 세고(cheap), 환각은 근거 인용을 강제한 judge 가 본다.
// 별도 지표: heuristicSynthesis 폴백이 채택되면 그것만으로 회귀다(품질 다운그레이드 이력).
// runSynthesis 는 키가 없으면 throw 하지 않고 휴리스틱 결과를 돌려준다 — 그대로 두면
// 키 없이 돌린 실행이 runFailed 0 으로 조용히 통과한다. heuristicFallback 을 게이트로 막는다.
import { join } from "node:path";
import { runSynthesis, type SynthesisInput } from "../../../src/llm/synthesize";
import { judgeJson } from "../judge";
import { bodyChars, koreanRatio, type EvalAdapter, type Metrics, type Sample } from "../core";

// 핵심포인트당 최소 본문 길이. 핵심어만 나열하고 설명이 0인 목록이 keyPointRecall 1.0 으로
// 전 게이트를 통과한다(적대적 검증에서 실증). 길이는 설명의 하한일 뿐 질을 재지 않는다.
const MIN_CHARS_PER_KEYPOINT = 20;
// 서술 언어. "한글이 한 글자라도 있는가" 는 영어 본문에 용어만 한글로 섞으면 통과한다.
const MIN_KOREAN_RATIO = 0.5;

type Fixture = { id: string; input: SynthesisInput; keyPoints: string[]; absentFacts: string[]; whyHard: string };
type Out = {
  markdown: string;
  engine: "gemini" | "heuristic";
  keyPointHits: number;
  absentHits: string[];
  hasHeading: boolean;
  korean: boolean;
  charsPerKeyPoint: number;
};

type Verdict = { hallucination: boolean; hallucinationEvidence: string; contradiction: boolean; contradictionEvidence: string };

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hallucination", "hallucinationEvidence", "contradiction", "contradictionEvidence"],
  properties: {
    hallucination: { type: "boolean" },
    hallucinationEvidence: { type: "string" },
    contradiction: { type: "boolean" },
    contradictionEvidence: { type: "string" },
  },
} as const;

const JUDGE_SYSTEM = [
  "You audit a study-note synthesis. The synthesis must contain ONLY what the source notes support.",
  "hallucination=true if the synthesis asserts any fact, term, or mechanism that the source notes do not state or entail.",
  "  Rephrasing or reorganizing the source is NOT hallucination. Adding a new technical term the source never mentions IS.",
  "contradiction=true if the synthesis states something the source contradicts.",
  "Quote the exact offending sentence in the matching evidence field (empty string only when the flag is false).",
  "When in doubt, set the flag to true. A lenient auditor makes this metric useless.",
  "Respond ONLY with JSON conforming to the schema.",
].join("\n");

const adapter: EvalAdapter<Fixture, Out> = {
  id: "synthesize",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/synthesize/fixtures"),
  needsApiKey: true,

  async run(fx, ctx) {
    const r = await runSynthesis(fx.input, ctx.apiKey);
    const md = r.markdown;
    return {
      markdown: md,
      engine: r.engine,
      keyPointHits: fx.keyPoints.filter((k) => md.includes(k)).length,
      absentHits: fx.absentFacts.filter((a) => md.includes(a)),
      hasHeading: /^#{1,6}\s/m.test(md),
      korean: koreanRatio(md) >= MIN_KOREAN_RATIO,
      charsPerKeyPoint: fx.keyPoints.length ? bodyChars(md) / fx.keyPoints.length : NaN,
    };
  },

  async metrics(samples: Sample<Fixture, Out>[], ctx): Promise<Metrics> {
    const outs = samples.filter((s) => s.out);
    const keyTotal = samples.reduce((a, s) => a + s.fixture.keyPoints.length, 0);
    const keyHit = outs.reduce((a, s) => a + (s.out!.keyPointHits ?? 0), 0);

    const m: Metrics = {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      heuristicFallback: outs.filter((s) => s.out!.engine !== "gemini").length,
      keyPointRecall: keyTotal ? keyHit / keyTotal : NaN,
      absentFactLeak: outs.reduce((a, s) => a + s.out!.absentHits.length, 0),
      noHeading: outs.filter((s) => !s.out!.hasHeading).length,
      notKorean: outs.filter((s) => !s.out!.korean).length,
      // 케이스별 최소 — 평균으로 재면 설명이 텅 빈 케이스를 긴 케이스가 가린다.
      charsPerKeyPointMin: outs.length ? Math.min(...outs.map((s) => s.out!.charsPerKeyPoint)) : NaN,
    };

    if (ctx.dry) return m; // judge 지표는 만들지 않는다 — 코어가 dry 에서 건너뛴다
    let hallu = 0, contra = 0, judgeFail = 0;
    for (const s of outs) {
      try {
        const v = await judgeJson<Verdict>(
          JUDGE_SYSTEM,
          { sourceNotes: s.fixture.input, synthesis: s.out!.markdown },
          VERDICT_SCHEMA,
          ctx.apiKey,
        );
        if (v.hallucination) hallu++;
        if (v.contradiction) contra++;
      } catch {
        judgeFail++;
      }
    }
    m.hallucination = hallu;
    m.contradiction = contra;
    m.judgeFail = judgeFail;
    return m;
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "heuristicFallback", op: "<=", threshold: 0, label: "휴리스틱 폴백 채택 0건" },
    { metric: "absentFactLeak", op: "<=", threshold: 0, label: "원문에 없는 용어 등장 0건" },
    { metric: "notKorean", op: "<=", threshold: 0, label: `한국어 비율 ${MIN_KOREAN_RATIO} 미만 0건` },
    { metric: "noHeading", op: "<=", threshold: 0, label: "헤딩 없는 출력 0건" },
    {
      metric: "charsPerKeyPointMin",
      op: ">=",
      threshold: MIN_CHARS_PER_KEYPOINT,
      label: `핵심포인트당 본문 ≥ ${MIN_CHARS_PER_KEYPOINT}자 (잠정)`,
    },
    { metric: "keyPointRecall", op: ">=", threshold: 0.8, label: "핵심포인트 재현율 ≥ 0.8 (잠정)" },
    { metric: "hallucination", op: "<=", threshold: 0, label: "환각 0건 (잠정)" },
    { metric: "contradiction", op: "<=", threshold: 0, label: "원문 모순 0건 (잠정)" },
    { metric: "judgeFail", op: "<=", threshold: 0, label: "judge 실패 0건" },
  ],
};

export default adapter;
