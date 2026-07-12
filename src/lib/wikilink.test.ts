import { describe, it, expect } from "vitest";
import { parseWikilinks, parseEmbedTarget, firstEmbedFile } from "./wikilink";

describe("parseWikilinks", () => {
  it("splits text / link / embed", () => {
    const t = parseWikilinks("보라 [[스레드]] 와 ![[a.png]] 끝");
    expect(t.map((x) => x.kind)).toEqual(["text", "link", "text", "embed", "text"]);
    expect(t[1].value).toBe("스레드");
    expect(t[3].kind).toBe("embed");
    expect(t[3].value).toBe("a.png");
  });
  it("supports [[대상|별칭]]", () => {
    const t = parseWikilinks("[[프로세스|프로세스 개념]]");
    expect(t[0].value).toBe("프로세스");
    expect(t[0].alias).toBe("프로세스 개념");
  });
  it("plain text → single text token", () => {
    expect(parseWikilinks("hello world")).toEqual([{ kind: "text", value: "hello world" }]);
  });
});

describe("parseEmbedTarget", () => {
  it("PDF page (1-indexed integer)", () => {
    expect(parseEmbedTarget("a.pdf#page=12")).toEqual({ file: "a.pdf", page: 12 });
  });
  it("rejects page<1 and non-integer (no crash)", () => {
    expect(parseEmbedTarget("a.pdf#page=0").page).toBeUndefined();
    expect(parseEmbedTarget("a.pdf#page=x").page).toBeUndefined();
    expect(parseEmbedTarget("a.pdf#page=-3").page).toBeUndefined();
  });
  it("image without page", () => {
    expect(parseEmbedTarget("diagram.png")).toEqual({ file: "diagram.png" });
  });
});

describe("firstEmbedFile — 노트당 대표 원본 1개", () => {
  it("첫 pdf 임베드를 찾는다", () => {
    expect(firstEmbedFile("![[lecture.pdf]]\n\n필기")).toEqual({ file: "lecture.pdf", type: "pdf" });
  });

  it("이미지 임베드도 찾는다", () => {
    expect(firstEmbedFile("![[shot.png]]")).toEqual({ file: "shot.png", type: "image" });
  });

  it("#page=N 조각을 떼고 파일명만 준다", () => {
    expect(firstEmbedFile("![[lecture.pdf#page=3]]")).toEqual({ file: "lecture.pdf", type: "pdf" });
  });

  it("임베드가 아닌 위키링크는 무시한다", () => {
    expect(firstEmbedFile("[[lecture.pdf]] 는 링크일 뿐")).toBeNull();
  });

  it("원본이 없으면 null", () => {
    expect(firstEmbedFile("그냥 필기")).toBeNull();
  });

  it("여럿이면 첫 번째만", () => {
    expect(firstEmbedFile("![[a.pdf]]\n![[b.pdf]]")).toEqual({ file: "a.pdf", type: "pdf" });
  });
});
