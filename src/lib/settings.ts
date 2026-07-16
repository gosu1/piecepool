// 청킹 설정 — localStorage 기반(gemini-key와 동형, 이 기기에만 저장). 설정 모달에서 토글/조정.
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
// SSOT: docs/30-llm/provider-config.md §3.3. gemini-key 와 동형(이 기기 localStorage에만 저장).
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

// ── Inbox 보조 패널 열림 상태 ──
// 노트 에디터는 항상 중심에 고정. 좌(PDF 자료)·우(위키 참조)만 여닫는다.
// 열림 여부는 저장하지 않는다 — 노트마다 닫힌 채 시작하고, PDF 업로드 시 PDF,
// AI 정리 완료 시 위키가 그 노트의 내용으로 열린다. (전역 저장 시 빈 새 노트에도
// 남의 공간 파일·위키가 딸려 열렸다.)
export type InboxPanelKey = "pdf" | "wiki";

// ── Inbox 패널 폭 (드래그 리사이즈, % 단위) ──
// pdf = 좌측(PDF), wiki = 우측(위키). 가운데 노트가 나머지를 채운다.
export type InboxPaneKey = "pdf" | "wiki";
export const INBOX_PANE_DEFAULTS: Record<InboxPaneKey, number> = { pdf: 33, wiki: 30 };

export function clampPanePct(pct: number): number {
  return Math.min(70, Math.max(30, pct));
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

// ── LLM 생성 언어 (위키·파인만 등 AI 생성 텍스트; tidy 제외) ──
// SSOT: docs/superpowers/specs/2026-07-12-llm-output-language-design.md §3
export type OutputLanguage = "ko" | "en";
const OUTPUT_LANGUAGE_KEY = "output-language";

export function getOutputLanguage(): OutputLanguage {
  return ls()?.getItem(OUTPUT_LANGUAGE_KEY) === "en" ? "en" : "ko";
}

export function setOutputLanguage(v: OutputLanguage): void {
  ls()?.setItem(OUTPUT_LANGUAGE_KEY, v);
}

// ── 본문 글자 크기 — 에디터(CM6 테마)와 읽기 모드(markdown.tsx)가 공유하는 CSS 변수 ──
// 스펙: docs/superpowers/specs/2026-07-16-body-font-size-design.md
const BODY_FONT_KEY = "body-font-size";
export const BODY_FONT_MIN = 13;
export const BODY_FONT_MAX = 17;
const BODY_FONT_DEFAULT = 15;

export function getBodyFontSize(): number {
  const raw = Number(ls()?.getItem(BODY_FONT_KEY) ?? NaN);
  if (!Number.isInteger(raw)) return BODY_FONT_DEFAULT;
  return Math.min(BODY_FONT_MAX, Math.max(BODY_FONT_MIN, raw));
}

export function setBodyFontSize(px: number): void {
  ls()?.setItem(BODY_FONT_KEY, String(px));
}

/** documentElement 에 --pp-body-font-size 주입 — 앱 시작(PiecePoolApp)·설정 변경 공용. */
export function applyBodyFontSize(px: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--pp-body-font-size", `${px}px`);
}
