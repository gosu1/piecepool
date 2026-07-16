import type { MiniGroup } from "./MiniGraph";
import type { GraphData } from "./types";

// ── 개념 중심 관계 그룹 — 한 개념에 걸린 관계를 타입별로 묶어 MiniRelationGraph 가 먹을 형태로 ──
// PiecePoolApp.conceptSections(위키 페이지)와 같은 규칙: confused_with 는 제외(별도 섹션이 담당).
// 소비처: InboxSection 위키 참조 패널의 미니 로컬 그래프(근거 자리 대체).
export function conceptRelationGroups(
  graph: GraphData | undefined,
  conceptId: string,
  onOpen: (path: string) => void,
): MiniGroup[] {
  if (!graph) return [];
  const byType = new Map<string, MiniGroup["items"]>();
  for (const r of graph.relations) {
    const out = r.sourceNodeId === conceptId;
    if (!out && r.targetNodeId !== conceptId) continue;
    const otherId = out ? r.targetNodeId : r.sourceNodeId;
    const node = graph.nodes.find((n) => n.id === otherId);
    if (!node) continue;
    const items = byType.get(r.relationType) ?? [];
    items.push({ label: node.title, dir: out ? "out" : "in", onClick: () => onOpen(node.path) });
    byType.set(r.relationType, items);
  }
  return Array.from(byType, ([type, items]) => ({ type, items })).filter((x) => x.type !== "confused_with");
}
