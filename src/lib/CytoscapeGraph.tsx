import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import type { Core, ElementDefinition } from "cytoscape";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceRadial } from "d3-force";
import type { Simulation, SimulationNodeDatum } from "d3-force";
import type { GraphData } from "./types";
import { useTheme } from "../ds";

// 옵시디언식 물리: d3-force 시뮬레이션이 cytoscape 노드 위치를 구동한다.
// alpha 냉각으로 스스로 식어 정지 → idle CPU ≈ 0. 노드를 잡으면 alphaTarget 로 재가열되어
// 이웃이 스프링처럼 유기적으로 재배치되고, 놓으면 다시 식어 멈춘다.
interface SimNode extends SimulationNodeDatum {
  id: string;
  space?: string; // 병합(전체) 뷰에서 space별 군집 배치용
}
interface SimLink {
  source: string;
  target: string;
}

// cy 요소로부터 시뮬레이션을 구성한다. 노드 x/y 를 비워 두면 d3 가 나선형으로 초기 배치(겹침 방지),
// 매 tick 에 좌표를 cy 로 흘려보낸다. (링크 거리·반발·중심·충돌 힘 = 옵시디언 그래프 힘 구성)
function buildSim(cy: Core): { sim: Simulation<SimNode, SimLink>; map: Map<string, SimNode> } {
  const w = cy.width() || 800;
  const h = cy.height() || 600;
  const nodes: SimNode[] = cy.nodes().map((n) => ({ id: n.id(), space: n.data("space") as string | undefined }));
  const links: SimLink[] = cy.edges().map((e) => ({ source: e.source().id(), target: e.target().id() }));
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
  // space별 그리드 앵커를 중심으로 한 radial 로 군집 + degree 배치(허브=앵커중심, 리프=바깥링)를
  // 클러스터마다 재현한다. 단일 뷰의 "연결 적은 노드 바깥" 느낌을 각 공간에서 유지.
  const spacesPresent = Array.from(new Set(nodes.map((n) => n.space).filter(Boolean))) as string[];
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
    sim
      .force("charge", forceManyBody<SimNode>().strength(-120).distanceMax(220))
      .force("cluster", clusterRadial);
  } else {
    sim
      .force("charge", forceManyBody<SimNode>().strength(-160).distanceMax(500))
      .force("center", forceCenter(w / 2, h / 2))
      .force("radial", forceRadial<SimNode>((d) => R * (1 - (deg.get(d.id) ?? 0) / maxDeg), w / 2, h / 2).strength(0.12));
  }

  sim.on("tick", () => {
    cy.batch(() => {
      for (const nd of nodes) {
        if (nd.x != null && nd.y != null) cy.getElementById(nd.id).position({ x: nd.x, y: nd.y });
      }
    });
  });
  return { sim, map };
}

// 인터랙티브 타입드 그래프 (Cytoscape.js 직접 제어).
// 방향 화살표 · 타입별 엣지색 · 강도별 두께 · 약한 관계 점선 · 차수 비례 노드 크기 ·
// hover 이웃 하이라이트 · 컨테이너 반응형 · 다크모드(DS 토큰) · 줌/맞춤/재배치 컨트롤.
// 규약: docs/10-contracts/relation-types.md (12 enum). 색은 sticker 팔레트 기반 구분값.
export const EDGE_COLOR: Record<string, string> = {
  extracted_from: "#8a8780",
  explained_by: "#0075de",
  prerequisite: "#dd5b00",
  part_of: "#2a9d99",
  used_in: "#1aae39",
  causes: "#e64980",
  solves: "#7048e8",
  contrasts: "#f08c00",
  confused_with: "#e8590c",
  related_to: "#a39e98",
  tested_in: "#1c7ed6",
  review_needed: "#e03131",
};

export interface CytoscapeGraphProps {
  data: GraphData;
  onNode?: (conceptId: string) => void;
  onEdge?: (relationId: string) => void;
  /** 배경 클릭 → 선택 해제 */
  onClear?: () => void;
  subjectFilter?: string[]; // 비면 전체
  typeFilter?: string[]; // 비면 전체
  /** 선택된 노드 id — 필터 변경으로 요소를 다시 그려도 선택 링을 유지한다. */
  selectedId?: string | null;
  /** 지정 시 해당 노드로 애니메이션 포커스. n(논스)으로 같은 노드 재검색도 다시 발화. */
  focus?: { id: string; n: number } | null;
  /** 지정 시(전체 과목 뷰) 노드를 소속 space 색으로 칠한다. slug → 색. 미지정이면 kind 색(기본). */
  spaceColors?: Record<string, string>;
  className?: string;
}

// DS 토큰 → cytoscape 색. 다크모드 전환 시 재조회.
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    label: v("--ds-ink-2", "#615d59"),
    labelBg: v("--ds-canvas", "#ffffff"),
    core: v("--ds-primary", "#0075de"),
    result: v("--ds-ink-faint", "#b8b5ad"),
    selection: v("--ds-primary", "#0075de"),
  };
}

export function CytoscapeGraph({ data, onNode, onEdge, onClear, subjectFilter, typeFilter, selectedId, focus, spaceColors, className }: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const mapRef = useRef<Map<string, SimNode>>(new Map());
  const { theme } = useTheme();

  // 시뮬레이션 (재)구성 → 첫 정착 시 1회 화면 맞춤. 데이터 변경·재배치 버튼이 호출한다.
  const rebuild = () => {
    const cy = cyRef.current;
    if (!cy) return;
    simRef.current?.stop();
    const { sim, map } = buildSim(cy);
    simRef.current = sim;
    mapRef.current = map;
    let fitted = false;
    sim.on("end", () => {
      if (fitted) return;
      fitted = true;
      cy.animate({ fit: { eles: cy.elements(), padding: 40 }, duration: 250 });
    });
  };

  // 콜백은 ref 로 우회 — cy 이벤트 바인딩을 재생성하지 않기 위해.
  const cbRef = useRef({ onNode, onEdge, onClear });
  cbRef.current = { onNode, onEdge, onClear };
  // 요소 교체 effect 가 재실행되지 않도록 선택 id 도 ref 로.
  const selRef = useRef<string | null | undefined>(selectedId);
  selRef.current = selectedId;

  // ── 필터 적용된 요소 계산 ──
  const elements = useMemo<ElementDefinition[]>(() => {
    const nodes = data.nodes.filter((n) => !subjectFilter?.length || n.subjectIds.some((s) => subjectFilter.includes(s)));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const rels = data.relations
      .filter((r) => nodeIds.has(r.sourceNodeId) && nodeIds.has(r.targetNodeId))
      .filter((r) => !typeFilter?.length || typeFilter.includes(r.relationType));

    // 차수 비례 노드 크기 (6px ~ 18px)
    const deg: Record<string, number> = {};
    for (const r of rels) {
      deg[r.sourceNodeId] = (deg[r.sourceNodeId] ?? 0) + 1;
      deg[r.targetNodeId] = (deg[r.targetNodeId] ?? 0) + 1;
    }

    const nodeEls: ElementDefinition[] = nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.title,
        kind: n.kind,
        size: 6 + Math.min(deg[n.id] ?? 0, 8) * 1.5,
        space: n.space, // 병합 뷰 space별 군집(buildSim)용
        // sbg 있으면 스타일이 space 색으로 덮어씀(전체 뷰). 없으면 kind 색 유지.
        ...(spaceColors && n.space ? { sbg: spaceColors[n.space] ?? "#a39e98" } : {}),
      },
    }));
    const edgeEls: ElementDefinition[] = rels.map((r) => ({
      data: {
        id: r.id,
        source: r.sourceNodeId,
        target: r.targetNodeId,
        color: EDGE_COLOR[r.relationType] ?? "#a39e98",
        w: 1 + r.strength * 3,
        dash: r.relationType === "related_to" || r.strength < 0.6 ? "dashed" : "solid",
      },
    }));
    return [...nodeEls, ...edgeEls];
  }, [data, subjectFilter, typeFilter, spaceColors]);

  // ── cy 생성(1회) + 이벤트 바인딩 ──
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      minZoom: 0.25,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    cy.on("tap", "node", (e) => cbRef.current.onNode?.(e.target.id()));
    cy.on("tap", "edge", (e) => cbRef.current.onEdge?.(e.target.id()));
    cy.on("tap", (e) => {
      if (e.target === cy) cbRef.current.onClear?.();
    });
    // 드래그: 잡으면 재가열(alphaTarget↑) + 노드 고정, 끌면 커서 추종, 놓으면 해제 후 냉각(alphaTarget 0).
    cy.on("grab", "node", (e) => {
      const nd = mapRef.current.get(e.target.id());
      if (!nd) return;
      simRef.current?.alphaTarget(0.3).restart();
      nd.fx = nd.x ?? null;
      nd.fy = nd.y ?? null;
    });
    cy.on("drag", "node", (e) => {
      const nd = mapRef.current.get(e.target.id());
      if (!nd) return;
      const p = e.target.position();
      nd.fx = p.x;
      nd.fy = p.y;
    });
    cy.on("free", "node", (e) => {
      const nd = mapRef.current.get(e.target.id());
      if (nd) {
        nd.fx = null;
        nd.fy = null;
      }
      simRef.current?.alphaTarget(0);
    });
    // hover → 이웃만 남기고 흐리게
    cy.on("mouseover", "node", (e) => {
      const hood = e.target.closedNeighborhood();
      cy.elements().not(hood).addClass("faded");
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("faded"));

    // 컨테이너 크기 추적 (분할 패널 리사이즈 대응)
    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      simRef.current?.stop();
      simRef.current = null;
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // ── 테마 토큰 → 스타일시트 (다크모드 전환 시 재적용) ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const t = readTokens();
    cy.style([
      {
        selector: "node",
        style: {
          "background-color": t.result,
          label: "data(label)",
          "font-size": 7,
          color: t.label,
          "text-valign": "bottom",
          "text-margin-y": 3,
          "text-background-color": t.labelBg,
          "text-background-opacity": 0.75,
          "text-background-padding": "2px",
          width: "data(size)",
          height: "data(size)",
          "transition-property": "opacity",
          "transition-duration": 120,
        },
      },
      { selector: 'node[kind = "core"]', style: { "background-color": t.core } },
      // 전체 과목 뷰: sbg(space 색)가 있으면 kind 색을 덮어쓴다.
      { selector: "node[sbg]", style: { "background-color": "data(sbg)" } },
      {
        selector: "edge",
        style: {
          "line-color": "data(color)",
          width: "data(w)",
          "curve-style": "bezier",
          "line-style": "data(dash)",
          "target-arrow-shape": "triangle",
          "target-arrow-color": "data(color)",
          "arrow-scale": 0.8,
          opacity: 0.75,
          "transition-property": "opacity",
          "transition-duration": 120,
        },
      },
      { selector: "node:selected", style: { "border-width": 3, "border-color": t.selection } },
      { selector: "edge:selected", style: { opacity: 1, width: 4 } },
      { selector: ".faded", style: { opacity: 0.12 } },
    ] as never);
  }, [theme]);

  // ── 데이터/필터 변경 → 요소 교체 + 재배치 (React 쪽 선택은 다시 그려도 유지) ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
      if (selRef.current) cy.getElementById(selRef.current).select();
    });
    rebuild();
  }, [elements]);

  // ── 노드 선택 동기화 (검색 등 외부에서 선택이 바뀔 때). 엣지 선택은 cy 네이티브에 맡긴다 ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedId) cy.getElementById(selectedId).select();
  }, [selectedId]);

  // ── 검색 포커스: 노드로 줌인. n(논스) 덕에 같은 노드 재검색도 재발화 ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !focus) return;
    const node = cy.getElementById(focus.id);
    if (node.empty()) return;
    cy.animate({ fit: { eles: node.closedNeighborhood(), padding: 80 }, duration: 300 });
  }, [focus]);

  const zoom = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      {/* 그래프 컨트롤 */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <GraphCtl label="확대" onClick={() => zoom(1.3)}>
          ＋
        </GraphCtl>
        <GraphCtl label="축소" onClick={() => zoom(1 / 1.3)}>
          −
        </GraphCtl>
        <GraphCtl label="화면 맞춤" onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 40 }, duration: 250 })}>
          ⤢
        </GraphCtl>
        <GraphCtl label="재배치" onClick={rebuild}>
          ↺
        </GraphCtl>
      </div>
    </div>
  );
}

function GraphCtl({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface text-[13px] text-ink-2 shadow-soft transition-colors hover:bg-surface-soft hover:text-ink"
    >
      {children}
    </button>
  );
}
