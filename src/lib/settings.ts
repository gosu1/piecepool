// 청킹 설정 — localStorage 기반(gemini-key와 동형, 이 기기에만 저장). 설정 모달에서 토글/조정.
// runWikiGeneration(opts.chunk)로 전달되어 [C] semantic chunking을 켠다. 기본 off(기존 동작 불변).

const ENABLED_KEY = "chunk-enabled";
const PCT_KEY = "chunk-percentile";
const DEFAULT_PERCENTILE = 10;

function ls(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

/**
 * Gemini API 키 — 이 기기 설정(설정 모달 → localStorage["gemini-key"])이 우선,
 * 없으면 빌드 시 주입된 값(`VITE_GEMINI_API_KEY`), 그것도 없으면 "" (휴리스틱 폴백).
 * 데모 배포에서 심사위원이 키 발급 없이 바로 쓰게 하려면 빌드 시 주입한다 —
 * 소스에 커밋하지 말 것(.env.local 또는 CI Secret). 절차는 RUN_GUIDE 참고.
 */
export function geminiKey(): string {
  const stored = ls()?.getItem("gemini-key")?.trim();
  if (stored) return stored;
  // 반드시 `import.meta.env.VITE_GEMINI_API_KEY` 리터럴 그대로 둔다 — Vite 는 이 정확한 표현식만
  // 빌드 시 값으로 정적 치환(인라인)한다. 변수 별칭(const m = import.meta; m.env…)으로 바꾸면
  // 치환이 안 돼 데모 키가 번들에 안 박힌다. CLI 스크립트 tsconfig 에는 vite/client 타입이 없어
  // import.meta.env 접근이 TS 오류라, 그 한 줄만 무시한다(앱 tsconfig 에선 정상 타입).
  // @ts-ignore  -- import.meta.env: Vite 앱 빌드 전용 주입 값
  const injected: string | undefined = import.meta.env.VITE_GEMINI_API_KEY;
  return injected || "";
}

/**
 * LLM 엔드포인트(OpenAI 호환 base URL) — 비워두면 undefined 를 돌려 각 모듈의 기본값
 * (Gemini OpenAI 호환층)이 그대로 쓰이게 한다. 로컬 LLM(Ollama 등)으로 갈아끼우는 유일한 스위치.
 * 빈 문자열을 그대로 넘기면 `opts?.endpoint ?? DEFAULT` 가 빈 주소를 채택해버린다 → 반드시 undefined.
 */
const LLM_ENDPOINT_KEY = "llm-endpoint";

export function llmEndpoint(): string | undefined {
  return ls()?.getItem(LLM_ENDPOINT_KEY)?.trim() || undefined;
}

export function setLlmEndpoint(url: string): void {
  ls()?.setItem(LLM_ENDPOINT_KEY, url.trim());
}

/** 설정 모달 "LLM 엔진" 뱃지 문구. 저장 전 입력값으로 바로 판정하도록 인자를 받는다.
 *  키가 없으면 호출 자체를 안 하므로(휴리스틱 폴백) 엔드포인트를 넣었어도 로컬이라고 하지 않는다. */
export function engineLabel(key: string, endpoint: string): "Gemini" | "로컬" | "휴리스틱(오프라인)" {
  if (!key.trim()) return "휴리스틱(오프라인)";
  return endpoint.trim() ? "로컬" : "Gemini";
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

/** documentElement 에 --pp-body-font-size 주입 — 앱 시작(PiecePoolApp)·설정 변경 공용.
 *  Node(check:scripts, DOM lib 없음)에서도 타입체크되므로 globalThis 캐스트(gemini.ts:180 패턴). */
export function applyBodyFontSize(px: number): void {
  const g = globalThis as { document?: { documentElement: { style: { setProperty(name: string, value: string): void } } } };
  g.document?.documentElement.style.setProperty("--pp-body-font-size", `${px}px`);
}
