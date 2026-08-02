// chunk eval — 경계 결정 로직이 측정 대상이다. 임베딩 품질이 아니다.
// fixture 에 고정 벡터를 넣어 모델 호출 없이 결정적으로 돌린다(EmbedFn 주입 구조 그대로 활용).
// 최악의 결함은 문장 유실이다 — 실제로 회귀한 적이 있다(src/llm/chunk.test.ts:61).
import { join } from "node:path";
import { semanticChunk, splitSentences } from "../../../src/llm/chunk";
import { boundaryF1, type EvalAdapter, type Metrics, type Sample } from "../core";

type Fixture = {
  id: string;
  text: string;
  vectors: number[][];
  goldBoundaries: number[];
  options: { percentile?: number; minSentences?: number };
  whyHard: string;
};

type Out = { boundaries: number[]; sentences: string[]; chunkSizes: number[]; joined: string };

const adapter: EvalAdapter<Fixture, Out> = {
  id: "chunk",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/chunk/fixtures"),
  needsApiKey: false,

  async run(fx) {
    const sentences = splitSentences(fx.text);
    if (sentences.length !== fx.vectors.length) {
      throw new Error(`문장 ${sentences.length}개 ≠ vectors ${fx.vectors.length}개 — fixture 를 고쳐야 한다`);
    }
    // 주입 임베더: splitSentences 결과 순서대로 fixture 의 벡터를 돌려준다.
    const embed = async (texts: string[]): Promise<number[][]> =>
      texts.map((t) => fx.vectors[sentences.indexOf(t)] ?? fx.vectors[0]);

    const r = await semanticChunk(fx.text, { embed, ...fx.options });
    return {
      boundaries: r.boundaries,
      sentences: r.sentences,
      chunkSizes: r.chunks.map((c) => c.sentences.length),
      joined: r.chunks.flatMap((c) => c.sentences).join(" "),
    };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    let f1sum = 0, n = 0, lost = 0, minViolation = 0;
    const f1s: number[] = [];
    for (const s of samples) {
      if (!s.out) continue;
      n++;
      const f1 = boundaryF1(s.fixture.goldBoundaries, s.out.boundaries, 1);
      f1s.push(f1);
      f1sum += f1;
      // 청크를 이어붙이면 원래 문장열과 정확히 같아야 한다 — 순서·개수 모두.
      if (s.out.joined !== s.out.sentences.join(" ")) lost++;
      const min = s.fixture.options.minSentences ?? 1;
      minViolation += s.out.chunkSizes.filter((sz) => sz < min).length;
    }
    return {
      runFailed: samples.filter((s) => s.error).length,
      cases: n,
      boundaryF1: n ? f1sum / n : NaN,
      // 케이스별 최소. 평균만 보면 한 케이스가 통째로 무너져도 다른 케이스가 가린다 —
      // 과분할 회귀에서 topic-shift 가 0.5 로 떨어졌는데 평균 0.75 라 통과했다(적대적 검증).
      boundaryF1Min: f1s.length ? Math.min(...f1s) : NaN,
      sentenceLoss: lost,
      minSentencesViolation: minViolation,
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "sentenceLoss", op: "<=", threshold: 0, label: "문장 유실 0건" },
    { metric: "minSentencesViolation", op: "<=", threshold: 0, label: "minSentences 위반 0건" },
    { metric: "boundaryF1", op: ">=", threshold: 0.7, label: "경계 F1 ≥ 0.7 (잠정)" },
    { metric: "boundaryF1Min", op: ">=", threshold: 0.7, label: "케이스별 최소 경계 F1 ≥ 0.7 (잠정)" },
  ],
};

export default adapter;
