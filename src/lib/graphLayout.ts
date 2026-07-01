import type { GraphData } from "./types";
import type { GraphNode as CGNode, GraphEdge as CGEdge } from "../ds";

// GraphData(백엔드) → ConceptGraph 입력(x,y 좌표 포함)으로 변환.
// 가장 연결이 많은 노드를 상단 중앙에 두고 나머지를 원형으로 배치(.fig 느낌의 방사형).

export interface LaidOutGraph {
  nodes: CGNode[];
  edges: CGEdge[];
  pathById: Record<string, string>;
}

export function layoutGraph(data: GraphData): LaidOutGraph {
  const ids = data.nodes.map((n) => n.id);
  const pathById: Record<string, string> = {};
  data.nodes.forEach((n) => (pathById[n.id] = n.path));

  // 차수 계산 → 루트 선택
  const deg: Record<string, number> = {};
  for (const r of data.relations) {
    deg[r.sourceNodeId] = (deg[r.sourceNodeId] ?? 0) + 1;
    deg[r.targetNodeId] = (deg[r.targetNodeId] ?? 0) + 1;
  }
  let root = ids[0];
  for (const id of ids) if ((deg[id] ?? 0) > (deg[root] ?? 0)) root = id;

  const n = data.nodes.length;
  const cx = 0.5,
    cy = 0.54,
    rx = 0.36,
    ry = 0.34;
  const others = ids.filter((id) => id !== root);

  const pos: Record<string, { x: number; y: number }> = {};
  if (n === 1) {
    pos[root] = { x: 0.5, y: 0.5 };
  } else {
    pos[root] = { x: 0.5, y: 0.16 };
    // 나머지는 하단 호(arc)에 균등 배치
    const start = Math.PI * 0.78;
    const end = Math.PI * 2.22;
    others.forEach((id, i) => {
      const t = others.length === 1 ? 0.5 : i / (others.length - 1);
      const a = start + (end - start) * t;
      pos[id] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    });
  }

  const nodes: CGNode[] = data.nodes.map((node) => ({
    id: node.id,
    label: node.title,
    x: pos[node.id]?.x ?? 0.5,
    y: pos[node.id]?.y ?? 0.5,
    kind: node.kind,
  }));

  const known = new Set(ids);
  const edges: CGEdge[] = data.relations
    .filter((r) => known.has(r.sourceNodeId) && known.has(r.targetNodeId))
    .map((r) => ({
      source: r.sourceNodeId,
      target: r.targetNodeId,
      weak: r.relationType === "related_to" || r.strength < 0.6,
    }));

  return { nodes, edges, pathById };
}
