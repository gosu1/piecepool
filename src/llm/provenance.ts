// [D] 출처·신뢰성(Source & Provenance) — 같은 사실을 여러 출처가 뒷받침하면 한 노드로 병합하고,
// 출처를 노드 속성으로 부착(1차/2차 구분 + 신뢰도 점수), "이 연결의 근거가 무엇인가"를 추적 가능하게.
// SSOT 설계: docs/30-llm/README.md §D "출처·신뢰성 — Liner 강점 활용".
// 순수 모듈. 파이프라인 연결 시 Source.type → tier 추론(tierFromSourceType)으로 기존 데이터 재사용.

export type SourceTier = "primary" | "secondary"; // 1차(원본/교수자료) · 2차(요약/필기)

export interface SourceMeta {
  sourceId: string;
  tier: SourceTier;
  trust?: number; // 0..1 개별 신뢰도 override. 없으면 tier 기본값.
}

// tier 기본 신뢰도. 교수 PDF/원본=1차 높음, 사용자 필기/요약=2차 보통.
const DEFAULT_TRUST: Record<SourceTier, number> = { primary: 0.9, secondary: 0.5 };

export interface ProvenanceSource {
  sourceId: string;
  tier: SourceTier;
  trust: number;
}

export interface Provenance {
  sources: ProvenanceSource[]; // dedup된 backing 출처(1차 우선, trust 내림차순)
  primaryCount: number;
  secondaryCount: number;
  score: number; // 집계 신뢰도 0..1 (noisy-OR: 독립 출처가 corroborate할수록 1에 수렴)
}

// backing sourceIds(중복 가능) + 레지스트리 → 병합 provenance.
// 미등록 sourceId는 2차(기본 신뢰)로 간주. score는 noisy-OR = 1 − ∏(1 − trust_i).
export function buildProvenance(sourceIds: string[], registry: Map<string, SourceMeta>): Provenance {
  const seen = new Set<string>();
  const sources: ProvenanceSource[] = [];
  for (const id of sourceIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const meta = registry.get(id);
    const tier: SourceTier = meta?.tier ?? "secondary";
    const trust = clamp01(meta?.trust ?? DEFAULT_TRUST[tier]);
    sources.push({ sourceId: id, tier, trust });
  }
  sources.sort((a, b) => (a.tier === b.tier ? b.trust - a.trust : a.tier === "primary" ? -1 : 1));

  return {
    sources,
    primaryCount: sources.filter((s) => s.tier === "primary").length,
    secondaryCount: sources.filter((s) => s.tier === "secondary").length,
    score: noisyOr(sources.map((s) => s.trust)),
  };
}

export interface ConceptSourcing {
  title: string;
  normalizedTitle: string; // 병합 키(caller가 정규화). llmApply.normalizeTitle과 동일 규약.
  sourceIds: string[];
}

export interface MergedConcept {
  title: string;
  normalizedTitle: string;
  sourceIds: string[]; // union
  provenance: Provenance;
}

// 여러 출처에서 나온 같은 개념(normalizedTitle 일치)을 한 노드로 병합 → 출처 union + provenance.
// §D "같은 사실을 여러 출처가 뒷받침하면 한 노드로 병합". 등장 순서 보존(첫 title 유지).
export function mergeBySources(concepts: ConceptSourcing[], registry: Map<string, SourceMeta>): MergedConcept[] {
  const byNorm = new Map<string, { title: string; sourceIds: string[] }>();
  for (const c of concepts) {
    const cur = byNorm.get(c.normalizedTitle);
    if (cur) {
      for (const id of c.sourceIds) if (!cur.sourceIds.includes(id)) cur.sourceIds.push(id);
    } else {
      byNorm.set(c.normalizedTitle, { title: c.title, sourceIds: [...new Set(c.sourceIds)] });
    }
  }
  const out: MergedConcept[] = [];
  for (const [normalizedTitle, v] of byNorm) {
    out.push({ title: v.title, normalizedTitle, sourceIds: v.sourceIds, provenance: buildProvenance(v.sourceIds, registry) });
  }
  return out;
}

// Source.type → 기본 tier. 원본(pdf/이미지)=1차, 붙여넣은 텍스트/요약=2차. 파이프라인 연결용.
export function tierFromSourceType(type: "text" | "pdf" | "summary_text" | "image"): SourceTier {
  return type === "pdf" || type === "image" ? "primary" : "secondary";
}

// 병합된 개념들의 출처 집계(advisory) — applyLlmResult 결과의 WikiPage.sourceIds 리스트에 그대로 쓴다.
// registry 없으면 전부 2차로 간주(교차검증 개수=multiSource는 tier 무관 핵심 신호).
export function aggregateProvenance(
  conceptSourceIds: string[][],
  registry: Map<string, SourceMeta> = new Map(),
): { count: number; multiSource: number; avgScore: number } {
  if (!conceptSourceIds.length) return { count: 0, multiSource: 0, avgScore: 0 };
  let multiSource = 0;
  let sum = 0;
  for (const ids of conceptSourceIds) {
    const p = buildProvenance(ids, registry);
    if (p.sources.length >= 2) multiSource++; // 2개 이상 출처가 뒷받침 = 교차검증
    sum += p.score;
  }
  return { count: conceptSourceIds.length, multiSource, avgScore: sum / conceptSourceIds.length };
}

// noisy-OR: 각 출처가 독립적으로 사실을 뒷받침한다고 보고 corroboration을 합산. 출처 없으면 0.
function noisyOr(trusts: number[]): number {
  let complement = 1;
  for (const t of trusts) complement *= 1 - clamp01(t);
  return trusts.length ? 1 - complement : 0;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
