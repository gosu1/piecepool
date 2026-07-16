import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { remarkWikilink } from "./wikilink";
import { buildTermMatcher, findTermMatches, findExcludedRanges, remarkWikiTerm } from "./wikiTerms";

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

  it("최장 후보가 경계에서 실패해도 같은 위치의 짧은 제목을 살린다", () => {
    const m = M(["스레드", "스레드 풀"]);
    // "스레드 풀링" — "스레드 풀"은 뒤에 "링"(조사 아님)이라 탈락, 하지만 "스레드"는 유효
    expect(findTermMatches("스레드 풀링 얘기", m)).toEqual([{ from: 0, to: 3, title: "스레드" }]);
    const m2 = M(["운영체제", "운영체제 스케줄러"]);
    expect(findTermMatches("운영체제 스케줄러들 개념", m2)).toEqual([{ from: 0, to: 4, title: "운영체제" }]);
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

  it("toLowerCase 로 길이가 변하는 문자(İ) 뒤에서도 인덱스가 어긋나지 않는다", () => {
    // 'İ'.toLowerCase() 는 2 code unit — 전체 소문자 사본의 인덱스 산술은 이 문자 뒤를 전부 어긋나게 했다
    const m = M(["스레드"]);
    expect(findTermMatches("İ 스레드 얘기", m)).toEqual([{ from: 2, to: 5, title: "스레드" }]);
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

// ── remarkWikiTerm — markdown.tsx 와 같은 unified 체인으로 hast 검증(markdownRender.test.ts 패턴) ──
interface HNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { href?: string };
  children?: HNode[];
}

function toHast(md: string, titles: string[]): HNode {
  const p = unified()
    .use(remarkParse)
    .use(remarkWikilink as never) // markdown.tsx 와 같은 순서 — 위키링크 먼저 링크 노드가 된다
    .use(remarkWikiTerm as never, { titles })
    .use(remarkRehype);
  return p.runSync(p.parse(md)) as unknown as HNode;
}

function findAllH(node: HNode, pred: (n: HNode) => boolean): HNode[] {
  const out: HNode[] = [];
  const walk = (n: HNode) => {
    if (pred(n)) out.push(n);
    n.children?.forEach(walk);
  };
  walk(node);
  return out;
}

// remark-rehype 는 href 의 비ASCII 를 percent-encoding 한다 — markdown.tsx 의 a 렌더가
// decodeURIComponent 로 되돌리는 것과 같은 규칙으로 비교한다.
const href = (n: HNode) => {
  const h = n.properties?.href ?? "";
  try {
    return decodeURIComponent(h);
  } catch {
    return h;
  }
};

describe("remarkWikiTerm", () => {
  it("본문 텍스트의 개념을 term: 링크로 치환한다", () => {
    const tree = toHast("프로세스는 실행 단위다", ["프로세스"]);
    const links = findAllH(tree, (n) => n.tagName === "a");
    expect(links).toHaveLength(1);
    expect(href(links[0])).toBe("term:프로세스");
  });

  it("헤딩 속 개념도 치환한다", () => {
    const tree = toHast("## 프로세스 개요", ["프로세스"]);
    const links = findAllH(tree, (n) => n.tagName === "a" && href(n) === "term:프로세스");
    expect(links).toHaveLength(1);
  });

  it("[[위키링크]] 안은 건드리지 않는다 — 중첩 링크 금지", () => {
    const tree = toHast("[[프로세스]] 참고", ["프로세스"]);
    const links = findAllH(tree, (n) => n.tagName === "a");
    expect(links).toHaveLength(1); // wiki: 링크 하나뿐
    expect(href(links[0])).toBe("wiki:프로세스");
  });

  it("인라인 코드·코드블록은 건드리지 않는다", () => {
    const tree = toHast("`프로세스`\n\n```\n프로세스\n```", ["프로세스"]);
    expect(findAllH(tree, (n) => n.tagName === "a")).toHaveLength(0);
  });

  it("제목 목록이 비면 no-op", () => {
    const tree = toHast("프로세스", []);
    expect(findAllH(tree, (n) => n.tagName === "a")).toHaveLength(0);
  });
});
