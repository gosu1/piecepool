// 그래프 배치 물리의 SSOT — cytoscape 와 무관한 순수 모듈이라 결정적으로 테스트할 수 있다.
// 소비처: CytoscapeGraph(tick 마다 좌표를 cy 로 흘려보냄). 설계 근거: docs/40-frontend/graph-view.md.
//
// 옵시디언식 물리: d3-force 시뮬이 노드 위치를 구동한다. alpha 냉각으로 스스로 식어 정지 → idle CPU ≈ 0.
// 노드를 잡으면 alphaTarget 로 재가열되어 이웃이 스프링처럼 재배치되고, 놓으면 다시 식어 멈춘다.
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceRadial, forceX, forceY } from "d3-force";
import type { Simulation, SimulationNodeDatum } from "d3-force";
import { computeDepth } from "./relationMeta";

export interface SimNode extends SimulationNodeDatum {
  id: string;
  space?: string; // 병합(전체) 뷰에서 space별 군집 배치용
}

export interface SimLink {
  source: string;
  target: string;
}

export interface LayoutInput {
  nodes: { id: string; space?: string }[];
  edges: { source: string; target: string; rel: string }[];
  width: number;
  height: number;
  layout: "force" | "hier";
}

export interface LayoutSim {
  sim: Simulation<SimNode, SimLink>;
  nodes: SimNode[];
  map: Map<string, SimNode>;
}

// 노드 x/y 를 비워 두면 d3 가 나선형(phyllotaxis)으로 초기 배치한다 — 난수가 아니라 결정적이다.
// random 을 주입하면 forceLink·forceManyBody 의 jiggle(동일 좌표 흔들기)까지 결정적이 되어
// 시뮬 전체가 재현 가능해진다(테스트용).
export function createLayoutSim(input: LayoutInput, random?: () => number): LayoutSim {
  const { width: w, height: h, layout } = input;
  const nodes: SimNode[] = input.nodes.map((n) => ({ id: n.id, space: n.space }));
  const links: SimLink[] = input.edges.map((e) => ({ source: e.source, target: e.target }));
  const map = new Map(nodes.map((n) => [n.id, n]));

  // 차수 집계 → radial 힘: 연결 많은 허브는 중심(반지름 0), 적은 노드는 외곽(큰 반지름)으로 당긴다.
  const deg = new Map<string, number>();
  for (const l of links) {
    deg.set(l.source, (deg.get(l.source) ?? 0) + 1);
    deg.set(l.target, (deg.get(l.target) ?? 0) + 1);
  }
  const maxDeg = Math.max(1, ...deg.values());
  const R = Math.min(w, h) * 0.42; // 최외곽 반지름

  const sim = forceSimulation<SimNode, SimLink>(nodes)
    .force("link", forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(70).strength(0.4))
    .force("collide", forceCollide<SimNode>(14));

  // 전체(병합) 뷰: space 가 2개 이상이면 cross-space 엣지가 없어 섬들이 흩어진다.
  const spacesPresent = Array.from(new Set(nodes.map((n) => n.space).filter(Boolean))) as string[];

  // 계층 깊이 — 단일 뷰 + 계층 모드에서만. 계층 엣지(part_of·prerequisite) 없으면 비어서 force 폴백.
  const depth = layout === "hier" && spacesPresent.length <= 1 ? computeDepth(input.edges) : new Map<string, number>();

  if (spacesPresent.length > 1) {
    const cols = Math.ceil(Math.sqrt(spacesPresent.length));
    const rows = Math.ceil(spacesPresent.length / cols);
    const cellR = 0.4 * Math.min(w / cols, h / rows); // 클러스터 최외곽 반지름 (셀 안에 수렴)
    const anchor = new Map<string, { x: number; y: number }>();
    spacesPresent.forEach((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      anchor.set(s, { x: ((col + 0.5) / cols) * w, y: ((row + 0.5) / rows) * h });
    });
    // 커스텀 radial: 각 노드를 자기 space 앵커 중심으로, 차수 낮을수록 바깥으로 민다.
    // (d3 forceRadial 은 중심이 단일 고정점이라 space별 중심을 못 써서 직접 구현)
    const clusterRadial = (alpha: number) => {
      for (const n of nodes) {
        const a = n.space ? anchor.get(n.space) : undefined;
        if (!a || n.x == null || n.y == null) continue;
        const dx = n.x - a.x;
        const dy = n.y - a.y;
        const r = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const target = cellR * (1 - (deg.get(n.id) ?? 0) / maxDeg);
        const k = ((target - r) / r) * 0.18 * alpha;
        n.vx = (n.vx ?? 0) + dx * k;
        n.vy = (n.vy ?? 0) + dy * k;
      }
    };
    sim.force("charge", forceManyBody<SimNode>().strength(-120).distanceMax(220)).force("cluster", clusterRadial);
  } else if (depth.size > 0) {
    // ── 계층 모드 ──
    // 세로축 = 논리 계층. 위에서부터 depth 0..maxDepth, 그 아래 "미순위"(계층 정보 없는 노드),
    // 맨 아래 "고립"(엣지 없는 노드). 화면 높이를 전체 행 수로 나눠 층 간격을 정한다.
    //
    // 계층 정보가 없는 노드에 depth 를 **지어내지 않는다.** 대칭 관계(contrasts·confused_with)로
    // 이어진 두 개념은 대등하고, causes 는 극성이 반대다 — relation-types.md §7.1. 대신 계층 밴드
    // 아래 "미순위" 영역으로 약하게 당겨, 세로 위치가 의미를 갖는 노드와 갖지 않는 노드를 분리한다.
    // 예전에는 이들의 세로 힘이 0 이라 계층 밴드를 관통해 흩어졌고, 그래서 "위=기초"가 무너져 보였다.
    //
    // forceCenter 는 무게중심을 평행이동시켜 절대 y 목표와 싸우므로 약한 forceX 로 수평만 잡는다.
    const maxDepth = Math.max(...depth.values());
    const unrankedRow = maxDepth + 1;
    const isolatedRow = maxDepth + 2;
    const layerGap = Math.min(140, Math.max(70, (h * 0.8) / isolatedRow));
    const topY = h * 0.1;
    const rowY = (row: number) => topY + row * layerGap;
    sim
      .force("charge", forceManyBody<SimNode>().strength(-160).distanceMax(500))
      .force("x", forceX<SimNode>(w / 2).strength(0.04))
      .force(
        "layerY",
        forceY<SimNode>((d) => {
          const own = depth.get(d.id);
          if (own !== undefined) return rowY(own);
          return rowY((deg.get(d.id) ?? 0) === 0 ? isolatedRow : unrankedRow);
        }).strength((d) => (depth.has(d.id) ? 0.5 : (deg.get(d.id) ?? 0) === 0 ? 0.12 : 0.08)),
      );
  } else {
    sim
      .force("charge", forceManyBody<SimNode>().strength(-160).distanceMax(500))
      .force("center", forceCenter(w / 2, h / 2))
      .force("radial", forceRadial<SimNode>((d) => R * (1 - (deg.get(d.id) ?? 0) / maxDeg), w / 2, h / 2).strength(0.12));
  }

  // 힘을 모두 등록한 뒤에 주입해야 각 힘이 이 난수원으로 재초기화된다.
  if (random) sim.randomSource(random);

  return { sim, nodes, map };
}
