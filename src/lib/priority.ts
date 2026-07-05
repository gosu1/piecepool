// 노드 우선도 산식 — 백엔드 src-tauri/src/priority/mod.rs §5.2 미러.
// 실 Tauri 앱은 get_graph 가 priority 를 실어 보내므로 이 함수를 쓰지 않는다.
// 브라우저(vite dev/preview) mock 폴백에서만 동일 산식을 재현해 노드 크기를 굴린다.

const W = { centrality: 0.35, edge: 0.15, click: 0.25, recency: 0.15, source: 0.1 };

export interface RawFactors {
  centrality: number; // in_deg + out_deg
  edgeQuality: number; // 인접 엣지 strength·confidence 합
  clicks: number; // ln(1+c) 로그스케일 대상
  recency: number; // updatedAt 상대 신선도
  sourceBacking: number; // sourceIds + sourceRefs 수
}

/** space 내 min-max 정규화. 모두 같으면(max==min) 전부 0 (0/0 방지). */
function normalize(vals: number[]): number[] {
  if (vals.length === 0) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  if (range <= 0) return vals.map(() => 0);
  return vals.map((v) => (v - min) / range);
}

/** 노드 우선도(0~1). 팩터별 min-max 정규화 후 가중합·clamp, clicks 는 ln(1+c) 로그스케일. */
export function computePriorities(raw: RawFactors[]): number[] {
  const c = normalize(raw.map((r) => r.centrality));
  const e = normalize(raw.map((r) => r.edgeQuality));
  const k = normalize(raw.map((r) => Math.log(1 + r.clicks)));
  const rc = normalize(raw.map((r) => r.recency));
  const s = normalize(raw.map((r) => r.sourceBacking));
  return raw.map((_, i) =>
    Math.min(1, Math.max(0, W.centrality * c[i] + W.edge * e[i] + W.click * k[i] + W.recency * rc[i] + W.source * s[i])),
  );
}
