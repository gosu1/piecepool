import { describe, it, expect } from "vitest";
import { validateLlmWikiResult, normalizeRelations, sanitizeSourceRefs, canonicalEmbed } from "./validate";
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

// 회귀: 모델이 대괄호를 포함해 주면(`![[a.pdf]]`) llmApply 가 한 번 더 감싸 `![[![[a.pdf]]]]` 가 됐고,
// 파서가 파일명을 `![[a.pdf` 로 읽어 위키의 근거 임베드가 전부 깨졌다. 스키마가 형식을 정의하지
// 않으므로(그냥 string[]) 어느 쪽으로 오든 canonical 한 형태로 못박는다.
describe("canonicalEmbed — sourceEmbeds 형식 정규화", () => {
  const allowed = new Set(["a.pdf", "b.png"]);

  it("대괄호가 있든 없든 같은 결과", () => {
    expect(canonicalEmbed("a.pdf", allowed)).toBe("![[a.pdf]]");
    expect(canonicalEmbed("![[a.pdf]]", allowed)).toBe("![[a.pdf]]");
    expect(canonicalEmbed("[[a.pdf]]", allowed)).toBe("![[a.pdf]]");
  });

  it("이미 이중으로 감싼 것도 편다", () => {
    expect(canonicalEmbed("![[![[a.pdf]]]]", allowed)).toBe("![[a.pdf]]");
  });

  it("#page=N 은 보존, 잘못된 page 는 떼어낸다", () => {
    expect(canonicalEmbed("![[a.pdf#page=3]]", allowed)).toBe("![[a.pdf#page=3]]");
    expect(canonicalEmbed("a.pdf#page=0", allowed)).toBe("![[a.pdf]]");
    expect(canonicalEmbed("a.pdf#page=abc", allowed)).toBe("![[a.pdf]]");
  });

  it("입력으로 준 원본이 아니면 버린다(부분일치 금지)", () => {
    expect(canonicalEmbed("![[ghost.pdf]]", allowed)).toBeNull();
    expect(canonicalEmbed("![[my-a.pdf]]", allowed)).toBeNull(); // 옛 includes 필터는 통과시켰다
  });

  it("sanitizeSourceRefs 가 정규화 + 중복 제거까지 한다", () => {
    const result: LlmWikiResult = {
      concepts: [
        {
          ...concept("프로세스"),
          sourceRefs: [{ sourceId: "src-1", file: "", embed: true }],
          sourceEmbeds: ["![[a.pdf]]", "a.pdf", "![[ghost.pdf]]"],
        },
      ],
      relations: [],
    };
    const out = sanitizeSourceRefs(result, input);
    expect(out.data.concepts[0].sourceEmbeds).toEqual(["![[a.pdf]]"]);
  });
});
