// 청킹 설정 — localStorage 기반(openai-key와 동형, 이 기기에만 저장). 설정 모달에서 토글/조정.
// runWikiGeneration(opts.chunk)로 전달되어 [C] semantic chunking을 켠다. 기본 off(기존 동작 불변).

const ENABLED_KEY = "chunk-enabled";
const PCT_KEY = "chunk-percentile";
const DEFAULT_PERCENTILE = 10;

function ls(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function getChunkSettings(): { enabled: boolean; percentile: number } {
  const store = ls();
  const enabled = store?.getItem(ENABLED_KEY) === "1";
  const pct = Number(store?.getItem(PCT_KEY));
  return { enabled, percentile: Number.isFinite(pct) && pct > 0 ? pct : DEFAULT_PERCENTILE };
}

export function setChunkEnabled(v: boolean): void {
  ls()?.setItem(ENABLED_KEY, v ? "1" : "0");
}

export function setChunkPercentile(pct: number): void {
  ls()?.setItem(PCT_KEY, String(pct));
}

// runWikiGeneration에 넘길 opts.chunk. 미활성이면 undefined → 기존 단일 호출 경로.
export function chunkOpts(): { enabled: boolean; percentile: number } | undefined {
  const s = getChunkSettings();
  return s.enabled ? { enabled: true, percentile: s.percentile } : undefined;
}

// ── Inbox 분할 뷰 ──
// "2" = NOTE | 새 페이지, "3" = PDF | 새 페이지(source) | Wiki. 설정 모달·Inbox 헤더에서 전환.
export type InboxView = "2" | "3";
const INBOX_VIEW_KEY = "inbox-view";

export function getInboxView(): InboxView {
  return ls()?.getItem(INBOX_VIEW_KEY) === "3" ? "3" : "2";
}

export function setInboxView(v: InboxView): void {
  ls()?.setItem(INBOX_VIEW_KEY, v);
}
