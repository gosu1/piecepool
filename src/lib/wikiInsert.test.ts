import { describe, expect, it } from "vitest";
import { insertUnderSection, appendSection, type InsertResult } from "./wikiInsert";

// 이 테스트의 핵심은 딱 하나다 — 끼워 넣은 뒤 **원문 글자가 한 자도 안 바뀌었는가**.
//
// 확인 방법으로 `결과.replace(덩어리, "") === 원문` 을 쓰면 안 된다. replace 는 처음 만난 것
// 하나만 지우므로, 넣으려는 덩어리와 똑같은 줄이 원문에 이미 있으면 원문 쪽을 지우고도 글자 수가
// 맞아 테스트가 통과해 버린다(아래 "같은 줄이 이미 있어도" 케이스가 그 함정이다).
//
// 대신 자리를 대조한다: 앞부분 · 뒷부분 · 길이 셋이 맞으면 원문은 그대로다.
function expectUntouched(md: string, r: InsertResult): asserts r is Extract<InsertResult, { ok: true }> {
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.markdown.slice(0, r.at)).toBe(md.slice(0, r.at));
  expect(r.markdown.slice(r.at + r.chunk.length)).toBe(md.slice(r.at));
  expect(r.markdown.length).toBe(md.length + r.chunk.length);
}

const WIKI = [
  "# 브랜치 보호",
  "",
  "main 에 직접 올리지 않는다.",
  "",
  "## 규칙",
  "",
  "- 리뷰어 한 명이 승인해야 합칠 수 있다",
  "",
  "## 관련 질문",
  "",
  "- 합친 뒤 브랜치를 안 지우면?",
  "",
].join("\n");

describe("insertUnderSection", () => {
  it("소제목 아래에 넣고, 원문은 한 글자도 안 바뀐다", () => {
    const r = insertUnderSection(WIKI, "규칙", "- CI 가 빨간불이면 합치지 않는다");
    expectUntouched(WIKI, r);
    expect(r.markdown).toContain("- 리뷰어 한 명이 승인해야 합칠 수 있다\n- CI 가 빨간불이면 합치지 않는다");
    // 다음 소제목 앞 빈 줄이 살아 있어야 마크다운이 깨지지 않는다
    expect(r.markdown).toContain("합치지 않는다\n\n## 관련 질문");
  });

  it("같은 줄이 이미 있어도 원문 쪽을 건드리지 않는다", () => {
    const dup = "- 리뷰어 한 명이 승인해야 합칠 수 있다";
    const r = insertUnderSection(WIKI, "규칙", dup);
    expectUntouched(WIKI, r);
    // 두 번 나온다 — 원문 것이 지워지지 않았다는 뜻
    expect(r.markdown.split(dup).length - 1).toBe(2);
  });

  it("맨 끝 소제목에도 넣는다", () => {
    const r = insertUnderSection(WIKI, "관련 질문", "- 예외는 어떤 경우인가?");
    expectUntouched(WIKI, r);
    expect(r.markdown.trimEnd().endsWith("- 예외는 어떤 경우인가?")).toBe(true);
  });

  it("내용이 없는 소제목이면 헤딩 바로 다음 줄에 넣는다", () => {
    const md = "# 제목\n\n## 빈 섹션\n\n## 다음\n\n내용\n";
    const r = insertUnderSection(md, "빈 섹션", "첫 줄");
    expectUntouched(md, r);
    expect(r.markdown).toContain("## 빈 섹션\n첫 줄\n\n## 다음");
  });

  it("CRLF 문서는 CRLF 로 이어 붙인다", () => {
    const md = "# 제목\r\n\r\n## 규칙\r\n\r\n- 하나\r\n";
    const r = insertUnderSection(md, "규칙", "- 둘");
    expectUntouched(md, r);
    expect(r.chunk).toBe("\r\n- 둘");
  });

  it("코드펜스 안의 `## 가짜` 는 소제목이 아니다", () => {
    const md = "# 제목\n\n```\n## 가짜\n```\n\n## 진짜\n\n- 하나\n";
    expect(insertUnderSection(md, "가짜", "x")).toEqual({ ok: false, reason: "section-not-found" });
    expectUntouched(md, insertUnderSection(md, "진짜", "- 둘"));
  });

  it("파인만 기록 구역은 거부한다", () => {
    const md = WIKI + "\n## 파인만 기록\n\n- 2026-08-23 설명함\n";
    expect(insertUnderSection(md, "파인만 기록", "끼어들기")).toEqual({ ok: false, reason: "feynman-section" });
  });

  it("없는 소제목과 빈 글은 거부한다", () => {
    expect(insertUnderSection(WIKI, "없는 소제목", "x")).toEqual({ ok: false, reason: "section-not-found" });
    expect(insertUnderSection(WIKI, "규칙", "   \n  ")).toEqual({ ok: false, reason: "empty-block" });
  });

  it("문서 제목(level 1)은 소제목으로 치지 않는다", () => {
    expect(insertUnderSection(WIKI, "브랜치 보호", "x")).toEqual({ ok: false, reason: "section-not-found" });
  });
});

describe("appendSection", () => {
  it("새 소제목을 문서 끝에 만든다", () => {
    const r = appendSection(WIKI, "헷갈리는 개념", "- 일반 PR 과 계약 PR 은 승인 조건이 다르다");
    expectUntouched(WIKI, r);
    expect(r.markdown).toContain("## 헷갈리는 개념\n\n- 일반 PR 과 계약 PR 은 승인 조건이 다르다");
  });

  it("파인만 기록이 있으면 그 앞에 넣는다", () => {
    const md = WIKI + "\n## 파인만 기록\n\n- 2026-08-23 설명함\n";
    const r = appendSection(md, "헷갈리는 개념", "- 새 내용");
    expectUntouched(md, r);
    // 새 섹션이 파인만 기록보다 앞에 있어야 한다
    expect(r.markdown.indexOf("## 헷갈리는 개념")).toBeLessThan(r.markdown.indexOf("## 파인만 기록"));
  });

  it("이미 있는 소제목 이름이면 거부한다", () => {
    expect(appendSection(WIKI, "규칙", "x")).toEqual({ ok: false, reason: "section-exists" });
    expect(appendSection(WIKI, "파인만 기록", "x")).toEqual({ ok: false, reason: "feynman-section" });
  });
});
