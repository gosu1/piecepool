import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getChunkSettings,
  setChunkEnabled,
  setChunkPercentile,
  chunkOpts,
  getInboxPdfOpen,
  setInboxPdfOpen,
  getInboxTabs,
  setInboxTabs,
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

  it("inbox 탭 — 기본 [note], 빈 배열 유지(피커 상태), 무효 값 필터·중복 제거", () => {
    expect(getInboxTabs()).toEqual(["note"]);
    setInboxTabs(["note", "wiki"]);
    expect(getInboxTabs()).toEqual(["note", "wiki"]);
    setInboxTabs([]);
    expect(getInboxTabs()).toEqual([]); // 저장된 빈 배열은 피커 상태 — 기본값으로 되돌리지 않음
    localStorage.setItem("inbox-tabs", JSON.stringify(["wiki", "junk", "wiki"]));
    expect(getInboxTabs()).toEqual(["wiki"]);
    localStorage.setItem("inbox-tabs", "not-json");
    expect(getInboxTabs()).toEqual(["note"]);
  });

  it("inbox 패널 폭 — 기본값, 저장·클램프(15~70), 무효 값 폴백", () => {
    expect(getInboxPaneWidths()).toEqual(INBOX_PANE_DEFAULTS);
    setInboxPaneWidth("pdf", 55.25);
    expect(getInboxPaneWidths().pdf).toBeCloseTo(55.3);
    setInboxPaneWidth("pdf", 5); // 하한 클램프
    expect(getInboxPaneWidths().pdf).toBe(15);
    setInboxPaneWidth("pdf", 99); // 상한 클램프
    expect(getInboxPaneWidths().pdf).toBe(70);
    localStorage.setItem("inbox-pane-pdf", "junk");
    expect(getInboxPaneWidths().pdf).toBe(INBOX_PANE_DEFAULTS.pdf);
    expect(clampPanePct(200)).toBe(70);
    expect(clampPanePct(-3)).toBe(15);
  });
});
