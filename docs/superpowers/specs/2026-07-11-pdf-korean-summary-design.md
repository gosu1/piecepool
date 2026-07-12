# PDF 영어→한국어 번역·요약 스트리밍 — 설계

**날짜**: 2026-07-11 · **상태**: 구현 완료 (`feat/pdf-korean-summary`)

## 배경 (왜)

PDF 업로드 시 기존 파이프라인(`runOutline`)은 **영어 목차(헤딩)만** 노트에 삽입했다.
사용자는 기존 AI 논문 요약 서비스처럼 영어 논문이 **한국어로 번역·요약된 본문**으로 채워지길 원했다.
기존 AI 논문 요약 서비스와의 차별점: 결과가 **사용자가 직접 편집 가능한 마크다운**이어야 한다.

원인은 버그가 아니라 설계였다 — `importPdf`가 목차 전용 프롬프트를 호출했고 번역 지시가 없었다.

## 확정 결정

1. **목적지**: PDF 업로드 → 목차 대신 한국어 요약을 노트 본문에 **자동 스트리밍**. 저장 시
   archive/에 그대로 간다(사전 저장 초안은 사용자 소유 — archive 불가침 계약과의 합의점).
2. **스코프**: KaTeX 수식 + "쉬운 설명" 접기 콜아웃. 페이지 칩·하이라이트는 제외.
3. **수식 렌더**: 평소 렌더, 커서 접근/클릭 시 원문 `$...$` 노출.
4. **콜아웃 접기**: 편집기 안에서도 셰브론으로 접기(CM6 내장 codeFolding), 읽기 모드는 `<details>`.

## 아키텍처 (3 워크스트림)

### A. LLM — `src/llm/pdfsummary.ts`
`synthesize.ts` 클론(스트리밍·재시도·부분 유지). 한국어 번역·요약 프롬프트는
[`../../30-llm/prompt-templates.md`](../../30-llm/prompt-templates.md) §11 이 SSOT.
temperature 0.2, 48k 입력 클램프. 오프라인 폴백 없음(번역은 휴리스틱 불가) — 키 없거나
스트림 시작 전 실패면 throw, 도중 실패는 `PdfSummaryStreamError`(부분 유지).

### B. 상태 — `src/store/inboxDraftStore.ts`
Inbox 초안(title/body)을 스토어로 **리프팅**. InboxSection 은 활성 탭만 렌더돼 탭 전환 시
언마운트되므로, 로컬 state 면 스트리밍 중/후 요약이 소실된다("탭 전환 digest 소실" 기존 버그).
스토어 소유라 종결 병합이 마운트와 무관. single-flight + 취소. **주의**: `clearDraft`(탭 버림)는
job 을 abort 하는데 abort 는 비동기라, 종결 `finish()`가 지워진 초안을 되살리지 않도록
초안 존재 여부로 병합을 가드한다(레이스 회귀 방지).

### C. 렌더 — 수식·콜아웃 (에디터 + 읽기 모드 양쪽)
- `src/lib/math.ts` — `findMathSpans` (Pandoc식 통화 `$5` 오탐 방지).
- `src/lib/cmMath.ts` — `StateField`+KaTeX 위젯(블록 수식은 세로 레이아웃 변경이라 ViewPlugin 불가).
  스팬은 docChanged 시에만 재스캔하고 선택 변경 시 캐시 재사용(긴 요약 커서 이동 렉 방지).
- `src/lib/callout.ts` — `remarkCallout` (mdast `hName`→details, rehype-raw 불필요).
- `src/lib/cmCallout.ts` — `hideHeaderMarks` 클론 + CM6 내장 fold 셰브론.
- `src/lib/markdown.tsx` — 읽기 모드에 remark-math/rehype-katex/remarkCallout 배선.
- 문법 규약: [`../../40-frontend/markdown-callout-math.md`](../../40-frontend/markdown-callout-math.md) (contracts 아님, 코드가 SSOT).

## 삭제

`src/llm/outline.ts`·`pdfdigest.ts`(+tests) — 유일 호출처 소멸 / 사장 코드.

## 검증

- 유닛(vitest): math·callout·읽기모드 파이프라인·pdfsummary·inboxDraftStore.
- e2e(Playwright): CM6 수식 렌더+커서 reveal, 콜아웃 접기, 초안 리프팅 회귀.
- 수동(실 Gemini 키 + Tauri): PDF→한국어 요약 스트리밍, 탭 전환 보존, 저장 병합.

## 알려진 한계

- 콜아웃 안 **블록** `$$` 수식은 인용 마크와 얽혀 양쪽 다 렌더 불가 → 프롬프트 규칙으로 차단.
- PDF 여러 개 동시 드롭 시 single-flight 로 첫 개만 요약(나머지는 embed + 안내). v1 수용.
