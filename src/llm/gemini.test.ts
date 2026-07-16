import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildMessages, getGeminiModel, setGeminiModel, GEMINI_MODEL } from "./gemini";
import type { LlmWikiInput } from "./provider";

const INPUT = { sourceId: "s1", sourceTitle: "T", sourceText: "본문" } as unknown as LlmWikiInput;

describe("buildMessages — 위키 생성 언어 directive", () => {
  it("ko(기본) — system에 혼용 규칙 + JSON 지시 유지", () => {
    const m = buildMessages(INPUT);
    expect(m[0].role).toBe("system");
    expect(m[0].content).toContain("LlmWikiResult");
    expect(m[0].content).toContain("원문 표기를 그대로");
    expect(m[1].content).toContain("본문");
  });

  it("en — English 지시", () => {
    const m = buildMessages(INPUT, "en");
    expect(m[0].content).toContain("Write all prose in English");
    expect(m[0].content).not.toContain("서술은 한국어로 쓴다");
  });
});

// Map 백엔드 fake localStorage — node vitest 환경엔 없으므로 주입 (settings.test.ts와 동형).
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe("getGeminiModel — 설정 모델 선택", () => {
  const g = globalThis as { localStorage?: Storage };
  beforeEach(() => {
    g.localStorage = new FakeStorage() as unknown as Storage;
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("미설정이면 기본값(3.5 flash)", () => {
    expect(getGeminiModel()).toBe(GEMINI_MODEL);
  });

  it("설정하면 그 모델, 재조회도 유지", () => {
    setGeminiModel("gemini-3.1-flash-lite");
    expect(getGeminiModel()).toBe("gemini-3.1-flash-lite");
  });

  it("목록에 없는 값(옛 단종 모델 등)은 기본값으로 폴백", () => {
    localStorage.setItem("gemini-model", "gemini-2.5-flash");
    expect(getGeminiModel()).toBe(GEMINI_MODEL);
  });

  it("localStorage 없는 환경(CLI·eval)에서도 기본값", () => {
    delete g.localStorage;
    expect(getGeminiModel()).toBe(GEMINI_MODEL);
  });
});
