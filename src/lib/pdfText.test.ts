import { describe, it, expect } from "vitest";
import { base64ToBytes, hasText, joinItems } from "./pdfText";
import type { PdfExtractResult } from "./generated/PdfExtractResult";

describe("base64ToBytes", () => {
  it("decodes base64 to the original bytes", () => {
    // "PDF" → UGRG? 실제 base64: btoa("PDF") === "UERG"
    const bytes = base64ToBytes(btoa("PDF"));
    expect(Array.from(bytes)).toEqual([80, 68, 70]);
  });
  it("handles empty input", () => {
    expect(base64ToBytes("").length).toBe(0);
  });
});

describe("joinItems", () => {
  it("concatenates item strings", () => {
    expect(joinItems([{ str: "가" }, { str: "나" }, { str: "다" }])).toBe("가나다");
  });
  it("treats missing str as empty", () => {
    expect(joinItems([{ str: "a" }, {}, { str: "b" }])).toBe("ab");
  });
});

describe("hasText", () => {
  const mk = (texts: string[]): PdfExtractResult => ({
    pageCount: texts.length,
    pages: texts.map((text, i) => ({ page: i + 1, text })),
  });
  it("true when any page has non-whitespace text", () => {
    expect(hasText(mk(["", "  실제 내용 ", ""]))).toBe(true);
  });
  it("false when all pages are empty or whitespace (스캔본)", () => {
    expect(hasText(mk(["", "   ", "\n\n"]))).toBe(false);
  });
  it("false for a zero-page result", () => {
    expect(hasText(mk([]))).toBe(false);
  });
});
