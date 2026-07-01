// Promotion — 자른 조각(노드 후보) 중 무엇을 그래프 노드로 올릴지 (연결성 게이트 + 상태 머신).
// SSOT 설계: docs/30-llm/README.md §E "연결성" + "Node 상태 머신".
// segmentation(chunk.ts)의 짝. "일반 RAG 파이프라인은 segmentation만 하고 끝낸다.
//  Piecepool은 knowledge graph가 목표이므로 promotion이 핵심 차별점이다"(§0).
//
// 규칙(§E 결정 표):
//  - degree ≥ 1  → ACTIVE (staging/archived 어디서든 연결되면 승격·재연결)
//  - 고립(degree 0), 신규/staging → STAGING 보류 (즉시 폐기 ❌)
//  - STAGING에서 TTL 라운드 초과하도록 끝내 고립 → ARCHIVED (완전 삭제 ❌, 재연결 시 복구)
//  - ACTIVE → 유지 (과연결돼도 격하/분할 안 함. 과연결 detection 로직 자체를 두지 않음)
// self-loop(review_needed 등)는 연결로 세지 않는다 — 실질 연결성이 아님.

export type NodeState = "staging" | "active" | "archived";

export interface CandidateNode {
  id: string;
  state?: NodeState; // 이전 상태. 신규 조각이면 undefined → staging 진입.
  stagingSinceRound?: number; // staging 진입 라운드 (TTL 계산 기준).
}

export interface PromoteEdge {
  source: string;
  target: string;
}

export interface PromoteOptions {
  round: number; // 현재 import 라운드 (단조 증가). 새 문서 유입마다 +1.
  ttlRounds?: number; // staging 최대 유지 라운드 (기본 3). 실데이터로 튜닝(open item).
}

export interface PromotedNode {
  id: string;
  state: NodeState;
  degree: number;
  stagingSinceRound?: number;
}

export interface Transition {
  id: string;
  from: NodeState | "new";
  to: NodeState;
  reason: string;
}

export interface PromoteResult {
  nodes: PromotedNode[];
  transitions: Transition[];
  stats: Record<NodeState, number>;
}

export function promote(
  nodes: CandidateNode[],
  edges: PromoteEdge[],
  opts: PromoteOptions,
): PromoteResult {
  const ttl = Math.max(1, opts.ttlRounds ?? 3);
  const degree = degreeMap(nodes, edges);

  const out: PromotedNode[] = [];
  const transitions: Transition[] = [];
  const stats: Record<NodeState, number> = { staging: 0, active: 0, archived: 0 };

  for (const node of nodes) {
    const prior: NodeState | "new" = node.state ?? "new";
    const deg = degree.get(node.id) ?? 0;
    const next = step(node, prior, deg, opts.round, ttl);

    if (next.state !== node.state) {
      transitions.push({ id: node.id, from: prior, to: next.state, reason: next.reason });
    }
    stats[next.state]++;
    out.push({ id: node.id, state: next.state, degree: deg, stagingSinceRound: next.stagingSinceRound });
  }

  return { nodes: out, transitions, stats };
}

// 한 노드의 상태 전이 결정.
function step(
  node: CandidateNode,
  prior: NodeState | "new",
  deg: number,
  round: number,
  ttl: number,
): { state: NodeState; reason: string; stagingSinceRound?: number } {
  if (deg >= 1) {
    // 연결되면 어디서든 active. archived였다면 재연결 복구.
    const reason =
      prior === "active"
        ? "active 유지 (연결 유지)"
        : prior === "archived"
          ? `재연결(degree ${deg}) → active`
          : `연결(degree ${deg}) → active`;
    return { state: "active", reason };
  }

  // degree 0 (고립)
  if (prior === "active") {
    // 승격은 단조 — 이미 active면 격하하지 않는다(§E: active는 유지).
    return { state: "active", reason: "active 유지 (현 라운드 고립이나 격하 안 함)", stagingSinceRound: node.stagingSinceRound };
  }
  if (prior === "archived") {
    return { state: "archived", reason: "archived 유지 (재연결 없음)", stagingSinceRound: node.stagingSinceRound };
  }

  // 신규 또는 staging + 고립
  const since = prior === "new" ? round : node.stagingSinceRound ?? round;
  if (round - since >= ttl) {
    return { state: "archived", reason: `TTL 초과(${round - since} ≥ ${ttl} 라운드 고립) → archived`, stagingSinceRound: since };
  }
  const reason = prior === "new" ? "신규 고립 → staging 보류" : `staging 보류(${round - since}/${ttl} 라운드)`;
  return { state: "staging", reason, stagingSinceRound: since };
}

// id → degree(자기 자신 제외 incident 엣지 수).
function degreeMap(nodes: CandidateNode[], edges: PromoteEdge[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const deg = new Map<string, number>();
  for (const e of edges) {
    if (e.source === e.target) continue; // self-loop 제외
    if (ids.has(e.source)) deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    if (ids.has(e.target)) deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  return deg;
}
