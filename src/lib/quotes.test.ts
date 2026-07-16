import { describe, it, expect } from "vitest";
import { LOADING_QUOTES } from "./quotes";

describe("LOADING_QUOTES", () => {
  it("파인만·카파시 두 저자 모두 있고 빈 필드가 없다", () => {
    const authors = new Set(LOADING_QUOTES.map((q) => q.author));
    expect(authors).toEqual(new Set(["리처드 파인만", "안드레 카파시"]));
    for (const q of LOADING_QUOTES) {
      expect(q.text.trim()).not.toBe("");
      expect(q.original.trim()).not.toBe("");
    }
  });
});
