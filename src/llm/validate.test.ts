import { describe, it, expect } from "vitest";
import { validateLlmWikiResult, normalizeRelations, sanitizeSourceRefs } from "./validate";
import type { LlmWikiInput, LlmWikiResult, LlmConcept } from "./provider";

const input: LlmWikiInput = {
  sourceTitle: "t",
  sourceText: "x",
  sourceFiles: [{ id: "src-1", file: "a.pdf", type: "pdf" }],
  subjects: [],
  existingConcepts: [{ id: "c", title: "임베딩", normalizedTitle: "임베딩" }],
};
const concept = (title: string): LlmConcept => ({ title, summary: "s", explanation: "e", examples: [], sourceRefs: [], sourceEmbeds: [] });

describe("validateLlmWikiResult (ajv)", () => {
  it("rejects an invalid shape", () => {
    expect(validateLlmWikiResult({}).valid).toBe(false);
  });
});

describe("normalizeRelations (12-row node-compat matrix)", () => {
  it("keeps Concept→Concept part_of, drops explained_by + review_needed + unknown-title", () => {
    const result: LlmWikiResult = {
      concepts: [concept("프로세스"), concept("스레드")],
      relations: [
        { sourceConceptTitle: "스레드", targetConceptTitle: "프로세스", relationType: "part_of", strength: 0.9, confidence: 0.9, explanation: "e", evidence: [] },
        { sourceConceptTitle: "프로세스", targetConceptTitle: "스레드", relationType: "explained_by", strength: 0.5, confidence: 0.5, explanation: "e", evidence: [] },
        { sourceConceptTitle: "프로세스", targetConceptTitle: "스레드", relationType: "review_needed", strength: 0.5, confidence: 0.5, explanation: "e", evidence: [] },
        { sourceConceptTitle: "몰라", targetConceptTitle: "프로세스", relationType: "related_to", strength: 0.3, confidence: 0.3, explanation: "e", evidence: [] },
      ],
    };
    const out = normalizeRelations(result, input);
    expect(out.data.relations.length).toBe(1);
    expect(out.data.relations[0].relationType).toBe("part_of");
    expect(out.droppedNode).toBe(2); // explained_by + review_needed
    expect(out.droppedTitle).toBe(1); // 몰라
  });
});

describe("sanitizeSourceRefs (drop hallucinated sources, fix file)", () => {
  it("drops refs to unknown sources and corrects file to input value", () => {
    const result: LlmWikiResult = {
      concepts: [
        {
          ...concept("프로세스"),
          sourceRefs: [
            { sourceId: "src-1", file: "", embed: false },
            { sourceId: "ghost", file: "", embed: false },
          ],
        },
      ],
      relations: [],
    };
    const out = sanitizeSourceRefs(result, input);
    expect(out.dropped).toBe(1);
    expect(out.data.concepts[0].sourceRefs.length).toBe(1);
    expect(out.data.concepts[0].sourceRefs[0].file).toBe("a.pdf");
  });
});

// 회귀: 모델은 sourceRefs.embed 와 sourceEmbeds 를 동기화하지 않는다. 실제로 embed: true 라고
// 해놓고 sourceEmbeds: [] 를 준 응답이 나왔고, frontmatter 는 "임베드하라"는데 본문엔 임베드가
// 없어 "출처와 본문 임베드가 어긋나요" 경고가 떴다. sourceEmbeds 를 sourceRefs 에서 파생시켜
// 둘이 구조적으로 일치하게 한다(계약이 sourceEmbeds 를 "(참고)" 로 표시한 대로).
describe("sourceEmbeds 파생 — frontmatter ↔ 본문 정합", () => {
  it("모델의 sourceEmbeds 문자열은 무시하고 sourceRefs 에서 만든다", () => {
    const result: LlmWikiResult = {
      concepts: [
        {
          ...concept("프로세스"),
          sourceRefs: [{ sourceId: "src-1", file: "", embed: true }],
          sourceEmbeds: ["![[환각.pdf]]", "쓰레기 문자열"], // 모델이 준 값 — 신뢰하지 않는다
        },
      ],
      relations: [],
    };
    const out = sanitizeSourceRefs(result, input);
    expect(out.data.concepts[0].sourceEmbeds).toEqual(["![[a.pdf]]"]);
  });

  it("embed: false 여도 근거는 임베드한다(모델의 동전던지기에 PDF 노출이 걸리지 않게)", () => {
    const result: LlmWikiResult = {
      concepts: [
        {
          ...concept("프로세스"),
          sourceRefs: [{ sourceId: "src-1", file: "", embed: false }],
          sourceEmbeds: [],
        },
      ],
      relations: [],
    };
    const out = sanitizeSourceRefs(result, input);
    expect(out.data.concepts[0].sourceRefs[0].embed).toBe(true);
    expect(out.data.concepts[0].sourceEmbeds).toEqual(["![[a.pdf]]"]);
  });

  it("page 는 frontmatter 와 본문이 같은 값을 쓴다 + 중복 제거", () => {
    const result: LlmWikiResult = {
      concepts: [
        {
          ...concept("프로세스"),
          sourceRefs: [
            { sourceId: "src-1", file: "", page: 3, embed: true },
            { sourceId: "src-1", file: "", page: 3, embed: true },
          ],
          sourceEmbeds: [],
        },
      ],
      relations: [],
    };
    const out = sanitizeSourceRefs(result, input);
    expect(out.data.concepts[0].sourceEmbeds).toEqual(["![[a.pdf#page=3]]"]);
  });

  it("출처가 없는 개념은 근거 섹션도 없다", () => {
    const result: LlmWikiResult = { concepts: [concept("프로세스")], relations: [] };
    const out = sanitizeSourceRefs(result, input);
    expect(out.data.concepts[0].sourceEmbeds).toEqual([]);
  });
});
