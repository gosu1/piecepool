import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getChunkSettings,
  setChunkEnabled,
  setChunkPercentile,
  chunkOpts,
  getInboxPaneWidths,
  setInboxPaneWidth,
  clampPanePct,
  INBOX_PANE_DEFAULTS,
  getOutputLanguage,
  setOutputLanguage,
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

  it("inbox 패널 폭 — 기본값, 저장·클램프(30~70), 무효 값 폴백", () => {
    expect(getInboxPaneWidths()).toEqual(INBOX_PANE_DEFAULTS);
    setInboxPaneWidth("pdf", 55.25);
    expect(getInboxPaneWidths().pdf).toBeCloseTo(55.3);
    setInboxPaneWidth("pdf", 5); // 하한 클램프
    expect(getInboxPaneWidths().pdf).toBe(30);
    setInboxPaneWidth("wiki", 99); // 상한 클램프
    expect(getInboxPaneWidths().wiki).toBe(70);
    localStorage.setItem("inbox-pane-pdf", "junk");
    expect(getInboxPaneWidths().pdf).toBe(INBOX_PANE_DEFAULTS.pdf);
    expect(clampPanePct(200)).toBe(70);
    expect(clampPanePct(-3)).toBe(30);
  });
});

describe("output language (LLM 생성 언어)", () => {
  beforeEach(() => {
    g.localStorage = new FakeStorage() as unknown as Storage;
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("기본은 ko, set 후 반영", () => {
    expect(getOutputLanguage()).toBe("ko");
    setOutputLanguage("en");
    expect(getOutputLanguage()).toBe("en");
    setOutputLanguage("ko");
    expect(getOutputLanguage()).toBe("ko");
  });

  it("무효 저장값은 ko로 폴백", () => {
    localStorage.setItem("output-language", "jp");
    expect(getOutputLanguage()).toBe("ko");
  });
});
