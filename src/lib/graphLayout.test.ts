import { describe, it, expect } from "vitest";
import { createLayoutSim } from "./graphLayout";
import type { LayoutInput } from "./graphLayout";

// d3-force 는 초기 배치가 결정적(phyllotaxis 나선)이고, 유일한 난수원은 동일 좌표를 흔드는
// jiggle 뿐이다. randomSource 를 시드 RNG 로 바꾸면 시뮬 전체가 재현 가능해진다.
// 덕분에 "시각 배치는 테스트 못 한다"가 성립하지 않는다.
function seeded(seed = 0x9e3779b9) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 800;
const H = 600;

// 시뮬을 냉각 완료까지 돌린다. tick() 은 타이머가 아니라 즉시 반복이라 결정적이다.
function settle(input: LayoutInput) {
  const { sim, map } = createLayoutSim(input, seeded());
  sim.stop();
  while (sim.alpha() > sim.alphaMin()) sim.tick();
  return map;
}

const y = (map: Map<string, { y?: number | null }>, id: string) => {
  const v = map.get(id)?.y;
  if (v == null) throw new Error(`no y for ${id}`);
  return v;
};

// ── 픽스처: 실제 사용자 워크스페이스 두 곳의 구조 (~/PiecePool, 대칭 dedup 적용 후) ──

// 생리학. part_of 4연쇄가 나머지 그래프와 **완전히 분리된 섬**이다 —
// 비계층 엣지가 계층 노드에 하나도 닿지 않는다. 이웃 depth 전파형 해법이 무효인 이유.
const PHYSIOLOGY: LayoutInput = {
  width: W,
  height: H,
  layout: "hier",
  nodes: [
    "organ-system",
    "organ",
    "tissue",
    "cell",
    "insulin",
    "hyperglycemia",
    "glucagon",
    "gradient",
    "diffusion",
    "sympathetic",
    "parasympathetic",
    "osmosis", // 고립 — 엣지 없음
  ].map((id) => ({ id })),
  edges: [
    { source: "organ", target: "organ-system", rel: "part_of" },
    { source: "tissue", target: "organ", rel: "part_of" },
    { source: "cell", target: "tissue", rel: "part_of" },
    { source: "insulin", target: "hyperglycemia", rel: "solves" },
    { source: "gradient", target: "diffusion", rel: "causes" },
    { source: "insulin", target: "glucagon", rel: "contrasts" },
    { source: "sympathetic", target: "parasympathetic", rel: "contrasts" },
  ],
};
// depth: organ-system 0 → organ 1 → tissue 2 → cell 3
const PHYS_CHAIN = ["organ-system", "organ", "tissue", "cell"];
const PHYS_FLOATING = ["insulin", "hyperglycemia", "glucagon", "gradient", "diffusion", "sympathetic", "parasympathetic"];

// 통계학. 계층 노드 hypothesis-testing 에 used_in 링크 6개가 부동 노드로 매달려 있다 —
// 링크 힘(0.4)이 계층 노드를 제 층에서 끌어내리는 경우.
const STATISTICS: LayoutInput = {
  width: W,
  height: H,
  layout: "hier",
  nodes: [
    "statistics",
    "sampling-dist",
    "hypothesis-testing",
    "p-value",
    "significance",
    "t-test",
    "regression",
    "linear-regression",
    "null-hypothesis",
    "alt-hypothesis",
    "test-statistic",
    "rejection-region",
    "p-prob",
    "type-i",
    "type-ii",
    "gradient-descent",
    "clt", // 고립
  ].map((id) => ({ id })),
  edges: [
    { source: "hypothesis-testing", target: "statistics", rel: "part_of" },
    { source: "hypothesis-testing", target: "sampling-dist", rel: "prerequisite" },
    { source: "hypothesis-testing", target: "null-hypothesis", rel: "used_in" },
    { source: "hypothesis-testing", target: "alt-hypothesis", rel: "used_in" },
    { source: "hypothesis-testing", target: "significance", rel: "used_in" },
    { source: "hypothesis-testing", target: "test-statistic", rel: "used_in" },
    { source: "hypothesis-testing", target: "rejection-region", rel: "used_in" },
    { source: "hypothesis-testing", target: "p-prob", rel: "used_in" },
    { source: "null-hypothesis", target: "alt-hypothesis", rel: "contrasts" },
    { source: "p-value", target: "hypothesis-testing", rel: "part_of" },
    { source: "significance", target: "hypothesis-testing", rel: "part_of" },
    { source: "p-value", target: "significance", rel: "related_to" },
    { source: "type-i", target: "type-ii", rel: "confused_with" },
    { source: "t-test", target: "hypothesis-testing", rel: "part_of" },
    { source: "regression", target: "hypothesis-testing", rel: "used_in" },
    { source: "linear-regression", target: "regression", rel: "part_of" },
    { source: "gradient-descent", target: "linear-regression", rel: "used_in" },
  ],
};
// depth: statistics 0, sampling-dist 0, regression 0 | hypothesis-testing 1, linear-regression 1
//        p-value 2, significance 2, t-test 2
const STATS_LAYERS: [string, number][] = [
  ["statistics", 0],
  ["sampling-dist", 0],
  ["regression", 0],
  ["hypothesis-testing", 1],
  ["linear-regression", 1],
  ["p-value", 2],
  ["significance", 2],
  ["t-test", 2],
];
const STATS_FLOATING = ["null-hypothesis", "alt-hypothesis", "test-statistic", "rejection-region", "p-prob", "type-i", "type-ii", "gradient-descent"];

describe("createLayoutSim — 계층 모드", () => {
  it("계층 노드의 y 는 depth 순서를 따른다 — 냉각 완료 후에도 (생리학)", () => {
    const map = settle(PHYSIOLOGY);
    const ys = PHYS_CHAIN.map((id) => y(map, id));
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i], `${PHYS_CHAIN[i]} 는 ${PHYS_CHAIN[i - 1]} 보다 아래여야 한다`).toBeGreaterThan(ys[i - 1]);
    }
  });

  it("계층 노드의 y 는 depth 순서를 따른다 — 링크 줄다리기가 있어도 (통계학)", () => {
    const map = settle(STATISTICS);
    for (const [a, da] of STATS_LAYERS) {
      for (const [b, db] of STATS_LAYERS) {
        if (da >= db) continue;
        expect(y(map, a), `depth ${da} 인 ${a} 가 depth ${db} 인 ${b} 보다 위여야 한다`).toBeLessThan(y(map, b));
      }
    }
  });

  it("계층 정보가 없는 노드는 계층 밴드 아래 미순위 영역에 놓인다 (생리학)", () => {
    const map = settle(PHYSIOLOGY);
    const lowestLayer = y(map, "cell"); // depth 3 = 최하위 계층
    for (const id of PHYS_FLOATING) {
      expect(y(map, id), `${id} 는 계층 밴드(cell) 아래여야 한다`).toBeGreaterThan(lowestLayer);
    }
  });

  it("고립 노드는 미순위 노드보다도 아래에 놓인다 (생리학)", () => {
    const map = settle(PHYSIOLOGY);
    const floatingMax = Math.max(...PHYS_FLOATING.map((id) => y(map, id)));
    expect(y(map, "osmosis")).toBeGreaterThan(floatingMax);
  });

  it("계층 노드에 링크로 매달린 부동 노드도 최상위 개념 위로는 못 올라간다 (통계학)", () => {
    // 수정 전에는 세로 힘이 0 이라 부동 노드가 y=-324 까지 떠올라 계층 밴드를 관통했다.
    // 링크(0.4)가 밴드(0.08)를 이기므로 이웃 곁에 머무는 것은 그대로 두되(graph-view.md §2),
    // 최상위 계층보다 위로 가는 일은 없어야 한다.
    const map = settle(STATISTICS);
    const topLayer = Math.min(...STATS_LAYERS.filter(([, d]) => d === 0).map(([id]) => y(map, id)));
    for (const id of STATS_FLOATING) {
      expect(y(map, id), `${id} 가 최상위 계층보다 위에 있다`).toBeGreaterThan(topLayer);
    }
  });

  it("계층과 링크로 이어지지 않은 부동 노드는 미순위 영역으로 내려간다 (통계학)", () => {
    // type-i ↔ type-ii 는 confused_with 로만 이어진 단절된 대칭 쌍이다.
    const map = settle(STATISTICS);
    const lowestLayer = Math.max(...STATS_LAYERS.filter(([, d]) => d === 2).map(([id]) => y(map, id)));
    for (const id of ["type-i", "type-ii"]) {
      expect(y(map, id), `${id} 는 계층 밴드 아래여야 한다`).toBeGreaterThan(lowestLayer);
    }
    // 대칭 쌍은 서로 대등하므로 사실상 같은 행에 선다 (한쪽을 더 기초라고 말하지 않는다)
    expect(Math.abs(y(map, "type-i") - y(map, "type-ii"))).toBeLessThan(40);
  });

  it("고립 노드는 미순위 노드보다도 아래에 놓인다 (통계학)", () => {
    const map = settle(STATISTICS);
    expect(y(map, "clt")).toBeGreaterThan(Math.max(y(map, "type-i"), y(map, "type-ii")));
  });

  it("엣지 순서를 뒤집어도 계층 배치가 흔들리지 않는다", () => {
    // forceLink 는 링크를 배열 순서대로 완화하므로 부동소수 수준의 차이는 남는다.
    // 보장해야 할 것은 계층 노드가 사실상 같은 층에 놓인다는 것(1px 이내).
    const a = settle(PHYSIOLOGY);
    const b = settle({ ...PHYSIOLOGY, edges: [...PHYSIOLOGY.edges].reverse() });
    for (const id of PHYS_CHAIN) expect(Math.abs(y(b, id) - y(a, id)), `${id} 의 y 가 엣지 순서에 흔들린다`).toBeLessThan(1);
  });
});

describe("createLayoutSim — force 모드", () => {
  it("계층 힘 대신 forceCenter 를 써서 화면 중앙에 모인다", () => {
    const map = settle({ ...PHYSIOLOGY, layout: "force" });
    const ids = [...PHYS_CHAIN, ...PHYS_FLOATING];
    const meanY = ids.reduce((s, id) => s + y(map, id), 0) / ids.length;
    expect(Math.abs(meanY - H / 2), "force 모드는 세로 중심이 화면 중앙이어야 한다").toBeLessThan(H * 0.15);
  });
});
