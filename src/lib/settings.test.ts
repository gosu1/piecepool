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
  getBodyFontSize,
  setBodyFontSize,
  BODY_FONT_MIN,
  BODY_FONT_MAX,
  llmEndpoint,
  setLlmEndpoint,
  engineLabel,
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

describe("LLM 엔드포인트", () => {
  beforeEach(() => {
    g.localStorage = new FakeStorage() as unknown as Storage;
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("미설정이면 undefined — 호출부가 모듈 기본값(Gemini)을 그대로 쓴다", () => {
    expect(llmEndpoint()).toBeUndefined();
  });

  it("set/get 라운드트립 — 앞뒤 공백은 제거", () => {
    setLlmEndpoint("  http://localhost:11434/v1  ");
    expect(llmEndpoint()).toBe("http://localhost:11434/v1");
  });

  it("빈 값·공백만이면 undefined (빈 문자열이 기본값을 덮어쓰면 안 된다)", () => {
    setLlmEndpoint("http://localhost:11434/v1");
    setLlmEndpoint("   ");
    expect(llmEndpoint()).toBeUndefined();
  });
});

// 저장 전 입력값으로 뱃지가 즉시 바뀌는 기존 결(hasKey)을 따른다 → localStorage 가 아니라 인자로 판정.
describe("engineLabel — 설정 모달 LLM 엔진 뱃지", () => {
  it("키 없으면 휴리스틱 — 엔드포인트를 넣어도 마찬가지다 (키 없이는 LLM 호출 자체를 안 한다)", () => {
    expect(engineLabel("", "")).toBe("휴리스틱(오프라인)");
    expect(engineLabel("  ", "http://localhost:11434/v1")).toBe("휴리스틱(오프라인)");
  });

  it("키만 있으면 Gemini", () => {
    expect(engineLabel("k", "")).toBe("Gemini");
    expect(engineLabel("k", "   ")).toBe("Gemini"); // 공백만 = 미설정
  });

  it("키 + 엔드포인트면 로컬", () => {
    expect(engineLabel("k", "http://localhost:11434/v1")).toBe("로컬");
  });
});

describe("본문 글자 크기", () => {
  beforeEach(() => {
    g.localStorage = new FakeStorage() as unknown as Storage;
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("기본값 15", () => {
    expect(getBodyFontSize()).toBe(15);
  });

  it("set/get 라운드트립", () => {
    setBodyFontSize(17);
    expect(getBodyFontSize()).toBe(17);
  });

  it("범위 밖·비정수·쓰레기 값은 클램프/폴백", () => {
    setBodyFontSize(12);
    expect(getBodyFontSize()).toBe(BODY_FONT_MIN); // 12 → 13
    setBodyFontSize(99);
    expect(getBodyFontSize()).toBe(BODY_FONT_MAX); // 99 → 17
    localStorage.setItem("body-font-size", "abc");
    expect(getBodyFontSize()).toBe(15);
    localStorage.setItem("body-font-size", "15.7");
    expect(getBodyFontSize()).toBe(15); // 정수화
  });
});
