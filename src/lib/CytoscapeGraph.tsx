import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import type { Core, ElementDefinition } from "cytoscape";
import type { Simulation } from "d3-force";
import type { GraphData } from "./types";
import { RELATION_LABEL, REVIEW_COLOR, groupOf } from "./relationMeta";
import { createLayoutSim } from "./graphLayout";
import type { SimLink, SimNode } from "./graphLayout";
import { useTheme } from "../ds";

// cy 요소 → 배치 물리(graphLayout.ts) 어댑터. 매 tick 에 좌표를 cy 로 흘려보낸다.
function buildSim(cy: Core, layout: "force" | "hier"): { sim: Simulation<SimNode, SimLink>; map: Map<string, SimNode> } {
  const { sim, nodes, map } = createLayoutSim({
    nodes: cy.nodes().map((n) => ({ id: n.id(), space: n.data("space") as string | undefined })),
    edges: cy.edges().map((e) => ({ source: e.source().id(), target: e.target().id(), rel: e.data("rel") as string })),
    width: cy.width() || 800,
    height: cy.height() || 600,
    layout,
  });

  sim.on("tick", () => {
    cy.batch(() => {
      for (const nd of nodes) {
        if (nd.x != null && nd.y != null) cy.getElementById(nd.id).position({ x: nd.x, y: nd.y });
      }
      // 아래(이름표 쪽)에서 진입해 하단 이름표에 묻히는 엣지만 .to-label 로 표시한다.
      // 조건: 화살표가 있는 그룹 + 세로 낙차가 가로 이동보다 커(≈±45° 수직 원뿔) 화살촉이 노드 하단에 닿는 경우.
      for (const e of cy.edges()) {
        const grp = e.data("grp") as string;
        const hasArrow = grp !== "assoc" && grp !== "review";
        const dy = e.source().position("y") - e.target().position("y");
        const dx = Math.abs(e.source().position("x") - e.target().position("x"));
        const below = hasArrow && dy > 0 && dy >= dx;
        if (below !== e.hasClass("to-label")) e.toggleClass("to-label", below);
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

// "이름표까지 노드로 취급": 이름표는 노드 하단(text-valign:bottom)에 붙으므로, 아래에서 올라오는
// 화살표만 이름표에 묻힌다. 그런 엣지는 화살촉을 이름표 높이만큼 내려(target-distance-from-node)
// 이름표 바로 아래에서 이름표를 가리키게 한다 — 위·옆 진입은 그대로 노드를 가리킨다.
// 값 = text-margin-y(3) + 라벨 박스 높이(≈font 7 + padding). 라벨 하단에 바짝(작은 간격만) 붙인다.
const LABEL_OFFSET = 12;

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

    // 사용자가 "아직 모르겠어요" 로 표시한 개념 (review_needed self-loop).
    // 엣지로 그리면 노드 위 작은 고리가 되어 읽히지 않는다 → 노드 테두리로 표현하고 엣지는 감춘다.
    // 채움(선택/중심)·크기(우선도)와 직교하는 채널이라 서로 덮어쓰지 않는다.
    const reviewed = new Set(
      data.relations
        .filter((r) => r.relationType === "review_needed" && r.sourceNodeId === r.targetNodeId)
        .map((r) => r.sourceNodeId),
    );

    const rels = data.relations
      .filter((r) => r.sourceNodeId !== r.targetNodeId) // self-loop 는 테두리로 표현
      .filter((r) => nodeIds.has(r.sourceNodeId) && nodeIds.has(r.targetNodeId))
      .filter((r) => !typeFilter?.length || typeFilter.includes(r.relationType));

    // 우선도 비례 노드 크기 (6px ~ 36px). priority: get_graph 파생값(prioritization.md §5).
    const nodeEls: ElementDefinition[] = nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.title,
        kind: n.kind,
        size: 6 + (n.priority ?? 0) * 30,
        space: n.space, // 병합 뷰 space별 군집(buildSim)용
        // 크고 빨간 테두리 = 중요한데 아직 설명 못 하는 개념 → 지금 먼저 공부할 것.
        ...(reviewed.has(n.id) ? { review: 1 } : {}),
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
      // 사용자가 "아직 모르겠어요" 로 표시한 개념 — 모노크롬의 유일한 예외(relationMeta.ts REVIEW_COLOR).
      // 채움(선택/중심)이 아니라 테두리를 쓴다. :selected 는 아래에서 색·굵기만 덮으므로 dashed 는 남는다.
      {
        selector: "node[review]",
        style: { "border-width": 2.5, "border-color": REVIEW_COLOR, "border-style": "dashed", "border-opacity": 0.95 },
      },
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
      // 이름표까지 노드로: 아래-진입 엣지는 화살촉을 이름표 아래로 내려 이름표를 가리키게 한다.
      { selector: "edge.to-label", style: { "target-distance-from-node": LABEL_OFFSET } },
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

// 그래프 위 떠 있는 소형 컨트롤 버튼 — MiniGraph 확대·GraphSection 도움말도 공유
export function GraphCtl({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface text-[13px] text-ink-2 shadow-soft transition-colors hover:bg-surface-soft hover:text-ink ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
