import { describe, it, expect, vi } from "vitest";
import { normalizeTitle, slugOrHash, toSourceRefs, embedSourceFiles, synthesisPage, isSynthesisPage, applyLlmResult } from "./llmApply";
import type { LlmConcept } from "../llm/provider";
import type { ArchiveNote, SourceRef, WikiPage } from "./types";

vi.mock("./ipc", () => ({
  saveWiki: vi.fn(async (_space: string, page: unknown) => page),
  appendRelations: vi.fn(async () => 0),
}));

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

// ── 정리 글(합성) 페이지 — ADR-0008 ─────────────────────────
const NOTE: ArchiveNote = {
  id: "note-1",
  spaceId: "sp-1",
  sourceId: "source-1a2b3c",
  path: "2026-07-03-os.md",
  title: "OS 3주차",
  markdown: "파편",
  subjectIds: ["subj-1"],
  createdAt: "2026-07-03T10:00:00+09:00",
  updatedAt: "2026-07-03T10:00:00+09:00",
};

describe("synthesisPage", () => {
  it("정체성은 sourceId 에서 결정적으로 파생 (제목 아님)", () => {
    const p = synthesisPage("sp-1", NOTE, "# OS 3주차 정리\n본문", []);
    expect(p.conceptId).toBe("concept-syn-source-1a2b3c");
    expect(p.id).toBe("wiki-syn-source-1a2b3c");
    expect(p.path).toBe("syn-source-1a2b3c.md");
    expect(p.title).toBe("OS 3주차 정리");
    expect(p.subjectIds).toEqual(["subj-1"]);
    expect(p.sourceIds).toEqual(["source-1a2b3c"]);
    expect(isSynthesisPage(p)).toBe(true);
  });

  it("재변환은 기존 페이지의 id/path/createdAt 을 보존하고 본문만 갱신", () => {
    const first = synthesisPage("sp-1", NOTE, "v1", []);
    const second = synthesisPage("sp-1", { ...NOTE, title: "OS 3주차 (수정)" }, "v2", [first]);
    expect(second.id).toBe(first.id);
    expect(second.path).toBe(first.path);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.markdown).toBe("v2");
    expect(second.title).toBe("OS 3주차 (수정) 정리"); // 제목은 노트 따라감, 파일은 고정
  });

  it("본문 embed → sourceRefs (dedup, [[링크]]는 제외) — 충돌 배너 방지", () => {
    const md = "![[lec.pdf#page=3]] 글 [[개념링크]] ![[lec.pdf#page=3]] ![[img.png]]";
    const p = synthesisPage("sp-1", NOTE, md, []);
    expect(p.sourceRefs).toEqual([
      { id: "ref-syn-0", sourceId: "source-1a2b3c", file: "lec.pdf", page: 3, embed: true },
      { id: "ref-syn-1", sourceId: "source-1a2b3c", file: "img.png", page: undefined, embed: true },
    ]);
  });

  it("일반 추출 페이지는 isSynthesisPage 아님", () => {
    expect(isSynthesisPage({ conceptId: "concept-transformer" } as WikiPage)).toBe(false);
  });
});

// 회귀: 근거 섹션이 sourceEmbeds 를 한 번 더 `![[...]]` 로 감싸 `![[![[a.pdf]]]]` 를 만들었고,
// 파서가 파일명을 `![[a.pdf` 로 읽어 위키의 원본 임베드가 전부 깨졌다.
// sourceEmbeds 는 validate.ts(canonicalEmbed)가 이미 완성된 형태로 넘긴다 — 그대로 쓴다.
describe("근거 섹션 — 이중 래핑 금지", () => {
  it("sourceEmbeds 를 그대로 본문에 넣는다", async () => {
    const result = {
      concepts: [
        { title: "글루카곤", summary: "s", explanation: "e", examples: [], sourceRefs: [], sourceEmbeds: ["![[a.pdf]]"] },
      ],
      relations: [],
    };
    const applied = await applyLlmResult(
      "space",
      "sp-1",
      [],
      result,
      { sourceId: NOTE.sourceId, archivePath: `archive/${NOTE.path}` },
      [],
    );
    expect(applied.pages[0].markdown).toContain("![[a.pdf]]");
    expect(applied.pages[0].markdown).not.toContain("![[![[");
  });
});

describe("applyLlmResult 클로버 가드", () => {
  it("추출 개념 제목이 정리 글 제목과 겹쳐도 정리 글 파일에 병합하지 않는다", async () => {
    const synPage = synthesisPage("sp-1", NOTE, "# OS 3주차 정리\n소중한 정리 글", []);
    const result = {
      concepts: [{ title: "OS 3주차 정리", summary: "s", explanation: "e", examples: [], sourceRefs: [], sourceEmbeds: [] }],
      relations: [],
    };
    const applied = await applyLlmResult(
      "space",
      "sp-1",
      ["subj-1"],
      result,
      { sourceId: NOTE.sourceId, archivePath: `archive/${NOTE.path}` },
      [synPage],
    );
    expect(applied.merged).toBe(0); // 병합 안 됨 — 새 개념 페이지로 생성
    expect(applied.pages[0].path).not.toBe(synPage.path);
    expect(applied.pages[0].conceptId).not.toBe(synPage.conceptId);
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
