import { describe, it, expect } from "vitest";
import { semanticChunk, splitSentences, cosine, percentile, type EmbedFn } from "./chunk";

// 가짜 임베더 — 문장을 토픽 키워드로 2D 벡터에 매핑. 같은 토픽=동일 벡터라 유사도가 급락 지점만 떨어진다.
// (실 API 없이 percentile 경계 감지 로직을 결정적으로 검증한다.)
const topicEmbed: EmbedFn = async (texts) =>
  texts.map((t) => (t.includes("고양이") ? [1, 0] : [0, 1]));

describe("splitSentences", () => {
  it("splits ko/en sentences and strips markdown markers", () => {
    const s = splitSentences("# 제목\n- 첫째 문장이다. 둘째 문장!\n> 인용 셋째?\n\n넷째.");
    expect(s).toEqual(["제목", "첫째 문장이다.", "둘째 문장!", "인용 셋째?", "넷째."]);
  });

  it("returns single element for a lone sentence", () => {
    expect(splitSentences("한 문장뿐")).toEqual(["한 문장뿐"]);
  });
});

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("returns 0 for a zero vector (no divide-by-zero)", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("percentile", () => {
  it("interpolates linearly on sorted values", () => {
    expect(percentile([0, 1, 1, 1, 1], 10)).toBeCloseTo(0.4);
    expect(percentile([0.41, 0.83, 0.84, 0.85, 0.86, 0.88], 50)).toBeCloseTo(0.845);
  });
});

describe("semanticChunk (percentile boundary detection)", () => {
  const text =
    "고양이는 귀엽다. 고양이는 야옹한다. 고양이는 잔다. 돈은 중요하다. 돈은 은행에 있다. 돈은 숫자다.";

  it("cuts at the topic drop, producing two chunks", async () => {
    const r = await semanticChunk(text, { embed: topicEmbed, percentile: 10 });
    expect(r.sentences.length).toBe(6);
    expect(r.similarities.length).toBe(5);
    expect(r.boundaries).toEqual([2]); // 고양이[2] → 돈[0] 전환에서만 유사도 급락
    expect(r.chunks.length).toBe(2);
    expect(r.chunks[0].sentences.every((s) => s.includes("고양이"))).toBe(true);
    expect(r.chunks[1].sentences.every((s) => s.includes("돈"))).toBe(true);
  });

  it("merges sub-min chunks with minSentences", async () => {
    // cat cat money cat cat → 경계 2개(중간 money 1문장). min=2면 병합.
    const zigzag = "고양이 하나. 고양이 둘. 돈 하나. 고양이 셋. 고양이 넷.";
    const raw = await semanticChunk(zigzag, { embed: topicEmbed, percentile: 50 });
    expect(raw.chunks.length).toBe(3);
    const merged = await semanticChunk(zigzag, { embed: topicEmbed, percentile: 50, minSentences: 2 });
    expect(merged.chunks.length).toBe(2);
  });

  it("returns a single chunk when there is nothing to split", async () => {
    const r = await semanticChunk("문장 하나뿐이다.", { embed: topicEmbed });
    expect(r.chunks.length).toBe(1);
    expect(r.boundaries).toEqual([]);
  });
});
