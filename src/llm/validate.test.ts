import { describe, it, expect } from "vitest";
import { normalizeRelations, sanitizeSourceRefs, normalizeLlmResult } from "./validate";
import type { LlmConcept, LlmRelation, LlmWikiResult, LlmWikiInput } from "./provider";

// normalize-drop 계약 회귀 테스트. 환각 ref/relation은 전체 거부가 아니라 drop(정규화)된다.
// SSOT: docs/10-contracts/llm-output-schema.md §5, src/llm/validate.ts.

function concept(title: string, sourceRefs: LlmConcept["sourceRefs"] = []): LlmConcept {
  return { title, summary: "s", explanation: "e", examples: [], sourceRefs, sourceEmbeds: [] };
}

function relation(source: string, target: string, relationType: string): LlmRelation {
  return {
    sourceConceptTitle: source,
    targetConceptTitle: target,
    relationType,
    strength: 0.5,
    confidence: 0.5,
    explanation: "x",
    evidence: [],
  };
}

const baseInput: LlmWikiInput = { sourceTitle: "t", sourceText: "x", subjects: [], existingConcepts: [] };

describe("normalizeRelations", () => {
  it("drops edges referencing unknown concept titles, keeps known", () => {
    const result: LlmWikiResult = {
      concepts: [concept("Transformer"), concept("Self-Attention")],
      relations: [
        relation("Self-Attention", "Transformer", "part_of"),
        relation("Self-Attention", "Unknown Concept", "related_to"),
      ],
    };
    const { data, droppedTitle } = normalizeRelations(result, baseInput);
    expect(droppedTitle).toBe(1);
    expect(data.relations).toHaveLength(1);
    expect(data.relations[0].targetConceptTitle).toBe("Transformer");
  });

  it("drops node-incompatible relationTypes (Concept→Concept matrix)", () => {
    const result: LlmWikiResult = {
      concepts: [concept("A"), concept("B")],
      relations: [
        relation("A", "B", "extracted_from"),
        relation("A", "B", "explained_by"),
        relation("A", "B", "review_needed"),
        relation("A", "B", "prerequisite"),
      ],
    };
    const { data, droppedNode } = normalizeRelations(result, baseInput);
    expect(droppedNode).toBe(3);
    expect(data.relations).toHaveLength(1);
    expect(data.relations[0].relationType).toBe("prerequisite");
  });
});

describe("sanitizeSourceRefs", () => {
  it("drops refs to unknown sources and corrects file from input", () => {
    const input: LlmWikiInput = {
      ...baseInput,
      sourceFiles: [{ id: "src-1", file: "lecture.pdf", type: "pdf" }],
    };
    const result: LlmWikiResult = {
      concepts: [
        concept("A", [
          { sourceId: "src-1", file: "wrong.pdf", embed: false },
          { sourceId: "ghost", file: "hallucinated.pdf", embed: false },
        ]),
      ],
      relations: [],
    };
    const { data, dropped } = sanitizeSourceRefs(result, input);
    expect(dropped).toBe(1);
    expect(data.concepts[0].sourceRefs).toHaveLength(1);
    expect(data.concepts[0].sourceRefs[0].file).toBe("lecture.pdf");
  });
});

describe("normalizeLlmResult", () => {
  it("warns when related_to ratio exceeds 50%", () => {
    const result: LlmWikiResult = {
      concepts: [concept("A"), concept("B"), concept("C")],
      relations: [
        relation("A", "B", "related_to"),
        relation("B", "C", "related_to"),
        relation("A", "C", "part_of"),
      ],
    };
    const { warnings } = normalizeLlmResult(result, baseInput);
    expect(warnings.some((w) => w.includes("related_to"))).toBe(true);
  });

  it("keeps fully valid input without warnings (drop-not-reject)", () => {
    const result: LlmWikiResult = {
      concepts: [concept("A"), concept("B")],
      relations: [relation("A", "B", "part_of")],
    };
    const { data, warnings } = normalizeLlmResult(result, baseInput);
    expect(data.relations).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });
});
