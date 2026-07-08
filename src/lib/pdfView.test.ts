import { describe, it, expect } from "vitest";
import { clampZoom, clampPage } from "./pdfView";

describe("clampZoom", () => {
  it("keeps values in range", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(0.1)).toBe(0.1);
    expect(clampZoom(3)).toBe(3);
  });
  it("clamps below 0.1 and above 3.0", () => {
    expect(clampZoom(0.05)).toBe(0.1);
    expect(clampZoom(0)).toBe(0.1);
    expect(clampZoom(3.1)).toBe(3);
  });
});

describe("clampPage", () => {
  it("keeps values in 1..total", () => {
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(1, 5)).toBe(1);
    expect(clampPage(5, 5)).toBe(5);
  });
  it("clamps out-of-range", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-2, 5)).toBe(1);
    expect(clampPage(6, 5)).toBe(5);
  });
  it("total 0 (미로드) → 1", () => {
    expect(clampPage(7, 0)).toBe(1);
  });
});
