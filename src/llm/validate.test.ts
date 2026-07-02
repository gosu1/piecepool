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
