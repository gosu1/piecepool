import { describe, it, expect } from "vitest";
import { titleError } from "./titleValidation";

describe("titleError — 제목 허용 문자(한글·영문·숫자·공백·하이픈)", () => {
  it("허용 문자만이면 통과", () => {
    expect(titleError("운영체제 OS-101 개요")).toBeNull();
    expect(titleError("Attention")).toBeNull();
    expect(titleError("ㅁㅁ 초안")).toBeNull(); // 자모도 한글
  });
  it("따옴표·백슬래시는 차단 — frontmatter 왕복 파손 원인", () => {
    expect(titleError('제목 "인용"')).toBe("제목에는 한글·영문·숫자·공백·하이픈만 쓸 수 있어요");
    expect(titleError("a\\b")).not.toBeNull();
  });
  it("그 외 특수문자도 차단", () => {
    expect(titleError("C++")).not.toBeNull();
    expect(titleError("제목: 부제")).not.toBeNull();
  });
  it("빈 문자열은 판단하지 않는다(저장 버튼 비활성 몫)", () => {
    expect(titleError("")).toBeNull();
  });
});
