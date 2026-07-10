import { describe, it, expect } from "vitest";
import { runWikiGeneration, heuristicWiki } from "./generate";
import type { LlmProvider, LlmWikiInput, LlmWikiResult, LlmConcept, LlmRelation } from "./provider";
import type { EmbedFn } from "./chunk";

// 회귀: 요약문 평탄화가 '-' 를 공백으로 바꿔 ![[1202-22-2.pdf]] → ![[1202 22 2.pdf]] 가 되고,
// 존재하지 않는 원본을 가리켜 위키가 "원본을 불러오지 못했습니다" 로 깨졌다.
describe("heuristicWiki summary — 임베드가 요약문을 오염시키지 않는다", () => {
  const run = (sourceText: string) =>
    heuristicWiki({ sourceTitle: "강의교안", sourceText, subjects: [], existingConcepts: [] }).concepts[0].summary;

  it("임베드를 요약문에서 제거한다 (파일명 하이픈 훼손 금지)", () => {
    const summary = run("![[1202-22-2.pdf]] 우리나라 최초 sns는 싸이월드이다.");
    expect(summary).not.toContain("[[");
    expect(summary).not.toContain("1202 22 2");
    expect(summary).toBe("우리나라 최초 sns는 싸이월드이다.");
  });

  it("개념 링크는 표시 텍스트만 남긴다", () => {
    expect(run("[[임계 구역]]은 중요하다.")).toBe("임계 구역은 중요하다.");
    expect(run("[[critical-section|임계 구역]]은 중요하다.")).toBe("임계 구역은 중요하다.");
  });

  it("본문(explanation)의 임베드는 보존한다 — 원본 미리보기가 살아야 한다", () => {
    const body = "![[1202-22-2.pdf]]\n\n## 소셜 네트워크";
    expect(heuristicWiki({ sourceTitle: "강의교안", sourceText: body, subjects: [], existingConcepts: [] }).concepts[0].explanation).toContain(
      "![[1202-22-2.pdf]]",
    );
  });
});

const c = (title: string): LlmConcept => ({
  title,
  summary: "s",
  explanation: "e",
  examples: [],
  sourceRefs: [],
  sourceEmbeds: [],
});
const rel = (from: string, to: string): LlmRelation => ({
  sourceConceptTitle: from,
  targetConceptTitle: to,
  relationType: "part_of",
  strength: 0.7,
  confidence: 0.7,
  explanation: "e",
  evidence: [],
});

// 주입형 fake provider — 호출 입력을 기록하고 주어진 함수로 결과 산출.
function fakeProvider(fn: (input: LlmWikiInput) => LlmWikiResult) {
  const calls: LlmWikiInput[] = [];
  const provider: LlmProvider = {
    id: "gemini",
    async generateWikiStructured(input) {
      calls.push(input);
      return fn(input);
    },
  };
  return { provider, calls };
}

// chunk.test.ts와 동일 토픽 임베더 — 고양이=[1,0], 그 외=[0,1].
const topicEmbed: EmbedFn = async (texts) => texts.map((t) => (t.includes("고양이") ? [1, 0] : [0, 1]));

const base: LlmWikiInput = { sourceTitle: "t", sourceText: "x", subjects: [], existingConcepts: [] };

describe("runWikiGeneration — [E] promotion advisory", () => {
  it("연결된 개념은 active, 부착된 promotion 리포트에 staging 0", async () => {
    const { provider } = fakeProvider(() => ({ concepts: [c("A"), c("B")], relations: [rel("A", "B")] }));
    const out = await runWikiGeneration(base, undefined, { provider });
    expect(out.engine).toBe("gemini");
    expect(out.promotion).toEqual({ active: 2, staging: 0, isolatedTitles: [] });
  });

  it("고립 개념을 staging으로 표시(isolatedTitles)", async () => {
    const { provider } = fakeProvider(() => ({ concepts: [c("A"), c("B"), c("외톨이")], relations: [rel("A", "B")] }));
    const out = await runWikiGeneration(base, undefined, { provider });
    expect(out.promotion?.active).toBe(2);
    expect(out.promotion?.staging).toBe(1);
    expect(out.promotion?.isolatedTitles).toEqual(["외톨이"]);
  });

  it("키/ provider 없으면 휴리스틱 + promotion 부착(고립 root)", async () => {
    const out = await runWikiGeneration({ ...base, sourceText: "본문만 있고 헤딩 없음" }, undefined);
    expect(out.engine).toBe("heuristic");
    expect(out.promotion?.staging).toBe(1); // root 1개, 관계 0 → 고립
  });
});

describe("runWikiGeneration — [C] chunking (opt-in)", () => {
  const twoTopics =
    "고양이는 귀엽다. 고양이는 야옹한다. 고양이는 잔다. 돈은 중요하다. 돈은 은행에 있다. 돈은 숫자다.";

  it("2조각으로 나눠 조각별 호출 후 병합", async () => {
    const { provider, calls } = fakeProvider((inp) => ({
      concepts: [c(inp.sourceText.includes("고양이") ? "고양이개념" : "돈개념")],
      relations: [],
    }));
    const out = await runWikiGeneration({ ...base, sourceText: twoTopics }, undefined, {
      provider,
      chunk: { enabled: true, embed: topicEmbed, percentile: 10 },
    });
    expect(out.chunks).toBe(2);
    expect(calls).toHaveLength(2);
    expect(out.result.concepts.map((x) => x.title).sort()).toEqual(["돈개념", "고양이개념"].sort());
  });

  it("앞 조각 개념을 다음 호출 existingConcepts로 전달(교차-조각 해소)", async () => {
    const { provider, calls } = fakeProvider((inp) => ({
      concepts: [c(inp.sourceText.includes("고양이") ? "고양이개념" : "돈개념")],
      relations: [],
    }));
    await runWikiGeneration({ ...base, sourceText: twoTopics }, undefined, {
      provider,
      chunk: { enabled: true, embed: topicEmbed, percentile: 10 },
    });
    expect(calls[1].existingConcepts.some((e) => e.title === "고양이개념")).toBe(true);
  });

  it("조각 간 동일 개념은 dedup", async () => {
    const { provider } = fakeProvider(() => ({ concepts: [c("동일")], relations: [] }));
    const out = await runWikiGeneration({ ...base, sourceText: twoTopics }, undefined, {
      provider,
      chunk: { enabled: true, embed: topicEmbed, percentile: 10 },
    });
    expect(out.chunks).toBe(2);
    expect(out.result.concepts).toHaveLength(1);
  });

  it("조각 1개 이하면 통짜 단일 호출(비용 절약)", async () => {
    const { provider, calls } = fakeProvider(() => ({ concepts: [c("단일")], relations: [] }));
    const out = await runWikiGeneration({ ...base, sourceText: "한 문장뿐이다." }, undefined, {
      provider,
      chunk: { enabled: true, embed: topicEmbed },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sourceText).toBe("한 문장뿐이다."); // 조각이 아니라 원문 통짜
    expect(out.chunks).toBe(1);
  });

  it("chunk 미지정이면 기존 단일 호출과 동일(동작 불변)", async () => {
    const { provider, calls } = fakeProvider(() => ({ concepts: [c("X")], relations: [] }));
    const out = await runWikiGeneration({ ...base, sourceText: twoTopics }, undefined, { provider });
    expect(calls).toHaveLength(1);
    expect(out.chunks).toBeUndefined();
    expect(out.nodeTypes).toBeUndefined();
  });

  it("[B] 청킹 시 조각 정보 유형 분포(nodeTypes) 부착", async () => {
    const { provider } = fakeProvider(() => ({ concepts: [c("x")], relations: [] }));
    const out = await runWikiGeneration({ ...base, sourceText: twoTopics }, undefined, {
      provider,
      chunk: { enabled: true, embed: topicEmbed, percentile: 10 },
    });
    expect(out.nodeTypes).toBeDefined();
    const total = Object.values(out.nodeTypes!).reduce((a, b) => a + b, 0);
    expect(total).toBe(2); // 조각 2개 각각 분류됨
  });
});
