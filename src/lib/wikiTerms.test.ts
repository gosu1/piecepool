import { describe, it, expect } from "vitest";
import { buildTermMatcher, findTermMatches, findExcludedRanges } from "./wikiTerms";

const M = (titles: string[]) => {
  const m = buildTermMatcher(titles);
  if (!m) throw new Error("matcher null");
  return m;
};

describe("buildTermMatcher", () => {
  it("2글자 미만·공백 제목은 버리고, 전부 걸러지면 null", () => {
    expect(buildTermMatcher([])).toBeNull();
    expect(buildTermMatcher(["a", " ", ""])).toBeNull();
  });

  it("대소문자만 다른 중복 제목은 하나로 접는다", () => {
    const m = M(["TCP", "tcp"]);
    expect(findTermMatches("tcp 연결", m)).toHaveLength(1);
  });
});

describe("findTermMatches — 경계 규칙", () => {
  it("한글 조사 뒤는 매치 인정", () => {
    const m = M(["프로세스"]);
    expect(findTermMatches("프로세스는 실행 단위다", m)).toEqual([{ from: 0, to: 4, title: "프로세스" }]);
    expect(findTermMatches("프로세스에서 시작", m)).toEqual([{ from: 0, to: 4, title: "프로세스" }]);
  });

  it("조사가 아닌 한글이 이어지면 불인정", () => {
    const m = M(["프로세스"]);
    expect(findTermMatches("프로세스들", m)).toEqual([]); // "들"은 whitelist 밖
    expect(findTermMatches("프로세스는지금", m)).toEqual([]); // 조사 뒤에 또 한글
  });

  it("영숫자 부분 단어는 불인정", () => {
    const m = M(["TCP"]);
    expect(findTermMatches("TCP 연결", m)).toHaveLength(1);
    expect(findTermMatches("HTCPCP", m)).toEqual([]);
    expect(findTermMatches("TCP2", m)).toEqual([]);
  });

  it("겹치면 최장 일치 우선", () => {
    const m = M(["운영체제", "운영체제 스케줄러"]);
    expect(findTermMatches("운영체제 스케줄러 개념", m)).toEqual([{ from: 0, to: 9, title: "운영체제 스케줄러" }]);
  });

  it("대소문자 무시 매치, canonical 제목 반환", () => {
    const m = M(["Transformer"]);
    expect(findTermMatches("transformer 구조", m)[0].title).toBe("Transformer");
  });

  it("정규식 메타문자 제목도 안전", () => {
    const m = M(["C++"]);
    expect(findTermMatches("C++ 언어", m)).toEqual([{ from: 0, to: 3, title: "C++" }]);
  });

  it("excluded 구간과 겹치면 버린다", () => {
    const m = M(["프로세스"]);
    expect(findTermMatches("프로세스", m, [{ from: 0, to: 4 }])).toEqual([]);
  });

  it("한 텍스트에서 여러 매치, 등장 순", () => {
    const m = M(["스레드", "프로세스"]);
    const r = findTermMatches("프로세스와 스레드의 차이", m);
    expect(r.map((x) => x.title)).toEqual(["프로세스", "스레드"]);
  });
});

describe("findExcludedRanges", () => {
  it("위키링크·임베드·URL·인라인 코드 구간을 돌려준다", () => {
    const text = "본문 ![[a.pdf]] 과 [[개념]] 그리고 https://x.io/p `코드` 끝";
    const spans = findExcludedRanges(text).map((r) => text.slice(r.from, r.to));
    expect(spans).toEqual(["![[a.pdf]]", "[[개념]]", "https://x.io/p", "`코드`"]);
  });
});
