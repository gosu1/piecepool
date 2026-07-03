import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getChunkSettings,
  setChunkEnabled,
  setChunkPercentile,
  chunkOpts,
  getInboxPdfOpen,
  setInboxPdfOpen,
  getInboxTabGroups,
  setInboxTabGroups,
  getInboxPaneWidths,
  setInboxPaneWidth,
  clampPanePct,
  INBOX_PANE_DEFAULTS,
} from "./settings";

// Map 백엔드 fake localStorage — node vitest 환경엔 없으므로 주입.
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key() {
    return null;
  }
  get length() {
    return this.m.size;
  }
}

const g = globalThis as { localStorage?: Storage };

describe("chunk settings", () => {
  beforeEach(() => {
    g.localStorage = new FakeStorage() as unknown as Storage;
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("기본은 꺼짐, percentile 10, chunkOpts undefined", () => {
    expect(getChunkSettings()).toEqual({ enabled: false, percentile: 10 });
    expect(chunkOpts()).toBeUndefined();
  });

  it("켜면 chunkOpts가 {enabled, percentile} 반환", () => {
    setChunkEnabled(true);
    setChunkPercentile(7);
    expect(getChunkSettings()).toEqual({ enabled: true, percentile: 7 });
    expect(chunkOpts()).toEqual({ enabled: true, percentile: 7 });
  });

  it("잘못된 percentile은 기본 10으로 폴백", () => {
    setChunkEnabled(true);
    setChunkPercentile(0); // 0 이하 → 무효
    expect(getChunkSettings().percentile).toBe(10);
  });

  it("inbox PDF 패널 열림 — 기본 닫힘, 저장·복원", () => {
    expect(getInboxPdfOpen()).toBe(false);
    setInboxPdfOpen(true);
    expect(getInboxPdfOpen()).toBe(true);
    setInboxPdfOpen(false);
    expect(getInboxPdfOpen()).toBe(false);
  });

  it("inbox 탭 그룹 — 기본 {a:[note],b:[]}, 저장·복원, 빈 상태 유지(피커)", () => {
    expect(getInboxTabGroups()).toEqual({ a: ["note"], b: [] });
    setInboxTabGroups({ a: ["note"], b: ["wiki"] });
    expect(getInboxTabGroups()).toEqual({ a: ["note"], b: ["wiki"] });
    setInboxTabGroups({ a: [], b: [] });
    expect(getInboxTabGroups()).toEqual({ a: [], b: [] }); // 저장된 빈 상태 = 피커 — 기본값으로 되돌리지 않음
  });

  it("inbox 탭 그룹 — 무효 값 필터, 그룹 간 중복은 a 우선, 구버전 배열 호환", () => {
    localStorage.setItem("inbox-tabs", JSON.stringify({ a: ["note", "junk", "note"], b: ["note", "wiki"] }));
    expect(getInboxTabGroups()).toEqual({ a: ["note"], b: ["wiki"] });
    localStorage.setItem("inbox-tabs", JSON.stringify(["wiki", "junk"])); // 구버전 단일 배열
    expect(getInboxTabGroups()).toEqual({ a: ["wiki"], b: [] });
    localStorage.setItem("inbox-tabs", "not-json");
    expect(getInboxTabGroups()).toEqual({ a: ["note"], b: [] });
  });

  it("inbox 패널 폭 — 기본값, 저장·클램프(15~70), 무효 값 폴백", () => {
    expect(getInboxPaneWidths()).toEqual(INBOX_PANE_DEFAULTS);
    setInboxPaneWidth("pdf", 55.25);
    expect(getInboxPaneWidths().pdf).toBeCloseTo(55.3);
    setInboxPaneWidth("pdf", 5); // 하한 클램프
    expect(getInboxPaneWidths().pdf).toBe(15);
    setInboxPaneWidth("right", 99); // 상한 클램프
    expect(getInboxPaneWidths().right).toBe(70);
    localStorage.setItem("inbox-pane-pdf", "junk");
    expect(getInboxPaneWidths().pdf).toBe(INBOX_PANE_DEFAULTS.pdf);
    expect(clampPanePct(200)).toBe(70);
    expect(clampPanePct(-3)).toBe(15);
  });
});
