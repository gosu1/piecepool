import { describe, expect, it } from "vitest";
import cytoscape from "cytoscape";
import { graphStylesheet, type GraphTokens } from "./graphStyle";
import { REVIEW_COLOR } from "./relationMeta";

const TOKENS: GraphTokens = {
  label: "#615d59",
  labelBg: "#ffffff",
  core: "#0075de",
  result: "#b8b5ad",
  edge: "#b8b5ad",
  selection: "#0075de",
};

// cytoscape 계산값은 "rgb(224,49,49)" 형태 → 토큰의 #rrggbb 와 비교하려고 맞춘다.
const toHex = (rgb: string) => {
  const m = rgb.match(/\d+/g);
  if (!m) throw new Error(`rgb 아님: ${rgb}`);
  return "#" + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
};

/** 스타일시트를 headless cy 에 물려 노드 계산 스타일을 읽는다. styleEnabled 없이는 스타일이 계산되지 않는다. */
function nodeStyle(data: Record<string, unknown>, selected: boolean, read: (n: cytoscape.NodeSingular) => string) {
  const cy = cytoscape({ headless: true, styleEnabled: true, style: graphStylesheet(TOKENS) as never });
  try {
    cy.add({ data: { id: "n1", label: "커널", kind: "core", size: 20, ...data } });
    const n = cy.getElementById("n1") as unknown as cytoscape.NodeSingular;
    if (selected) n.select();
    return read(n);
  } finally {
    cy.destroy();
  }
}

describe("graphStylesheet — 복습 테두리 vs 선택", () => {
  it("복습 노드는 빨간 점선 테두리", () => {
    expect(toHex(nodeStyle({ review: 1 }, false, (n) => n.style("border-color")))).toBe(REVIEW_COLOR);
    expect(nodeStyle({ review: 1 }, false, (n) => n.style("border-style"))).toBe("dashed");
  });

  // 회귀: 복습 표시는 노드를 클릭한 상태에서만 가능하다(사이드 패널 버튼). 선택 스타일이 테두리 색을
  // 덮으면 표시 직후 빨강이 안 보이고, 선택이 풀리는 페이지 재진입 후에야 나타난다.
  it("복습 노드는 선택돼도 빨강을 유지하고, 선택은 outline 으로 표시된다", () => {
    expect(toHex(nodeStyle({ review: 1 }, true, (n) => n.style("border-color")))).toBe(REVIEW_COLOR);
    expect(toHex(nodeStyle({ review: 1 }, true, (n) => n.style("outline-color")))).toBe(TOKENS.selection);
    expect(parseFloat(nodeStyle({ review: 1 }, true, (n) => n.style("outline-width")))).toBeGreaterThan(0);
  });

  // 고정폭이면 6px 노드는 테두리가 노드를 삼키고, 우선도로 커진 36px 노드는 얇아져 신호가 죽는다.
  it("복습 테두리 두께는 노드 크기(6~36px)에 비례한다", () => {
    const w = (size: number) => parseFloat(nodeStyle({ review: 1, size }, false, (n) => n.style("border-width")));
    expect(w(6)).toBeCloseTo(1.5, 1);
    expect(w(36)).toBeCloseTo(4.5, 1);
    expect(w(21)).toBeGreaterThan(w(6));
    expect(w(21)).toBeLessThan(w(36));
  });

  it("복습 아닌 노드의 선택 테두리는 그대로 selection 색", () => {
    expect(toHex(nodeStyle({}, true, (n) => n.style("border-color")))).toBe(TOKENS.selection);
  });
});
