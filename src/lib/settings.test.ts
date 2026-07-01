import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getChunkSettings, setChunkEnabled, setChunkPercentile, chunkOpts } from "./settings";

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
});
