import { describe, it, expect } from "vitest";
import { titleError } from "./titleValidation";

const ERR = '제목에는 큰따옴표(")와 역슬래시(\\)를 쓸 수 없어요';

describe("titleError — 큰따옴표·역슬래시만 거부", () => {
  it("한글·영문·숫자·공백·하이픈은 통과", () => {
    expect(titleError("운영체제 OS-101 개요")).toBeNull();
    expect(titleError("Attention")).toBeNull();
    expect(titleError("ㅁㅁ 초안")).toBeNull(); // 자모도 한글
  });
  it("괄호·쉼표·슬래시 등 특수문자도 통과 — frontmatter 왕복과 무관", () => {
    expect(titleError("OS 개요 노트 (수정)")).toBeNull();
    expect(titleError("C++")).toBeNull();
    expect(titleError("제목: 부제")).toBeNull();
    expect(titleError("입출력, 스케줄링/동기화")).toBeNull();
    expect(titleError("v1.2 요약")).toBeNull();
    expect(titleError("작은따옴표 '인용'")).toBeNull();
  });
  it("큰따옴표·역슬래시는 차단 — frontmatter 왕복 파손 원인", () => {
    expect(titleError('제목 "인용"')).toBe(ERR);
    expect(titleError("a\\b")).toBe(ERR);
  });
  it("빈 문자열은 판단하지 않는다(저장 버튼 비활성 몫)", () => {
    expect(titleError("")).toBeNull();
  });
});
