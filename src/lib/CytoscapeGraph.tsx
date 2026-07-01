import { useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core, ElementDefinition } from "cytoscape";
import type { GraphData } from "./types";

type CyStyle = { selector: string; style: Record<string, string | number> };
import { layoutGraph } from "./graphLayout";

// 인터랙티브 타입드 그래프 (Cytoscape.js). 타입별 엣지색 · 강도별 두께 · 약한 관계 점선 · 노드/엣지 클릭.
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
  height?: number;
  onNode?: (conceptId: string) => void;
  onEdge?: (relationId: string) => void;
  subjectFilter?: string[]; // 비면 전체
  typeFilter?: string[]; // 비면 전체
}

export function CytoscapeGraph({ data, height = 460, onNode, onEdge, subjectFilter, typeFilter }: CytoscapeGraphProps) {
  const cyRef = useRef<Core | null>(null);
  const laid = layoutGraph(data);
  const posById = new Map(laid.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

  const nodes = data.nodes.filter((n) => !subjectFilter?.length || n.subjectIds.some((s) => subjectFilter.includes(s)));
  const nodeIds = new Set(nodes.map((n) => n.id));

  const nodeEls: ElementDefinition[] = nodes.map((n) => {
    const p = posById.get(n.id) ?? { x: 0.5, y: 0.5 };
    return {
      data: { id: n.id, label: n.title, color: n.kind === "result" ? "#b8b5ad" : "#4d8df0" },
      position: { x: p.x * 900 + 60, y: p.y * (height - 80) + 40 },
    };
  });
  const edgeEls: ElementDefinition[] = data.relations
    .filter((r) => nodeIds.has(r.sourceNodeId) && nodeIds.has(r.targetNodeId))
    .filter((r) => !typeFilter?.length || typeFilter.includes(r.relationType))
    .map((r) => ({
      data: {
        id: r.id,
        source: r.sourceNodeId,
        target: r.targetNodeId,
        color: EDGE_COLOR[r.relationType] ?? "#a39e98",
        w: 1 + r.strength * 4,
        dash: r.relationType === "related_to" || r.strength < 0.6 ? "dashed" : "solid",
      },
    }));

  const stylesheet: CyStyle[] = [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        label: "data(label)",
        "font-size": 11,
        color: "#615d59",
        "text-valign": "bottom",
        "text-margin-y": 4,
        width: 14,
        height: 14,
      },
    },
    {
      selector: "edge",
      style: {
        "line-color": "data(color)",
        width: "data(w)",
        "curve-style": "straight",
        "line-style": "data(dash)",
        opacity: 0.75,
      },
    },
    { selector: "node:selected", style: { "border-width": 3, "border-color": "#0075de" } },
    { selector: "edge:selected", style: { opacity: 1, width: 4 } },
  ];

  const bind = (cy: Core) => {
    if (cyRef.current === cy) return;
    cyRef.current = cy;
    cy.removeListener("tap");
    cy.on("tap", "node", (e) => onNode?.(e.target.id()));
    cy.on("tap", "edge", (e) => onEdge?.(e.target.id()));
  };

  return (
    <CytoscapeComponent
      elements={[...nodeEls, ...edgeEls]}
      stylesheet={stylesheet}
      layout={{ name: "preset" }}
      cy={bind}
      style={{ width: "100%", height }}
      minZoom={0.3}
      maxZoom={2.5}
      wheelSensitivity={0.2}
    />
  );
}
