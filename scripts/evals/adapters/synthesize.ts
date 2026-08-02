// synthesize eval — 합성 요약의 최악은 환각(원문에 없는 주장)이다.
// keyPoints 재현율은 코드로 세고(cheap), 환각은 근거 인용을 강제한 judge 가 본다.
// 별도 지표: heuristicSynthesis 폴백이 채택되면 그것만으로 회귀다(품질 다운그레이드 이력).
// runSynthesis 는 키가 없으면 throw 하지 않고 휴리스틱 결과를 돌려준다 — 그대로 두면
// 키 없이 돌린 실행이 runFailed 0 으로 조용히 통과한다. heuristicFallback 을 게이트로 막는다.
import { join } from "node:path";
import { runSynthesis, type SynthesisInput } from "../../../src/llm/synthesize";
import { judgeJson } from "../judge";
import type { EvalAdapter, Metrics, Sample } from "../core";

type Fixture = { id: string; input: SynthesisInput; keyPoints: string[]; absentFacts: string[]; whyHard: string };
type Out = {
  markdown: string;
  engine: "gemini" | "heuristic";
  keyPointHits: number;
  absentHits: string[];
  hasHeading: boolean;
  korean: boolean;
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
      korean: /[가-힣]/.test(md),
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
    { metric: "notKorean", op: "<=", threshold: 0, label: "한국어 아님 0건" },
    { metric: "noHeading", op: "<=", threshold: 0, label: "헤딩 없는 출력 0건" },
    { metric: "keyPointRecall", op: ">=", threshold: 0.8, label: "핵심포인트 재현율 ≥ 0.8 (잠정)" },
    { metric: "hallucination", op: "<=", threshold: 0, label: "환각 0건 (잠정)" },
    { metric: "contradiction", op: "<=", threshold: 0, label: "원문 모순 0건 (잠정)" },
    { metric: "judgeFail", op: "<=", threshold: 0, label: "judge 실패 0건" },
  ],
};

export default adapter;
