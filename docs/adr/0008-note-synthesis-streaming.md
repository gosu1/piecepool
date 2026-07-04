# ADR-0008: 파편 노트 정리 글 합성 — 스트리밍 + WikiPage 재사용

- 상태: 채택 (Accepted)
- 일자: 2026-07-03
- 관련: [note-synthesis](../30-llm/note-synthesis.md) · [prompt-templates](../30-llm/prompt-templates.md) · [convert 화면](../40-frontend/screens/convert.md) · [entities](../10-contracts/entities.md) · [ADR-0007](0007-importjob-orchestration-ts.md)

## 배경

강의 중 필기는 이해 속도가 진도를 따라가지 못해 논리정연할 수 없다 — 사용자는 파편(불릿·반문장·화살표)을 노트에 쌓는다. 이 파편을 버튼 한 번으로 **하나의 논리정연한 글**로 재구성해 보여주는 기능이 필요하다.

기존 파이프라인(`runWikiGeneration` → `LlmWikiResult`)은 **개념+관계 추출**이지 글 합성이 아니므로 새 호출 경로가 필요하다. 또한 결과물을 담을 새 문서 타입을 만들면 `docs/10-contracts/` 변경(4역할 승인)이 필요해 진행이 느려진다.

## 결정

1. **합성은 TS 레이어가 OpenAI Responses API를 `stream: true`(SSE)로 직접 호출**한다 (ADR-0007 정합 — LLM 오케스트레이션은 TS 소유, Rust는 파일 I/O만). 출력은 순수 마크다운으로, `LlmWikiResult` 스키마를 따르지 않는다 — 되묻기(gaps)·OCR과 같은 "부가 호출" 선례이며 [`llm-output-schema.md`](../10-contracts/llm-output-schema.md)는 무변경.
2. **Convert 한 번에 합성(스트리밍)과 기존 개념·관계 추출을 병렬 실행**한다. 추출 입력은 합성 결과가 아니라 **원문 파편** — 근거(evidence)가 LLM 문장으로 세탁되는 것을 막고, 기존 추출 동작과 동일하게 유지하며, wall-clock을 max(합성, 추출)로 줄인다. 한쪽 실패가 다른 쪽을 죽이지 않는다.
3. **결과는 기존 WikiPage 계약으로 저장**한다. 정체성은 전부 결정적: `conceptId = concept-syn-<sourceId>`, 파일 `syn-<sourceId>.md`, 제목 `{노트 제목} 정리`. 재변환은 같은 파일을 갱신하고(멱등), LLM 제목 드리프트의 영향을 받지 않으며, 계약 변경이 없다. `archive/` 원문은 기존 계약대로 불변.
4. **키/네트워크 미가용 시 결정적 휴리스틱 재배열**로 폴백한다 (앱 전체의 keyless 동작 원칙 유지). 스트리밍 도중 실패는 휴리스틱으로 바꿔치기하지 않고 부분 텍스트를 표시한 뒤 수동 재시도에 맡긴다.

## 결과

- (+) 계약 무변경 · archive 원문 불변 · 재변환 멱등 · 오프라인 전 기능 동작.
- (+) 파편이 글이 되는 과정을 실시간으로 관찰(스트리밍) — 학습 UX의 핵심 순간.
- (−) 스트리밍 중간 실패는 자동 재시도 없음(재시도는 첫 delta 이전만) — 부분 텍스트 유지 + 수동 재시도.
- (−) 정리 글 페이지는 관계를 만들지 않아 그래프에서 고립 노드로 시작 — 연결성 게이트(staging)가 이미 수용하는 상태.
- 세부 파이프라인: [note-synthesis.md](../30-llm/note-synthesis.md). 화면: [convert.md](../40-frontend/screens/convert.md).

## 대안

- (B) 합성 텍스트에서 개념 추출(직렬 실행): 근거 사슬이 LLM 문장으로 세탁되고 호출이 직렬화됨 → 기각.
- (C) 새 문서 엔티티/폴더 신설: `contracts-change` 4역할 승인 필요, WikiPage로 충분히 표현됨 → 기각.
- (D) Vercel AI SDK 등 스트리밍 라이브러리 도입: ~60줄 SSE 루프에 의존성 과잉(현재 LLM 관련 런타임 의존성 0개) → 기각.
- (E) 실시간 자동 변환(타이핑 디바운스): API 비용·화면 산만함 → MVP 제외, 후속 토글로 열어둠.
- (F) 휴리스틱 결과의 가짜 스트리밍: 사용자를 속이는 UI → 기각, 즉시 전체 표시 + 엔진 배지.
