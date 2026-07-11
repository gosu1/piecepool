import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ArchiveNote, WikiPage } from "./types";
import type { SectionTopic } from "./noteSections";

const runWikiGeneration = vi.fn();
const applyLlmResult = vi.fn();
vi.mock("../llm/generate", () => ({ runWikiGeneration: (...a: unknown[]) => runWikiGeneration(...a) }));
vi.mock("./factCheck", () => ({ maybeFactCheck: async (r: unknown) => ({ result: r, checked: 0 }) }));
vi.mock("./settings", () => ({ chunkOpts: () => undefined }));
vi.mock("./llmApply", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, applyLlmResult: (...a: unknown[]) => applyLlmResult(...a) };
});

const { regenerateSectionWiki } = await import("./sectionRegen");

const note = {
  sourceId: "src-1",
  title: "Transformer",
  markdown: "## 어텐션\n가중치.",
  path: "n.md",
  subjectIds: ["subj"],
} as ArchiveNote;

const topic: SectionTopic = {
  level: 2,
  title: "어텐션",
  slug: "어텐션",
  key: "어텐션",
  from: 0,
  to: 12,
  text: "## 어텐션\n가중치를 만든다.",
};

const params = {
  space: "sp",
  spaceId: "space-1",
  note,
  topic,
  explanations: ["유사도로 가중치를 줘요"],
  existing: [] as WikiPage[],
  apiKey: "k",
};

beforeEach(() => {
  runWikiGeneration.mockReset();
  applyLlmResult.mockReset();
});

describe("regenerateSectionWiki", () => {
  it("사용자의 설명을 재료로, 그 섹션만 다시 쓴다 (노트 전체가 아니라)", async () => {
    runWikiGeneration.mockResolvedValue({ result: { concepts: [], relations: [] }, engine: "gemini" });
    applyLlmResult.mockResolvedValue({ pages: [{ path: "a.md" }], relationCount: 0, merged: 1 });

    const r = await regenerateSectionWiki(params);

    const input = runWikiGeneration.mock.calls[0][0];
    expect(input.sourceText).toContain("## 어텐션");
    expect(input.sourceText).toContain("나: 유사도로 가중치를 줘요");
    expect(input.sourceText).not.toContain("가중치."); // 노트 전문은 넣지 않는다
    expect(r).toMatchObject({ downgraded: false });
    expect(r.applied?.merged).toBe(1);
  });

  it("휴리스틱으로 떨어지면 적용하지 않는다 — 멀쩡한 위키를 헤딩 분해물로 덮지 않는다", async () => {
    runWikiGeneration.mockResolvedValue({ result: { concepts: [], relations: [] }, engine: "heuristic" });

    const r = await regenerateSectionWiki(params);

    expect(r).toEqual({ applied: null, downgraded: true });
    expect(applyLlmResult).not.toHaveBeenCalled(); // 디스크를 건드리지 않는다
  });

  it("기존 개념을 힌트로 줘서 새로 만들지 않고 병합되게 한다", async () => {
    runWikiGeneration.mockResolvedValue({ result: { concepts: [], relations: [] }, engine: "gemini" });
    applyLlmResult.mockResolvedValue({ pages: [], relationCount: 0, merged: 0 });

    await regenerateSectionWiki({
      ...params,
      existing: [{ conceptId: "c1", title: "어텐션", sourceIds: [], sourceRefs: [] } as unknown as WikiPage],
    });

    expect(runWikiGeneration.mock.calls[0][0].existingConcepts).toEqual([
      { id: "c1", title: "어텐션", normalizedTitle: "어텐션" },
    ]);
  });

  it("normalizedTitle 은 llmApply 와 같은 정규화를 쓴다 — 병합 힌트가 어긋나지 않는다", async () => {
    runWikiGeneration.mockResolvedValue({ result: { concepts: [], relations: [] }, engine: "gemini" });
    applyLlmResult.mockResolvedValue({ pages: [], relationCount: 0, merged: 0 });

    await regenerateSectionWiki({
      ...params,
      existing: [{ conceptId: "c1", title: "Self  Attention", sourceIds: [], sourceRefs: [] } as unknown as WikiPage],
    });

    // toLowerCase() 만 하면 "self  attention"(공백 2칸) 이 되어 llmApply 의 normalizeTitle 과 어긋난다
    expect(runWikiGeneration.mock.calls[0][0].existingConcepts[0].normalizedTitle).toBe("self attention");
  });
});
