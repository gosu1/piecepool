import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import type { Core, ElementDefinition } from "cytoscape";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceRadial, forceX, forceY } from "d3-force";
import type { Simulation, SimulationNodeDatum } from "d3-force";
import type { GraphData } from "./types";
import { RELATION_LABEL, REVIEW_COLOR, computeDepth, groupOf } from "./relationMeta";
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
// layout="hier": part_of·prerequisite 로 유도한 깊이(computeDepth)를 forceY 목표로 — 위=기초/전체, 아래=심화/부분.
function buildSim(cy: Core, layout: "force" | "hier"): { sim: Simulation<SimNode, SimLink>; map: Map<string, SimNode> } {
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

  // 계층 깊이 — 단일 뷰 + 계층 모드에서만. 계층 엣지(part_of·prerequisite) 없으면 비어서 force 폴백.
  const depth =
    layout === "hier" && spacesPresent.length <= 1
      ? computeDepth(cy.edges().map((e) => ({ source: e.source().id(), target: e.target().id(), rel: e.data("rel") as string })))
      : new Map<string, number>();

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
  } else if (depth.size > 0) {
    // ── 계층 모드: 세로축 = 논리 계층. 계층 노드는 제 층으로 강하게, 고아(일반 엣지만)는
    // 링크 힘으로 이웃 곁 정착(0), 완전 고립만 하단 미분류 밴드로 약하게 당긴다.
    // forceCenter 는 무게중심을 평행이동시켜 절대 y 목표와 싸우므로 약한 forceX 로 수평만 잡는다.
    const maxDepth = Math.max(...depth.values());
    const layerGap = Math.min(110, Math.max(70, (h * 0.76) / Math.max(1, maxDepth)));
    const topY = h * 0.12;
    sim
      .force("charge", forceManyBody<SimNode>().strength(-160).distanceMax(500))
      .force("x", forceX<SimNode>(w / 2).strength(0.04))
      .force(
        "layerY",
        forceY<SimNode>((d) => (depth.has(d.id) ? topY + depth.get(d.id)! * layerGap : topY + (maxDepth + 1) * layerGap)).strength((d) =>
          depth.has(d.id) ? 0.5 : (deg.get(d.id) ?? 0) === 0 ? 0.12 : 0,
        ),
      );
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
// 모노크롬 엣지 언어(논리 그룹별 모양: 실선=뼈대·점선=느슨한 연결·빨강=복습만) · 강도별 두께 ·
// 확대/hover 시 한국어 관계 라벨(progressive disclosure) · 차수 비례 노드 크기 ·
// hover 이웃 하이라이트 · 컨테이너 반응형 · 다크모드(DS 토큰) · 줌/맞춤/재배치 컨트롤.
// 규약: docs/10-contracts/relation-types.md (12 enum) · 분류: src/lib/relationMeta.ts · 설계: docs/40-frontend/graph-view.md.

// 이 배율 이상 확대하면 모든 엣지에 한국어 라벨 노출 (읽을 거리에서만 설명 등장)
const LABEL_ZOOM = 1.1;

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
  /** 레이아웃: 자유 배치(force) ↔ 계층 보기(hier). 계층 관계 없으면 hier 도 force 로 폴백. */
  layout?: "force" | "hier";
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
    edge: v("--ds-ink-faint", "#b8b5ad"), // 모노크롬 엣지 — 의미는 색이 아니라 모양·라벨이 나른다
    selection: v("--ds-primary", "#0075de"),
  };
}

export function CytoscapeGraph({ data, onNode, onEdge, onClear, subjectFilter, typeFilter, selectedId, focus, spaceColors, layout = "force", className }: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const mapRef = useRef<Map<string, SimNode>>(new Map());
  const { theme } = useTheme();

  // 재배치 버튼·이벤트 콜백이 최신 레이아웃 모드를 참조하도록 ref 로.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // 시뮬레이션 (재)구성 → 첫 정착 시 1회 화면 맞춤. 데이터 변경·모드 전환·재배치 버튼이 호출한다.
  const rebuild = () => {
    const cy = cyRef.current;
    if (!cy) return;
    simRef.current?.stop();
    const { sim, map } = buildSim(cy, layoutRef.current);
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
        rel: r.relationType, // 계층 레이아웃(computeDepth) 식별용
        grp: groupOf(r.relationType).id, // 논리 그룹 → 모양 selector (점선·화살표·복습색)
        label: RELATION_LABEL[r.relationType] ?? r.relationType, // 확대/hover 시 노출되는 한국어 라벨
        w: 1 + r.strength * 3, // strength → 굵기 (점선/실선은 그룹 의미 전용)
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
    // hover → 이웃만 남기고 흐리게 + 이웃 관계의 한국어 라벨 노출
    cy.on("mouseover", "node", (e) => {
      const hood = e.target.closedNeighborhood();
      cy.elements().not(hood).addClass("faded");
      hood.edges().addClass("hl");
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("faded hl"));

    // 확대 시 전 엣지 라벨 노출 — 임계 교차 때만 클래스 토글(줌 틱마다 재계산 방지)
    let labelZoomed = false;
    cy.on("zoom", () => {
      const z = cy.zoom() >= LABEL_ZOOM;
      if (z === labelZoomed) return;
      labelZoomed = z;
      cy.edges().toggleClass("zoomed", z);
    });

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
          // 노드 드래그 시 뜨는 오버레이를 사각형 대신 원으로.
          "overlay-shape": "ellipse",
        },
      },
      { selector: 'node[kind = "core"]', style: { "background-color": t.core } },
      // 전체 과목 뷰: sbg(space 색)가 있으면 kind 색을 덮어쓴다.
      { selector: "node[sbg]", style: { "background-color": "data(sbg)" } },
      // 배경 잡고 팬할 때 뜨는 회색 원(core active-bg) 제거.
      { selector: "core", style: { "active-bg-opacity": 0 } },
      {
        selector: "edge",
        style: {
          // 모노크롬: 의미는 색이 아니라 모양(실선/점선·화살표 유무)과 한국어 라벨이 나른다.
          "line-color": t.edge,
          width: "data(w)",
          "curve-style": "bezier",
          "target-arrow-shape": "triangle",
          "target-arrow-color": t.edge,
          "arrow-scale": 0.8,
          opacity: 0.7,
          // 한국어 관계 라벨 — 평소 숨김(text-opacity 0), 확대(.zoomed)·이웃 hover(.hl)·선택 시 노출
          label: "data(label)",
          "font-size": 7,
          color: t.label,
          "text-rotation": "autorotate",
          "text-background-color": t.labelBg,
          "text-background-opacity": 0.75,
          "text-background-padding": "1px",
          "text-opacity": 0,
          "transition-property": "opacity",
          "transition-duration": 120,
        },
      },
      // 논리 그룹별 모양 (relationMeta 분류): 대칭(연관)은 방향이 없으니 화살표 제거, 출처는 배경으로,
      // 복습만 유일한 색. 실선=뼈대(구조·순서·인과·활용)는 base 그대로.
      { selector: 'edge[grp = "assoc"]', style: { "line-style": "dashed", "target-arrow-shape": "none" } },
      { selector: 'edge[grp = "prov"]', style: { "line-style": "dashed", opacity: 0.4 } },
      { selector: 'edge[grp = "review"]', style: { "line-style": "dashed", "target-arrow-shape": "none", "line-color": REVIEW_COLOR, opacity: 0.9 } },
      { selector: "edge.zoomed, edge.hl", style: { "text-opacity": 1 } },
      { selector: "node:selected", style: { "border-width": 3, "border-color": t.selection } },
      { selector: "edge:selected", style: { opacity: 1, width: 4, "text-opacity": 1 } },
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
      // 확대 상태에서 요소가 교체되면 새 엣지에도 라벨 노출 상태를 이어준다
      cy.edges().toggleClass("zoomed", cy.zoom() >= LABEL_ZOOM);
    });
    rebuild();
  }, [elements]);

  // ── 레이아웃 모드 전환 → 요소는 그대로 두고 시뮬만 재구성 (마운트 직후는 elements effect 가 담당) ──
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    rebuild();
  }, [layout]);

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
