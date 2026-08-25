import { describe, expect, it, vi } from "vitest";
import * as ipc from "../lib/ipc";
import { digestWiki, firstParagraph, runTool, QUERY_TOOLS, WIKI_INLINE_LIMIT } from "./queryTools";

vi.mock("../lib/ipc", () => ({
  listSpaces: vi.fn(async () => [{ id: "s1", name: "프로젝트", slug: "프로젝트", rootPath: "", createdAt: "", updatedAt: "" }]),
  listWiki: vi.fn(async () => [
    { path: "브랜치 보호.md", title: "브랜치 보호", markdown: "# 브랜치 보호\n\nmain 에 직접 올리지 않는다.\n" },
  ]),
  readWiki: vi.fn(async () => ({ title: "브랜치 보호", markdown: "# 브랜치 보호\n\n본문입니다.\n" })),
  getGraph: vi.fn(async () => ({
    nodes: [
      { id: "n1", title: "브랜치 보호" },
      { id: "n2", title: "계약 변경 절차" },
    ],
    relations: [{ sourceNodeId: "n1", targetNodeId: "n2", relationType: "related_to" }],
  })),
}));

const WIKI = [
  "# 브랜치 보호",
  "",
  "main 에 직접 올리지 않는다.",
  "",
  "## 규칙",
  "",
  "- 리뷰어 한 명이 승인해야 합칠 수 있다",
  "",
  "## 근거",
  "",
  "![[규칙정리.pdf]]",
  "",
  "## 파인만 기록",
  "",
  "- 2026-08-23 설명함",
  "",
].join("\n");

describe("firstParagraph", () => {
  it("제목을 건너뛰고 첫 문단을 집는다", () => {
    expect(firstParagraph(WIKI)).toBe("main 에 직접 올리지 않는다.");
  });

  it("목록 기호는 떼고, 길면 자른다", () => {
    expect(firstParagraph("# 제목\n\n- 항목 하나")).toBe("항목 하나");
    expect(firstParagraph(`# 제목\n\n${"가".repeat(200)}`)).toHaveLength(80);
  });

  it("본문이 없으면 빈 문자열", () => {
    expect(firstParagraph("# 제목만 있음")).toBe("");
  });
});

describe("digestWiki", () => {
  it("근거와 파인만 기록은 걷어낸다", () => {
    const out = digestWiki(WIKI);
    expect(out).toContain("## 규칙");
    expect(out).not.toContain("## 근거");
    expect(out).not.toContain("규칙정리.pdf");
    expect(out).not.toContain("파인만 기록");
  });

  it("소제목을 주면 그 구간만 돌려준다", () => {
    const out = digestWiki(WIKI, "규칙");
    expect(out.startsWith("## 규칙")).toBe(true);
    expect(out).toContain("리뷰어 한 명이 승인");
    expect(out).not.toContain("main 에 직접 올리지 않는다");
  });

  it("없는 소제목은 예외가 아니라 있는 목록을 알려준다", () => {
    const out = digestWiki(WIKI, "없는 소제목");
    expect(out).toContain("없습니다");
    expect(out).toContain("규칙");
  });

  it("상한을 넘으면 앞부분과 소제목 목록만 준다", () => {
    const long = `# 긴 위키\n\n요약 한 줄.\n\n## 첫째\n\n${"가".repeat(WIKI_INLINE_LIMIT)}\n\n## 둘째\n\n짧음\n`;
    const out = digestWiki(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("첫째 · 둘째");
    expect(out).toContain("section");
    // 상한 이하는 통째로
    expect(digestWiki(WIKI)).toContain("리뷰어 한 명이 승인");
  });

  it("본문이 비면 그렇다고 말한다", () => {
    expect(digestWiki("## 파인만 기록\n\n- 기록만 있음\n")).toBe("(본문이 비어 있습니다)");
  });
});

describe("runTool", () => {
  it("도구 네 개가 정의돼 있다", () => {
    expect(QUERY_TOOLS.map((t) => t.function.name)).toEqual(["list_spaces", "list_wiki", "read_wiki", "get_relations"]);
  });

  it("폴더 · 위키 목록 · 본문 · 관계를 돌려준다", async () => {
    expect(await runTool("list_spaces")).toBe("프로젝트");
    expect(await runTool("list_wiki", { space: "프로젝트" })).toContain("브랜치 보호.md | 브랜치 보호 | main 에 직접");
    expect(await runTool("read_wiki", { space: "프로젝트", file: "브랜치 보호.md" })).toContain("본문입니다");
    expect(await runTool("get_relations", { space: "프로젝트" })).toBe("브랜치 보호 -[related_to]-> 계약 변경 절차");
  });

  it("없는 기능을 불러도 던지지 않고 쓸 수 있는 것을 알려준다", async () => {
    const out = await runTool("delete_everything");
    expect(out).toContain("없습니다");
    expect(out).toContain("read_wiki");
  });

  it("인자가 빠지면 무엇이 필요한지 알려준다", async () => {
    expect(await runTool("list_wiki")).toContain("space");
    expect(await runTool("read_wiki", { space: "프로젝트" })).toContain("file");
  });

  it("IPC 가 실패해도 던지지 않고 문자열로 돌려준다", async () => {
    vi.mocked(ipc.readWiki).mockRejectedValueOnce(new Error("그런 파일 없음"));
    const out = await runTool("read_wiki", { space: "프로젝트", file: "없는파일.md" });
    expect(out).toContain("실행하지 못했습니다");
    expect(out).toContain("그런 파일 없음");
  });
});
