import { describe, it, expect } from "vitest";
import { languageDirective } from "./language";

describe("languageDirective — 혼용 규칙 SSOT", () => {
  it("ko — 원문 표기·도메인 관례·조사·문장 단위 금지 규칙 포함", () => {
    const d = languageDirective("ko");
    expect(d).toContain("서술은 한국어로 쓴다");
    expect(d).toContain("원문 표기를 그대로");
    expect(d).toContain("영어 원어가 통용되면 영어");
    expect(d).toContain("고유명사");
    expect(d).toContain("조사는 자연스럽게");
    expect(d).toContain("문장 전체를 영어로 쓰지 않는다");
  });

  it("en — 영어 산문 지시, 한국어 규칙 없음", () => {
    const d = languageDirective("en");
    expect(d).toContain("Write all prose in English");
    expect(d).not.toContain("한국어");
  });

  it("인자 생략 시 Node(localStorage 없음) 기본은 ko", () => {
    expect(languageDirective()).toContain("서술은 한국어로 쓴다");
  });
});
