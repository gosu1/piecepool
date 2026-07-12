import { describe, it, expect } from "vitest";
import { buildMessages } from "./gemini";
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
