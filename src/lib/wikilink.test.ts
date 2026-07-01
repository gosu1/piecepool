import { describe, it, expect } from "vitest";
import { parseWikilinks, parseEmbedTarget } from "./wikilink";

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
