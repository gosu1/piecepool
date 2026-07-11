// 읽기 모드 렌더 파이프라인 통합 검증 — markdown.tsx 와 동일한 remark/rehype 체인을 문자열→hast 로 돌려
// (jsdom 없이) remarkCallout 이 details 를, rehype-katex 가 KaTeX 를 실제로 만드는지 못박는다.
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import { remarkCallout } from "./callout";

interface HNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: string[] | string };
  children?: HNode[];
}

function toHast(md: string): HNode {
  const p = unified().use(remarkParse).use(remarkMath).use(remarkCallout as never).use(remarkRehype).use(rehypeKatex);
  return p.runSync(p.parse(md)) as unknown as HNode;
}

function find(node: HNode, pred: (n: HNode) => boolean): HNode | null {
  if (pred(node)) return node;
  for (const c of node.children ?? []) {
    const hit = find(c, pred);
    if (hit) return hit;
  }
  return null;
}
function findAll(node: HNode, pred: (n: HNode) => boolean): HNode[] {
  const out: HNode[] = [];
  const walk = (n: HNode) => {
    if (pred(n)) out.push(n);
    n.children?.forEach(walk);
  };
  walk(node);
  return out;
}
const hasClass = (n: HNode, c: string) => {
  const cls = n.properties?.className;
  return Array.isArray(cls) ? cls.includes(c) : cls === c;
};

describe("읽기 모드 렌더 파이프라인", () => {
  it("> [!easy] → details + summary(제목)", () => {
    const tree = toHast("> [!easy] 쉬운 설명\n> 우편배달부 비유입니다.");
    const details = find(tree, (n) => n.tagName === "details");
    expect(details).not.toBeNull();
    expect(hasClass(details!, "pp-callout-easy")).toBe(true);
    const summary = find(details!, (n) => n.tagName === "summary");
    expect(summary).not.toBeNull();
    expect(find(summary!, (n) => n.value === "쉬운 설명")).not.toBeNull();
    // 본문은 유지되고 마커 텍스트는 사라진다
    expect(find(details!, (n) => n.value?.includes("우편배달부") ?? false)).not.toBeNull();
    expect(find(details!, (n) => n.value?.includes("[!easy]") ?? false)).toBeNull();
  });

  it("인라인 $...$ → KaTeX(span.katex)", () => {
    const tree = toHast("피타고라스 $a^2+b^2=c^2$ 정리");
    const katex = find(tree, (n) => hasClass(n, "katex"));
    expect(katex).not.toBeNull();
  });

  it("블록 $$...$$ → KaTeX display", () => {
    const tree = toHast("$$\nE = mc^2\n$$");
    expect(find(tree, (n) => hasClass(n, "katex-display"))).not.toBeNull();
  });

  it("일반 인용문은 blockquote 그대로", () => {
    const tree = toHast("> 그냥 인용문");
    expect(find(tree, (n) => n.tagName === "blockquote")).not.toBeNull();
    expect(find(tree, (n) => n.tagName === "details")).toBeNull();
  });

  it("콜아웃 안 인라인 수식도 렌더된다", () => {
    const tree = toHast("> [!easy] 쉬운 설명\n> 차원은 $d=512$ 입니다.");
    expect(find(tree, (n) => n.tagName === "details")).not.toBeNull();
    expect(findAll(tree, (n) => hasClass(n, "katex")).length).toBeGreaterThan(0);
  });
});
