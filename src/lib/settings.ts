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

// ── Liner (feature 3: 출처 검색·fact-check) ──
// SSOT: docs/30-llm/provider-config.md §3.3. openai-key 와 동형(이 기기 localStorage에만 저장).
const LINER_KEY = "liner-key";
const LINER_ENDPOINT_KEY = "liner-endpoint";
const FACT_CHECK_KEY = "fact-check";

export function getLinerKey(): string {
  return ls()?.getItem(LINER_KEY) ?? "";
}

export function setLinerKey(key: string): void {
  ls()?.setItem(LINER_KEY, key.trim());
}

export function getLinerEndpoint(): string {
  return ls()?.getItem(LINER_ENDPOINT_KEY) ?? "";
}

// fact-check 토글 — 수용기준 §7 "기본 on". Liner 키가 있어야 실제 발동한다.
export function getFactCheck(): boolean {
  return ls()?.getItem(FACT_CHECK_KEY) !== "0";
}

export function setFactCheck(v: boolean): void {
  ls()?.setItem(FACT_CHECK_KEY, v ? "1" : "0");
}

// ── Inbox 좌측 PDF 패널 열림 상태 ──
// 기본 닫힘 — PDF 업로드 시 자동으로 열린다.
export function getInboxPdfOpen(): boolean {
  return ls()?.getItem("inbox-panel-pdf") === "1";
}

export function setInboxPdfOpen(open: boolean): void {
  ls()?.setItem("inbox-panel-pdf", open ? "1" : "0");
}

// ── Inbox 우측 탭 그룹 (a = 주 그룹, b = 분할 그룹) ──
// 컴포넌트(노트·Wiki)를 탭으로 추가/제거하고 그룹 간 이동(분할)할 수 있다.
// 둘 다 비면 피커 표시, b 가 비면 분할이 접힌다.
export type InboxTabKey = "note" | "wiki";
export type InboxTabGroups = { a: InboxTabKey[]; b: InboxTabKey[] };
const INBOX_TABS_KEY = "inbox-tabs";
const isTabKey = (v: unknown): v is InboxTabKey => v === "note" || v === "wiki";

export function getInboxTabGroups(): InboxTabGroups {
  const raw = ls()?.getItem(INBOX_TABS_KEY);
  if (raw == null) return { a: ["note"], b: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    // 구버전(단일 배열)은 주 그룹으로 읽는다
    const src: { a?: unknown; b?: unknown } = Array.isArray(parsed) ? { a: parsed } : ((parsed ?? {}) as object);
    const a = [...new Set(Array.isArray(src.a) ? src.a.filter(isTabKey) : [])];
    const b = [...new Set(Array.isArray(src.b) ? src.b.filter(isTabKey) : [])].filter((k) => !a.includes(k));
    return { a, b };
  } catch {
    return { a: ["note"], b: [] };
  }
}

export function setInboxTabGroups(groups: InboxTabGroups): void {
  ls()?.setItem(INBOX_TABS_KEY, JSON.stringify(groups));
}

// ── Inbox 패널 폭 (드래그 리사이즈, % 단위) ──
// pdf = 좌측(PDF), right = 분할 탭 그룹(b). 주 탭 그룹(a)이 나머지를 채운다.
export type InboxPaneKey = "pdf" | "right";
export const INBOX_PANE_DEFAULTS: Record<InboxPaneKey, number> = { pdf: 33, right: 28 };

export function clampPanePct(pct: number): number {
  return Math.min(70, Math.max(15, pct));
}

export function getInboxPaneWidths(): Record<InboxPaneKey, number> {
  const store = ls();
  const out = { ...INBOX_PANE_DEFAULTS };
  (Object.keys(out) as InboxPaneKey[]).forEach((k) => {
    const v = Number(store?.getItem(`inbox-pane-${k}`));
    if (Number.isFinite(v) && v > 0) out[k] = clampPanePct(v);
  });
  return out;
}

export function setInboxPaneWidth(key: InboxPaneKey, pct: number): void {
  ls()?.setItem(`inbox-pane-${key}`, String(Math.round(clampPanePct(pct) * 10) / 10));
}
