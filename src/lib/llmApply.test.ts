import { describe, it, expect } from "vitest";
import { normalizeTitle, slugOrHash, toSourceRefs, embedSourceFiles } from "./llmApply";
import type { LlmConcept } from "../llm/provider";
import type { SourceRef } from "./types";

describe("concept dedup key (normalizedTitle)", () => {
  it("collapses case + whitespace, NFC — 'Self-Attention' == 'self attention'", () => {
    expect(normalizeTitle("Self-Attention")).toBe("self-attention");
    expect(normalizeTitle("Self  Attention")).toBe("self attention");
    expect(normalizeTitle("  임베딩 ")).toBe("임베딩");
  });
  it("slugOrHash is stable per normalized title (same concept → same file)", () => {
    expect(slugOrHash("Self-Attention")).toBe(slugOrHash("self-attention"));
    expect(slugOrHash("Transformer")).toBe("transformer");
  });
  it("non-ASCII title falls back to a stable hash (deterministic)", () => {
    expect(slugOrHash("프로세스")).toMatch(/^c-[0-9a-f]+$/);
    expect(slugOrHash("프로세스")).toBe(slugOrHash("프로세스"));
  });
});

// LlmSourceRef → SourceRef 변환 (수용기준 §2.2 frontmatter sourceRefs 저장)
const concept = (refs: LlmConcept["sourceRefs"]): LlmConcept => ({
  title: "T",
  summary: "s",
  explanation: "e",
  examples: [],
  sourceRefs: refs,
  sourceEmbeds: [],
});

describe("toSourceRefs", () => {
  it("허용 sourceId 만 통과(환각 거부) + id 부여", () => {
    const out = toSourceRefs(
      concept([
        { sourceId: "s1", file: "a.pdf", page: 2, embed: true },
        { sourceId: "hallucinated", file: "b.pdf", embed: false },
      ]),
      new Set(["s1"]),
      "t",
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "ref-t-0", sourceId: "s1", file: "a.pdf", page: 2, embed: true });
  });

  it("병합 시 기존 refs 보존 + (sourceId,file,page,embed) dedup", () => {
    const existing: SourceRef[] = [{ id: "ref-old", sourceId: "s1", file: "a.pdf", page: 2, embed: true }];
    const out = toSourceRefs(
      concept([
        { sourceId: "s1", file: "a.pdf", page: 2, embed: true }, // 중복 → 스킵
        { sourceId: "s1", file: "a.pdf", page: 3, embed: true }, // 새 페이지 → 추가
      ]),
      new Set(["s1"]),
      "t",
      existing,
    );
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("ref-old");
    expect(out[1].page).toBe(3);
  });

  it("file 빈 ref 거부, sourceRefs 없음 → 기존 유지", () => {
    expect(toSourceRefs(concept([{ sourceId: "s1", file: "", embed: false }]), new Set(["s1"]), "t")).toEqual([]);
    const existing: SourceRef[] = [{ id: "r", sourceId: "s1", file: "a.pdf", embed: false }];
    expect(toSourceRefs(concept([]), new Set(["s1"]), "t", existing)).toEqual(existing);
  });
});

// LlmWikiInput.sourceFiles 구성 — 이게 비면 sanitizeSourceRefs 가 모든 ref 를 버린다(파이프라인 no-op 방지)
describe("embedSourceFiles", () => {
  it("본문 첫 pdf embed → 대표 원본 파일 1개", () => {
    expect(embedSourceFiles("s1", "노트 ![[lec.pdf#page=3]] 그리고 ![[b.pdf]]")).toEqual([{ id: "s1", file: "lec.pdf", type: "pdf" }]);
  });
  it("이미지 embed 도 인식", () => {
    expect(embedSourceFiles("s1", "![[사진.png]]")).toEqual([{ id: "s1", file: "사진.png", type: "image" }]);
  });
  it("embed 없으면(순수 텍스트 노트) 빈 배열", () => {
    expect(embedSourceFiles("s1", "# 그냥 텍스트\n[[위키링크]]는 embed 아님")).toEqual([]);
  });
});
