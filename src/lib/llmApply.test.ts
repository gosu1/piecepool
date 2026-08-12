import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeTitle, slugOrHash, toSourceRefs, embedSourceFiles, synthesisPage, isSynthesisPage, applyLlmResult, toExistingConcepts } from "./llmApply";
import type { LlmConcept, LlmRelation } from "../llm/provider";
import type { ArchiveNote, Relation, SourceRef, WikiPage } from "./types";
import * as ipc from "./ipc";
import { joinFeynmanSection, splitFeynmanSection, type FeynmanSession } from "./feynmanSection";

vi.mock("./ipc", () => ({
  saveWiki: vi.fn(async (_space: string, page: unknown) => page),
  saveWikiBatch: vi.fn(async (_space: string, pages: unknown[]) => pages),
  appendRelations: vi.fn(async (_space: string, relations: unknown[] = []) => relations.length),
  // 기본값: 디스크 재읽기 실패 → mergeMarkdown 이 스냅샷(ex)으로 폴백. 개별 테스트가
  // mockResolvedValueOnce 로 "디스크가 스냅샷보다 최신" 시나리오를 덮어쓴다.
  readWiki: vi.fn(async () => {
    throw new Error("readWiki not mocked for this test");
  }),
}));

describe("concept dedup key (normalizedTitle)", () => {
  it("NFC + 소문자 + 공백 전부 제거 — 띄어쓰기 변형이 같은 키로 접힌다", () => {
    expect(normalizeTitle("Self-Attention")).toBe("self-attention");
    expect(normalizeTitle("Self  Attention")).toBe("selfattention");
    expect(normalizeTitle("  임베딩 ")).toBe("임베딩");
    // PIE-64 — 한글 띄어쓰기 변형은 같은 개념이다. collapse(한 칸 축약)로는 안 접혔다.
    expect(normalizeTitle("교착 상태")).toBe(normalizeTitle("교착상태"));
    expect(normalizeTitle("교착 상태")).not.toBe(normalizeTitle("기아 상태"));
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

  it("재변환해도 파인만 기록은 살아남는다 — 본문은 새 출력으로 갈아탄다", () => {
    const session: FeynmanSession = {
      at: "2026-07-16T12:00:00.000Z",
      verdict: "understood",
      bodyHash: "a1b2c3d4",
      turns: [{ role: "user", text: "내가 쓴 설명" }],
    };
    const first = synthesisPage("sp-1", NOTE, "v1", []);
    const withRec = { ...first, markdown: joinFeynmanSection("v1", [session]) };
    const second = synthesisPage("sp-1", NOTE, "v2", [withRec]);
    const { body, sessions } = splitFeynmanSection(second.markdown);
    expect(sessions).toEqual([session]);
    expect(body).toBe("v2");
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
      { sourceId: NOTE.sourceId, archivePath: `archive/${NOTE.path}`, title: NOTE.title },
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
      { sourceId: NOTE.sourceId, archivePath: `archive/${NOTE.path}`, title: NOTE.title },
      [synPage],
    );
    expect(applied.merged).toBe(0); // 병합 안 됨 — 새 개념 페이지로 생성
    expect(applied.pages[0].path).not.toBe(synPage.path);
    expect(applied.pages[0].conceptId).not.toBe(synPage.conceptId);
  });
});

// ── 병합 경로 — 기존 위키가 있는 과목에 새 노트가 들어올 때 지식이 축적되는가 ──
// 이 경로(llmApply.ts 의 `ex` truthy 분기)는 지금까지 테스트가 0개였다.
const existingPage = (over: Partial<WikiPage> = {}): WikiPage => ({
  id: "wiki-old",
  spaceId: "sp-1",
  conceptId: "concept-old",
  title: "교착 상태",
  path: "old.md",
  subjectIds: ["subj-os"],
  sourceIds: ["source-week1"],
  sourceRefs: [],
  markdown: "# 교착 상태\n\n1주차에 배운 내용",
  createdAt: "2026-07-01T10:00:00+09:00",
  updatedAt: "2026-07-01T10:00:00+09:00",
  ...over,
});

const conceptNamed = (title: string): LlmConcept => ({
  title,
  summary: "3주차 요약",
  explanation: "3주차 설명",
  examples: [],
  sourceRefs: [],
  sourceEmbeds: [],
});

const SRC = { sourceId: "source-week3", archivePath: "archive/2026-07-15-os.md", title: "OS 5주차" };

const applyOnto = (
  existing: WikiPage[],
  title: string,
  subjectIds: string[] = ["subj-os"],
  deps?: Parameters<typeof applyLlmResult>[6],
) =>
  applyLlmResult("space", "sp-1", subjectIds, { concepts: [conceptNamed(title)], relations: [] }, SRC, existing, deps);

// 응답 안에서 같은 개념이 두 번 나오면(대소문자·공백 변형) 병렬 저장이 같은 경로에 두 번 써
// 뒤가 앞을 덮었다 — 저장 전에 결합해야 한다(덮어쓰기 아님: explanation/examples/sourceRefs 결합).
describe("applyLlmResult 응답 내 중복 개념 — 덮어쓰기 유실 방지", () => {
  it("같은 제목 대소문자 변형 2개 → 1개 병합 페이지 (내용 결합)", async () => {
    const dup = (title: string, n: string): LlmConcept => ({
      title,
      summary: `요약${n}`,
      explanation: `설명${n}`,
      examples: [`예시${n}`],
      sourceRefs: [],
      sourceEmbeds: [],
    });
    const applied = await applyLlmResult(
      "space",
      "sp-1",
      [],
      { concepts: [dup("Self-Attention", "1"), dup("self-attention", "2")], relations: [] },
      SRC,
      [],
    );
    expect(applied.pages).toHaveLength(1);
    const p = applied.pages[0];
    expect(p.title).toBe("Self-Attention"); // 첫 표기 유지
    expect(p.markdown).toContain("설명1");
    expect(p.markdown).toContain("설명2"); // 두 번째 내용이 유실되지 않는다
    expect(p.markdown).toContain("예시1");
    expect(p.markdown).toContain("예시2");
  });
});

describe("applyLlmResult 병합 — 기존 개념에 새 노트가 얹힐 때", () => {
  it("같은 개념이면 새 파일을 만들지 않고 기존 파일에 병합한다 (id·path·conceptId·생성시각 보존)", async () => {
    const ex = existingPage();
    const applied = await applyOnto([ex], "교착 상태");
    expect(applied.merged).toBe(1);
    const p = applied.pages[0];
    expect(p.id).toBe(ex.id);
    expect(p.path).toBe(ex.path);
    expect(p.conceptId).toBe(ex.conceptId);
    expect(p.createdAt).toBe(ex.createdAt);
  });

  it("출처(sourceIds)는 합집합으로 누적된다", async () => {
    const applied = await applyOnto([existingPage()], "교착 상태");
    expect(applied.pages[0].sourceIds).toEqual(["source-week1", "source-week3"]);
  });

  it("과목(subjectIds)도 합집합으로 누적된다 — 기존 태그를 덮지 않는다", async () => {
    const ex = existingPage({ subjectIds: ["subj-os", "subj-ml"] });
    const applied = await applyOnto([ex], "교착 상태", ["subj-os"]);
    expect(applied.pages[0].subjectIds).toEqual(["subj-os", "subj-ml"]);
  });

  // ── 본문 축적(방식 A: LLM 통합 재작성) ──
  it("병합이면 mergeMarkdown 에 기존 본문과 새 개념을 넘기고, 그 결과를 본문으로 쓴다", async () => {
    const ex = existingPage();
    let seenExisting = "";
    let seenTitle = "";
    const applied = await applyOnto([ex], "교착 상태", ["subj-os"], {
      mergeMarkdown: async (existingMd, c, source) => {
        seenExisting = existingMd;
        seenTitle = source.title;
        return `${existingMd}\n\n[통합] ${c.summary}`;
      },
    });
    expect(seenExisting).toBe("# 교착 상태\n\n1주차에 배운 내용"); // 기존 본문이 LLM 에 간다
    expect(seenTitle).toBe("OS 5주차");
    expect(applied.pages[0].markdown).toBe("# 교착 상태\n\n1주차에 배운 내용\n\n[통합] 3주차 요약");
  });

  it("새 개념(병합 아님)에는 mergeMarkdown 을 호출하지 않는다 — 통합할 기존 본문이 없다", async () => {
    let called = 0;
    const applied = await applyOnto([], "새 개념", ["subj-os"], {
      mergeMarkdown: async () => {
        called++;
        return "쓰이면 안 됨";
      },
    });
    expect(called).toBe(0);
    expect(applied.pages[0].markdown).toContain("3주차 요약");
  });

  it("mergeMarkdown 이 실패하면 기존 본문을 유지한다 — 빈 본문·덮어쓰기로 지식을 잃지 않는다", async () => {
    const ex = existingPage();
    const applied = await applyOnto([ex], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => {
        throw new Error("[mergeWiki] HTTP 429");
      },
    });
    expect(applied.pages[0].markdown).toBe(ex.markdown); // 기존 본문 그대로
    expect(applied.pages[0].sourceIds).toEqual(["source-week1", "source-week3"]); // 출처·관계는 그대로 누적
  });

  it("mergeMarkdown 미주입이면 기존 본문을 유지한다 (본문 교체 금지)", async () => {
    const ex = existingPage();
    const applied = await applyOnto([ex], "교착 상태");
    expect(applied.pages[0].markdown).toBe(ex.markdown);
  });

  // ── 파인만 기록 보존 — LLM 이 본문을 다시 써도 코드가 지킨다 ──
  const FEYNMAN: FeynmanSession = {
    at: "2026-07-16T12:00:00.000Z",
    verdict: "understood",
    bodyHash: "a1b2c3d4",
    turns: [{ role: "user", text: "내가 쓴 설명" }],
  };
  const OLD_BODY = "# 교착 상태\n\n1주차에 배운 내용";
  const withRecord = () => existingPage({ markdown: joinFeynmanSection(OLD_BODY, [FEYNMAN]) });

  it("병합 후에도 파인만 기록이 글자 그대로 남는다", async () => {
    const applied = await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => "# 교착 상태\n\n통합된 새 본문",
    });
    const { body, sessions } = splitFeynmanSection(applied.pages[0].markdown);
    expect(sessions).toEqual([FEYNMAN]);
    expect(body).toBe("# 교착 상태\n\n통합된 새 본문");
  });

  it("LLM 에 넘기는 본문에 파인만 기록이 없다 — 답 유출·판정 누출 차단", async () => {
    let seen = "";
    await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async (existingMd) => {
        seen = existingMd;
        return "# 교착 상태\n\n통합된 새 본문";
      },
    });
    expect(seen).toBe(OLD_BODY); // 기록을 걷어낸 본문만 간다
    expect(seen).not.toContain("내가 쓴 설명");
    expect(seen).not.toContain("이해함");
  });

  it("mergeMarkdown 미주입 폴백 — 기록이 중복되지 않는다", async () => {
    const applied = await applyOnto([withRecord()], "교착 상태");
    expect(splitFeynmanSection(applied.pages[0].markdown).sessions).toHaveLength(1);
  });

  it("mergeMarkdown 실패 폴백 — 기록이 중복되지 않는다", async () => {
    const applied = await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => {
        throw new Error("[mergeWiki] HTTP 429");
      },
    });
    expect(splitFeynmanSection(applied.pages[0].markdown).sessions).toHaveLength(1);
  });

  it("LLM 이 `## 파인만 기록` 을 뱉어도 진짜 기록이 body 로 새지 않는다", async () => {
    // 가짜 헤딩이 남으면 다음 split 의 경계 계산이 진짜 헤딩을 경계로 삼아
    // 진짜 세션이 통째로 body 가 되고, 다음 병합 때 LLM 에 유출된다.
    const applied = await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => "# 교착 상태\n\n새 본문\n\n## 파인만 기록\n\n### LLM 이 지어낸 것\n\n> 창작",
    });
    const { body, sessions } = splitFeynmanSection(applied.pages[0].markdown);
    expect(sessions).toEqual([FEYNMAN]); // 진짜 기록 하나뿐
    expect(body).toBe("# 교착 상태\n\n새 본문"); // 가짜 섹션은 버려진다 — LLM 창작이지 사용자 것이 아니다
    expect(body).not.toContain("내가 쓴 설명");
  });

  it("LLM 이 가짜 헤딩을 두 개 뱉어도 마찬가지다 — 소독이 멱등이어야 한다", async () => {
    // 1회만 걷어내는 구현은 두 번째 가짜를 body 에 남기고, 재부착 후 헤딩이 다시 두 개가 되어
    // 바로 다음 라운드에 진짜 기록이 유출된다. 실제로 재현된 경로다.
    const applied = await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () =>
        "# 교착 상태\n\n새 본문\n\n## 파인만 기록\n\n### 가짜1\n\n> 창작1\n\n## 파인만 기록\n\n### 가짜2\n\n> 창작2",
    });
    const md = applied.pages[0].markdown;
    expect(md.match(/^## 파인만 기록$/gm)).toHaveLength(1);
    const { body, sessions } = splitFeynmanSection(md);
    expect(sessions).toEqual([FEYNMAN]);
    expect(body).toBe("# 교착 상태\n\n새 본문");
    expect(body).not.toContain("내가 쓴 설명");
  });

  it("unparsed(읽을 수 없는 블록)도 병합을 건너 살아남는다", async () => {
    const ex = existingPage({ markdown: `${joinFeynmanSection(OLD_BODY, [FEYNMAN])}\n\n### 깨진 헤더\n\n> 잃으면 안 되는 말\n` });
    const applied = await applyOnto([ex], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => "# 교착 상태\n\n새 본문",
    });
    expect(applied.pages[0].markdown).toContain("잃으면 안 되는 말");
  });

  // LLM 출력이 후행 개행으로 끝나는 건 정상 형태다. split 이 body 를 항상 정규화하므로
  // 그 개행이 잘리는데, 픽스처에 후행 개행이 하나도 없어 이 경로가 검증되지 않고 있었다.
  it("LLM 출력이 후행 개행으로 끝나도 기록 보존과 배지가 멀쩡하다", async () => {
    const applied = await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => "# 교착 상태\n\n새 본문\n\n",
    });
    const md = applied.pages[0].markdown;
    const { body, sessions } = splitFeynmanSection(md);
    expect(sessions).toEqual([FEYNMAN]);
    expect(body).toBe("# 교착 상태\n\n새 본문");
  });

  // ── 디스크 재읽기 — ex 는 저장 버튼 누른 시점의 wikiBySlug 스냅샷인데, 쓰이는 건
  // runWikiGeneration(LLM 30초+) 을 지난 뒤다. 그 사이 사용자가 위키 탭에서 끝낸 파인만
  // 세션은 스냅샷엔 없다 — mergeMarkdown 은 디스크 최신본(cur)을 읽어 기준으로 삼아야 한다.
  it("병합 성공 시 디스크 최신본을 기준으로 삼는다 — 스냅샷(ex)에 없는 세션도 살아남는다", async () => {
    const staleEx = existingPage({ markdown: OLD_BODY }); // 스냅샷: 세션 없음
    const freshOnDisk = { ...staleEx, markdown: joinFeynmanSection(OLD_BODY, [FEYNMAN]) }; // 디스크: 그 사이 세션 추가됨
    vi.mocked(ipc.readWiki).mockResolvedValueOnce(freshOnDisk);
    const applied = await applyOnto([staleEx], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => "# 교착 상태\n\n통합된 새 본문",
    });
    expect(vi.mocked(ipc.readWiki)).toHaveBeenCalledWith("space", staleEx.path);
    const { body, sessions } = splitFeynmanSection(applied.pages[0].markdown);
    expect(sessions).toEqual([FEYNMAN]); // 스냅샷엔 없던 세션이 살아 있다
    expect(body).toBe("# 교착 상태\n\n통합된 새 본문");
  });

  it("병합 실패 폴백도 디스크 최신본을 쓴다 — 스냅샷으로 되돌리면 그 사이의 세션을 잃는다", async () => {
    const staleEx = existingPage({ markdown: OLD_BODY });
    const freshOnDisk = { ...staleEx, markdown: joinFeynmanSection(OLD_BODY, [FEYNMAN]) };
    vi.mocked(ipc.readWiki).mockResolvedValueOnce(freshOnDisk);
    const applied = await applyOnto([staleEx], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => {
        throw new Error("[mergeWiki] HTTP 429");
      },
    });
    expect(splitFeynmanSection(applied.pages[0].markdown).sessions).toEqual([FEYNMAN]);
  });
});

// LLM 입력의 existingConcepts — normalizedTitle 이 validate 의 관계 검증과 다른 규칙으로
// 만들어지면 known 집합 비교가 영영 실패해 그 기존 개념으로 향하는 관계가 전부 조용히
// 드롭된다(droppedTitle).
describe("toExistingConcepts", () => {
  it("normalizedTitle 은 normalizeTitle 규칙(NFC·소문자·공백 제거)을 따른다 — 엣지 드롭 방지", () => {
    const pages = [existingPage({ conceptId: "concept-cnn", title: "합성곱  신경망" })];
    expect(toExistingConcepts(pages)).toEqual([
      { id: "concept-cnn", title: "합성곱  신경망", normalizedTitle: "합성곱신경망" },
    ]);
  });

  it("정리 글(합성) 페이지는 개념이 아니므로 제외한다", () => {
    const syn = synthesisPage("sp-1", NOTE, "정리 글", []);
    expect(toExistingConcepts([syn, existingPage()])).toHaveLength(1);
    expect(toExistingConcepts([syn, existingPage()])[0].id).toBe("concept-old");
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

// ── 폴더 간(cross-space) 관계 ──
// 관계는 개념 제목을 conceptId 로 해석(resolve)해 저장한다. 대상 개념이 이 공간에 없으면(다른 폴더)
// resolve 가 null 을 반환해 그 관계가 조용히 버려진다. 이것이 "CV·LLM·VLM 폴더가 서로 안 이어지던" 원인.
// deps.cross 로 타 공간 개념을 넘기면 그쪽을 가리키는 관계가 살아남는다.
describe("applyLlmResult 폴더 간(cross-space) 관계", () => {
  beforeEach(() => vi.mocked(ipc.appendRelations).mockClear());

  // 이 공간의 새 개념(비전 트랜스포머)이 다른 공간의 개념(어텐션)을 used_in 으로 가리킨다.
  const rel: LlmRelation = {
    sourceConceptTitle: "비전 트랜스포머",
    targetConceptTitle: "어텐션",
    relationType: "used_in",
    strength: 0.8,
    confidence: 0.9,
    explanation: "ViT 는 어텐션을 활용한다",
    evidence: [],
  };
  const result = { concepts: [conceptNamed("비전 트랜스포머")], relations: [rel] };
  const savedRelations = (): Relation[] => (vi.mocked(ipc.appendRelations).mock.calls[0]?.[1] as Relation[]) ?? [];

  it("cross 없으면 타 공간 개념을 가리키는 관계는 버려진다 (회귀 이전 동작)", async () => {
    const applied = await applyLlmResult("space", "sp-1", ["subj"], result, SRC, []);
    // resolve 실패 → 관계 0건 → appendRelations 아예 호출 안 됨(relations.length ? 호출 : 0)
    expect(vi.mocked(ipc.appendRelations)).not.toHaveBeenCalled();
    expect(applied.relationCount).toBe(0);
  });

  it("cross 로 타 공간 개념을 주면 그 개념을 가리키는 관계가 살아남는다", async () => {
    const applied = await applyLlmResult("space", "sp-1", ["subj"], result, SRC, [], {
      cross: [{ id: "concept-attention", title: "어텐션" }],
    });
    const rels = savedRelations();
    expect(rels).toHaveLength(1);
    expect(rels[0].targetNodeId).toBe("concept-attention"); // 타 공간 conceptId 로 해석됨
    expect(rels[0].sourceNodeId).toBe(`concept-${slugOrHash("비전 트랜스포머")}`); // 이 공간 새 개념
    expect(applied.relationCount).toBe(1);
  });

  it("cross 개념은 위키로 저장되지 않는다 — 관계 해석에만 쓰고 이 공간 개념만 만든다", async () => {
    const applied = await applyLlmResult("space", "sp-1", ["subj"], result, SRC, [], {
      cross: [{ id: "concept-attention", title: "어텐션" }],
    });
    // 저장된 위키는 이 공간의 '비전 트랜스포머' 하나뿐 — '어텐션'은 만들지 않는다.
    expect(applied.pages).toHaveLength(1);
    expect(applied.pages[0].title).toBe("비전 트랜스포머");
  });

  it("제목 정규화(NFC·대소문자·공백)를 넘어 매칭된다 — 'Attention' 로 나와도 'attention' 개념에 붙는다", async () => {
    const upper = { concepts: [conceptNamed("비전 트랜스포머")], relations: [{ ...rel, targetConceptTitle: "  ATTENTION " }] };
    await applyLlmResult("space", "sp-1", ["subj"], upper, SRC, [], {
      cross: [{ id: "concept-attention", title: "attention" }],
    });
    expect(savedRelations()[0]?.targetNodeId).toBe("concept-attention");
  });
});
