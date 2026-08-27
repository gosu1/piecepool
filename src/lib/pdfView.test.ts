import { describe, it, expect } from "vitest";
import { clampZoom, clampPage, resolveInitialPage } from "./pdfView";

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

describe("resolveInitialPage — 링크가 지정한 page (계약 §3.2)", () => {
  it("범위 안이면 그 page 그대로", () => {
    expect(resolveInitialPage(12, 30)).toEqual({ page: 12, over: false });
  });
  it("마지막 page 는 초과가 아니다", () => {
    expect(resolveInitialPage(10, 10)).toEqual({ page: 10, over: false });
  });
  it("범위 초과면 첫 page + over", () => {
    expect(resolveInitialPage(200, 10)).toEqual({ page: 1, over: true });
  });
  it("total 0(아직 문서 미로드)이면 판정을 미룬다", () => {
    expect(resolveInitialPage(200, 0)).toEqual({ page: 200, over: false });
  });
  it("1 미만은 첫 page (over 아님)", () => {
    expect(resolveInitialPage(0, 10)).toEqual({ page: 1, over: false });
    expect(resolveInitialPage(-3, 10)).toEqual({ page: 1, over: false });
  });
});
