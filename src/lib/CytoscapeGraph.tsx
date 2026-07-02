import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import type { Core, ElementDefinition } from "cytoscape";
import type { GraphData } from "./types";
import { useTheme } from "../ds";

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

const LAYOUT = {
  name: "cose",
  animate: false,
  fit: true,
  padding: 40,
  nodeRepulsion: () => 8000,
  idealEdgeLength: () => 90,
  gravity: 0.25,
  numIter: 1000,
} as const;

export function CytoscapeGraph({ data, onNode, onEdge, onClear, subjectFilter, typeFilter, selectedId, focus, className }: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const { theme } = useTheme();

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

    // 차수 비례 노드 크기 (12px ~ 30px)
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
        size: 12 + Math.min(deg[n.id] ?? 0, 9) * 2,
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
  }, [data, subjectFilter, typeFilter]);

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
          "font-size": 11,
          color: t.label,
          "text-valign": "bottom",
          "text-margin-y": 5,
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
    cy.layout(LAYOUT as never).run();
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
        <GraphCtl label="재배치" onClick={() => cyRef.current?.layout(LAYOUT as never).run()}>
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
