import { describe, it, expect } from "vitest";
import { parseWikilinks, parseEmbedTarget, firstEmbedFile, noteOriginalFiles, renameRefs } from "./wikilink";

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

describe("noteOriginalFiles — 노트가 가진 원본 전부", () => {
  it("PDF + 이미지 여러 장을 등장 순으로 전부 준다", () => {
    expect(noteOriginalFiles("![[lecture.pdf]]\n필기\n![[a.png]]\n![[b.jpg]]")).toEqual([
      "lecture.pdf",
      "a.png",
      "b.jpg",
    ]);
  });

  it("중복은 한 번만(#page=N 조각은 뗀다)", () => {
    expect(noteOriginalFiles("![[a.pdf#page=1]]\n![[a.pdf#page=7]]\n![[a.pdf]]")).toEqual(["a.pdf"]);
  });

  it("임베드가 아닌 [[링크]]는 원본이 아니다", () => {
    expect(noteOriginalFiles("[[a.pdf]] 는 링크일 뿐\n![[b.png]]")).toEqual(["b.png"]);
  });

  it("원본 확장자가 아니면 제외한다", () => {
    expect(noteOriginalFiles("![[note.md]]\n![[a.png]]")).toEqual(["a.png"]);
  });

  it("refSource 는 본문에 임베드가 없어도 포함한다", () => {
    expect(noteOriginalFiles("![[a.png]]", "lecture.pdf")).toEqual(["a.png", "lecture.pdf"]);
  });

  it("refSource 가 이미 본문에 있으면 중복하지 않는다", () => {
    expect(noteOriginalFiles("![[lecture.pdf]]", "lecture.pdf")).toEqual(["lecture.pdf"]);
  });

  it("원본이 없으면 빈 배열", () => {
    expect(noteOriginalFiles("그냥 필기")).toEqual([]);
    expect(noteOriginalFiles("", "")).toEqual([]);
  });
});

describe("renameRefs — 원본 이동 후 참조 리네임", () => {
  it("임베드 형태", () => {
    expect(renameRefs("![[a.pdf]]", "a.pdf", "a-2.pdf")).toBe("![[a-2.pdf]]");
  });

  it("#page=N 임베드 형태", () => {
    expect(renameRefs("![[a.pdf#page=3]]", "a.pdf", "a-2.pdf")).toBe("![[a-2.pdf#page=3]]");
  });

  it("링크 형태(임베드 아님)도 바꾼다", () => {
    expect(renameRefs("[[a.pdf]] 참고", "a.pdf", "a-2.pdf")).toBe("[[a-2.pdf]] 참고");
  });

  it("#page=N 링크 형태", () => {
    expect(renameRefs("[[a.pdf#page=12]]", "a.pdf", "a-2.pdf")).toBe("[[a-2.pdf#page=12]]");
  });

  it("별칭도 보존한다", () => {
    expect(renameRefs("[[a.pdf|강의록]]", "a.pdf", "a-2.pdf")).toBe("[[a-2.pdf|강의록]]");
  });

  it("a.pdf 를 바꿔도 aa.pdf 는 건드리지 않는다", () => {
    expect(renameRefs("![[aa.pdf]] ![[a.pdf]]", "a.pdf", "a-2.pdf")).toBe("![[aa.pdf]] ![[a-2.pdf]]");
  });

  it("정규식 메타문자가 든 파일명도 리터럴로 다룬다", () => {
    expect(renameRefs("![[a+b(1).png]] ![[axb(1).png]]", "a+b(1).png", "c.png")).toBe("![[c.png]] ![[axb(1).png]]");
  });

  it("같은 파일을 여러 번 참조해도 전부 바꾼다", () => {
    expect(renameRefs("![[a.pdf]]\n[[a.pdf]]\n![[a.pdf#page=2]]", "a.pdf", "b.pdf")).toBe(
      "![[b.pdf]]\n[[b.pdf]]\n![[b.pdf#page=2]]",
    );
  });

  it("이름이 그대로면 본문도 그대로", () => {
    expect(renameRefs("![[a.pdf]]", "a.pdf", "a.pdf")).toBe("![[a.pdf]]");
  });
});
