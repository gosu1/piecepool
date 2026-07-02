import type { RelationType } from "./generated/RelationType";

// 관계 표시 논리의 SSOT — 12 RelationType 을 논리적 성질(이행성·대칭성)로 5그룹 분류하고,
// 한국어 라벨·문장 템플릿·계층 깊이 유도를 한곳에서 제공한다. 소비처: CytoscapeGraph(모양·라벨·레이아웃),
// MiniGraph(미니 로컬 그래프), GraphSection(그룹 칩·엣지 패널), DocView(관계 칩). 타입 자체의 정의는 docs/10-contracts/relation-types.md 불변.
// 시각 언어 설계 근거: docs/40-frontend/graph-view.md.

export type RelationGroupId = "hier" | "flow" | "assoc" | "prov" | "review";

// 모노크롬 그래프에서 유일하게 색을 갖는 그룹(복습) — 사용자 경고 마킹이라 예외
export const REVIEW_COLOR = "#e03131";

export interface RelationGroup {
  id: RelationGroupId;
  name: string; // 필터 칩·범례용 한국어명
  members: RelationType[];
  dash: "solid" | "dashed"; // 실선=뼈대(방향 있는 의미 관계) · 점선=느슨한 연결
  arrow: boolean; // 대칭 관계(assoc)·상태 마킹(review)은 화살표가 오독을 낳아 제거
}

export const RELATION_GROUPS: RelationGroup[] = [
  // 이행·반대칭 → 유일하게 계층축을 만든다. 둘 다 target 이 위(전체/기초).
  { id: "hier", name: "구조·순서", members: ["part_of", "prerequisite"], dash: "solid", arrow: true },
  // 방향은 있으나 개념 계층은 아님 (원인→결과, 해결, 활용처)
  { id: "flow", name: "인과·활용", members: ["causes", "solves", "used_in"], dash: "solid", arrow: true },
  // 대칭 — 방향 무의미
  { id: "assoc", name: "연관", members: ["related_to", "contrasts", "confused_with"], dash: "dashed", arrow: false },
  // 노드 타입 교차(→Source/WikiPage) — 개념 구조보다 시각적으로 뒤(배경)로
  { id: "prov", name: "출처·문서", members: ["extracted_from", "explained_by", "tested_in"], dash: "dashed", arrow: true },
  // 사용자 전용 상태 마킹 — 그래프에서 유일하게 색(빨강)을 갖는다
  { id: "review", name: "복습", members: ["review_needed"], dash: "dashed", arrow: false },
];

export function groupOf(type: RelationType): RelationGroup {
  return RELATION_GROUPS.find((g) => g.members.includes(type)) ?? RELATION_GROUPS[2]; // 미지 타입은 연관 취급
}

// 짧은 라벨 — 필터 칩·엣지 위 라벨·상세 패널 배지 공용
export const RELATION_LABEL: Record<RelationType, string> = {
  part_of: "부분",
  prerequisite: "선행",
  causes: "원인",
  solves: "해결",
  used_in: "활용",
  related_to: "연관",
  contrasts: "대비",
  confused_with: "혼동 주의",
  extracted_from: "출처",
  explained_by: "설명 문서",
  tested_in: "시험 출제",
  review_needed: "복습 필요",
};

// 엣지 클릭 시 상세 패널 헤드라인 — 방향이 문장에 녹아 있어 화살표 오독을 차단한다.
// prerequisite 만 target(선수 개념)이 문장 앞에 온다. 조사는 병기("을(를)") — 라이브러리 없이.
export function relationSentence(type: RelationType, src: string, tgt: string): string {
  switch (type) {
    case "part_of":
      return `${src}은(는) ${tgt}의 한 부분이에요`;
    case "prerequisite":
      return `${tgt}을(를) 먼저 알아야 ${src}을(를) 이해할 수 있어요`;
    case "causes":
      return `${src}이(가) ${tgt}을(를) 일으켜요`;
    case "solves":
      return `${src}(으)로 ${tgt}을(를) 해결할 수 있어요`;
    case "used_in":
      return `${src}은(는) ${tgt}에서 활용돼요`;
    case "related_to":
      return `${src}와(과) ${tgt}은(는) 서로 관련이 있어요`;
    case "contrasts":
      return `${src}와(과) ${tgt}은(는) 서로 대비되는 개념이에요`;
    case "confused_with":
      return `${src}와(과) ${tgt}은(는) 헷갈리기 쉬워요 — 차이를 확인해 두세요`;
    case "extracted_from":
      return `${src}은(는) ${tgt} 자료에서 나온 내용이에요`;
    case "explained_by":
      return `${src}은(는) ${tgt} 문서에 자세히 설명돼 있어요`;
    case "tested_in":
      return `${src}은(는) ${tgt}에 출제된 적이 있어요`;
    case "review_needed":
      return src === tgt
        ? `${src}은(는) 복습이 필요하다고 표시한 개념이에요`
        : `${src}와(과) ${tgt}을(를) 묶어 복습하도록 표시했어요`;
  }
}

// strength/confidence 자연어 — 구간은 relation-types.md §4.1/§4.2 그대로
export function strengthLabel(n: number): string {
  return n >= 0.8 ? "핵심 연결" : n >= 0.5 ? "뚜렷한 연결" : n >= 0.2 ? "약한 연결" : "매우 약한 연결";
}

export function confidenceLabel(n: number): string {
  return n >= 0.8 ? "근거 확실" : n >= 0.5 ? "맥락상 추론" : "약한 추측";
}

// ── 계층 깊이 (그래프 레이아웃용) ──────────────────────────────
// part_of·prerequisite 엣지만으로 longest-path layering. 두 타입 모두 target 이 위(전체/기초):
// depth(source) ≥ depth(target)+1, depth 0 = 최상위. O(V+E).
// LLM 생성 데이터라 사이클 가능 → DFS 방문중 노드로 가는 back-edge 는 그 간선만 무시하고 끊는다.
export const HIER_TYPES: ReadonlySet<string> = new Set(["part_of", "prerequisite"]);

export interface HierEdge {
  source: string;
  target: string;
  rel: string;
}

export function computeDepth(edges: HierEdge[]): Map<string, number> {
  const up = new Map<string, string[]>(); // 노드 → 자기보다 위(target) 목록
  for (const e of edges) {
    if (!HIER_TYPES.has(e.rel) || e.source === e.target) continue; // 비계층 타입·self-loop 무시
    if (!up.has(e.source)) up.set(e.source, []);
    if (!up.has(e.target)) up.set(e.target, []); // 순수 최상위 노드도 depth 를 받도록 등록
    up.get(e.source)!.push(e.target);
  }
  const depth = new Map<string, number>();
  const state = new Map<string, 1 | 2>(); // 1 방문중 / 2 완료
  const dfs = (u: string): number => {
    if (state.get(u) === 2) return depth.get(u)!;
    state.set(u, 1);
    let d = 0;
    for (const v of up.get(u) ?? []) {
      if (state.get(v) === 1) continue; // 사이클 → 이 간선만 끊는다
      d = Math.max(d, dfs(v) + 1);
    }
    state.set(u, 2);
    depth.set(u, d);
    return d;
  };
  for (const u of up.keys()) dfs(u);
  return depth; // 계층 엣지 없는 노드는 미포함(고아 — 레이아웃이 물리 힘으로 처리)
}
