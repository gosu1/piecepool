import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getChunkSettings,
  setChunkEnabled,
  setChunkPercentile,
  chunkOpts,
  getInboxView,
  setInboxView,
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

  it("inbox 분할 뷰 — 기본 2, 3으로 전환·복원, 무효 값은 2로 폴백", () => {
    expect(getInboxView()).toBe("2");
    setInboxView("3");
    expect(getInboxView()).toBe("3");
    setInboxView("2");
    expect(getInboxView()).toBe("2");
    localStorage.setItem("inbox-view", "junk");
    expect(getInboxView()).toBe("2");
  });

  it("inbox 패널 폭 — 기본값, 저장·클램프(15~70), 무효 값 폴백", () => {
    expect(getInboxPaneWidths()).toEqual(INBOX_PANE_DEFAULTS);
    setInboxPaneWidth("note", 55.25);
    expect(getInboxPaneWidths().note).toBeCloseTo(55.3);
    setInboxPaneWidth("pdf", 5); // 하한 클램프
    expect(getInboxPaneWidths().pdf).toBe(15);
    setInboxPaneWidth("wiki", 99); // 상한 클램프
    expect(getInboxPaneWidths().wiki).toBe(70);
    localStorage.setItem("inbox-pane-note", "junk");
    expect(getInboxPaneWidths().note).toBe(INBOX_PANE_DEFAULTS.note);
    expect(clampPanePct(200)).toBe(70);
    expect(clampPanePct(-3)).toBe(15);
  });
});
