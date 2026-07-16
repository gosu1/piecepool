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

describe("graphStylesheet — 복습 링 vs 선택 링", () => {
  it("복습 노드는 빨간 점선 링(outline)", () => {
    expect(toHex(nodeStyle({ review: 1 }, false, (n) => n.style("outline-color")))).toBe(REVIEW_COLOR);
    expect(nodeStyle({ review: 1 }, false, (n) => n.style("outline-style"))).toBe("dashed");
  });

  // 핵심 규약: cytoscape 는 outline 을 border 바깥에 그린다. 복습(빨강)은 선택(파랑)보다 강한
  // 신호이므로 바깥이어야 한다. 반대로 두면(복습=border, 선택=outline) 파란 링이 빨강을 감싸
  // 표시 직후 — 표시 버튼은 노드를 고른 상태에서만 누를 수 있다 — 복습 신호가 묻힌다.
  it("복습 노드를 선택하면 빨강은 바깥 링, 파랑은 안쪽 링", () => {
    expect(toHex(nodeStyle({ review: 1 }, true, (n) => n.style("outline-color")))).toBe(REVIEW_COLOR);
    expect(toHex(nodeStyle({ review: 1 }, true, (n) => n.style("border-color")))).toBe(TOKENS.selection);
    expect(parseFloat(nodeStyle({ review: 1 }, true, (n) => n.style("outline-width")))).toBeGreaterThan(0);
    expect(parseFloat(nodeStyle({ review: 1 }, true, (n) => n.style("border-width")))).toBeGreaterThan(0);
  });

  // 고정폭이면 6px 노드는 링이 노드를 삼키고, 우선도로 커진 36px 노드는 얇아져 신호가 죽는다.
  it("복습 링 두께는 노드 크기(6~36px)에 비례한다", () => {
    const w = (size: number, sel: boolean) =>
      parseFloat(nodeStyle({ review: 1, size }, sel, (n) => n.style("outline-width")));
    expect(w(6, false)).toBeCloseTo(1.5, 1);
    expect(w(36, false)).toBeCloseTo(4.5, 1);
    expect(w(21, false)).toBeGreaterThan(w(6, false));
    // 선택 상태에서도 동일해야 한다 — 복습 노드는 늘 선택된 채로 처음 그려진다.
    expect(w(6, true)).toBeCloseTo(1.5, 1);
    expect(w(36, true)).toBeCloseTo(4.5, 1);
  });

  // 선택 링도 고정폭이면 6px 노드를 삼킨다.
  it("선택 링 두께도 노드 크기에 비례한다", () => {
    const w = (size: number) => parseFloat(nodeStyle({ size }, true, (n) => n.style("border-width")));
    expect(w(6)).toBeCloseTo(1.5, 1);
    expect(w(36)).toBeCloseTo(3, 1);
  });

  it("복습 아닌 노드의 선택 링은 그대로 selection 색", () => {
    expect(toHex(nodeStyle({}, true, (n) => n.style("border-color")))).toBe(TOKENS.selection);
  });
});
