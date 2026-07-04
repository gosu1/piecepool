# 정리 글 합성 (Note Synthesis)

파편 노트(`archive/`) 1개를 논리정연한 마크다운 글 1개로 재구성해 **토큰 단위 스트리밍**으로 보여주고, `wiki/`의 WikiPage로 저장하는 파이프라인.

> 결정 배경: [ADR-0008](../adr/0008-note-synthesis-streaming.md). 엔티티/frontmatter SSOT: [`../10-contracts/entities.md`](../10-contracts/entities.md) · [`../10-contracts/markdown-frontmatter.md`](../10-contracts/markdown-frontmatter.md) — 본 문서는 재정의하지 않고 링크만 한다.
> 프롬프트 본문: [`prompt-templates.md`](prompt-templates.md) §10. 화면/상태 설계: [`../40-frontend/screens/convert.md`](../40-frontend/screens/convert.md).

---

## 1. 책임 & 경계

| 담당 | 내용 |
|---|---|
| 본 파이프라인 (`src/llm/stream.ts` + `src/llm/synthesize.ts`) | SSE 수신·파싱, 합성 호출, 폴백, 부분 텍스트 전달 |
| 영속화 (`src/lib/llmApply.ts` `synthesisPage`) | 결정적 정체성으로 WikiPage 구성, 기존 페이지 갱신 |
| 위임 — 기존 추출 파이프라인 | 개념·관계 추출은 `runWikiGeneration` 그대로 (본 문서 범위 밖) |
| 위임 — Rust `save_wiki` | frontmatter 검증 + 원자적 파일 쓰기 (변경 없음) |

`archive/` 원문은 절대 수정하지 않는다 (기존 계약 그대로).

---

## 2. 트리거 & 흐름

archive 노트 화면(Source reader)의 **"정리 글 변환"** 버튼 1개. 저장된 노트에서만 동작한다(미저장 편집이 있으면 거부 — 화면 문서 §5).

```
[정리 글 변환]
     │
     ├─ A. 합성: runSynthesis ── streamResponsesText (SSE)
     │        onDelta → 미리보기 실시간 렌더
     │        완료 → synthesisPage() → save_wiki
     │
     └─ B. 추출: 기존 runWikiGeneration (입력 = 원문 파편)
     
  Promise.allSettled — 실패 격리: 한쪽이 실패해도 다른 쪽 결과는 저장된다
```

- **취소**는 합성 스트림만 중단한다. 추출(B)은 비파괴적 추가 작업이므로 계속 진행되며, UI에 이 비대칭을 명시한다.
- 합성은 `ImportJob`이 아니다 — [`entities.md`](../10-contracts/entities.md)의 ImportJob 상태머신을 오염시키지 않고 별도 상태(화면 문서 §3)를 쓴다.

---

## 3. 스트리밍 프로토콜

OpenAI Responses API `POST /responses` + `stream: true`. Chat Completions와 달리 `data: [DONE]` 센티널이 **없고**, 타입 있는 이벤트가 온다.

| 이벤트 `type` | 처리 |
|---|---|
| `response.created` | 스트림 시작 표시 (스켈레톤 해제) |
| `response.output_text.delta` | `delta` 누적 + onDelta 콜백 |
| `response.output_text.done` | 무시 (누적 버퍼 우선) |
| `response.completed` | 전체 텍스트로 resolve |
| `response.incomplete` | 부분 텍스트 + 사유(`max_output_tokens` 등)로 resolve — 성공 취급, 경고 표시 |
| `response.failed` / `error` | reject |
| 그 외 (`response.in_progress`, `response.output_item.*`, `response.content_part.*`, 미지 타입) | 무시 (전방 호환) |

파서 규칙:

- 프레임 경계 = 빈 줄. `data:` 라인만 수집, `event:` 라인 무시. 청크 경계에서 잘린 프레임은 버퍼링.
- `TextDecoder(stream: true)` 필수 — 한글 멀티바이트가 청크 경계에서 잘린다.
- **스톨 타이머 45초** (청크마다 리셋) — 전체 타임아웃은 두지 않는다 (긴 글은 정상적으로 60초를 넘긴다).
- `res.ok`가 아니면 본문은 SSE가 아닌 JSON 에러 — 기존 어댑터와 같은 분류(401/403 터미널, 그 외 재시도 가능).
- 응답 body가 null(스트리밍 미지원 환경)이면 `stream: false`로 재요청해 전체 텍스트를 한 번에 전달 (버퍼링 폴백).

재시도 정책:

| 시점 | 정책 |
|---|---|
| 첫 delta **이전** 실패 (네트워크, 429, 5xx) | 지수 백오프 최대 2회 (기존 어댑터 상수 미러) → 최종 실패 시 휴리스틱 폴백 + 경고 |
| 첫 delta **이후** 실패 | 재시도·휴리스틱 교체 없음 — 부분 텍스트 유지, 저장 안 함, 수동 재시도 |
| 사용자 취소 (AbortController) | 그대로 전파 — 폴백 없음, 저장 없음 |

---

## 4. 프롬프트

핵심 원칙 (본문은 [`prompt-templates.md`](prompt-templates.md) §10이 SSOT):

1. 파편에 있는 **모든 사실 보존** — 어떤 정보도 빼먹지 않는다.
2. 파편에 없는 내용을 **지어내지 않는다** (grounding 규칙은 기존 위키 생성과 동일 철학).
3. 논리적 순서로 재배열하고 `##` 헤딩으로 구조화한다.
4. `[[위키링크]]`와 `![[임베드]]`는 글자 그대로 유지한다.
5. 출력은 순수 마크다운, 첫 줄은 `# {제목}`.

---

## 5. 폴백 매트릭스

| 상황 | 동작 | 엔진 표시 |
|---|---|---|
| API 키 없음 | 결정적 휴리스틱 재배열 즉시 표시 (가짜 스트리밍 없음) | 휴리스틱 |
| 스트림 시작 전 실패 (재시도 소진) | 휴리스틱 폴백 + 실패 사유 경고 | 휴리스틱 |
| 스트림 도중 실패 | 부분 텍스트 유지 + "저장 안 됨" + 수동 재시도 | GPT (부분) |
| `response.incomplete` | 부분 텍스트 저장 + "일부만 생성됨" 경고 | GPT |
| 스트리밍 미지원 webview | `stream: false` 버퍼링 폴백 (한 번에 표시) | GPT |

휴리스틱 합성: 결정적 재배열만 한다 — `# {제목} 정리` 헤더, 기존 헤딩 유지, 빈 줄로 나뉜 파편을 문단/불릿로 정리, 문장 생성·사실 창작 없음.

---

## 6. 영속화

정체성은 전부 노트의 `sourceId`에서 결정적으로 파생한다 (LLM이 정체성·제목을 소유하지 않는다):

| 필드 | 값 | 이유 |
|---|---|---|
| `conceptId` | `concept-syn-<sourceId>` | 재변환 = 같은 개념. `syn-` 접두사로 추출 개념과 네임스페이스 분리 |
| `path` | `syn-<sourceId>.md` | 재변환 = 같은 파일 갱신 (concept-slug 파일명 규칙 충족) |
| `id` | `wiki-syn-<sourceId>` | 〃 |
| `title` | `{노트 제목} 정리` | LLM 제목 드리프트 무관, 트리·탭·검색 안정 |
| `subjectIds` | 노트의 `subjectIds` | frontmatter 검증 통과 |
| `sourceIds` | `[노트 sourceId]` | "관련 소스"로 원본 파편 노트 역참조 |
| `sourceRefs` | 합성 본문의 `![[임베드]]`에서 파생 | frontmatter↔본문 embed 충돌 경고 방지 |

- 재변환: 기존 페이지가 있으면 `id`/`path`/`createdAt`을 보존하고 본문·`updatedAt`만 갱신. 기존 정리본이 있으면 변환 시작 **전에** 덮어쓰기 확인을 받는다 (사용자가 손수 고친 정리본 보호).
- **클로버 가드**: 기존 추출 파이프라인의 제목 기반 병합이 정리 글 페이지를 개념 스텁으로 덮어쓰지 않도록, `applyLlmResult`는 병합 후보(`existing`)에서 합성 페이지(`concept-syn-` 접두사)를 제외한다.
- 관계는 생성하지 않는다 — 정리 글은 문서이지 그래프 주장(claim)이 아니다. 고립 노드는 연결성 게이트(staging)가 수용한다.

---

## 7. UI

버튼 위치·미리보기 패널·상태 전이·엣지 케이스는 [`../40-frontend/screens/convert.md`](../40-frontend/screens/convert.md)가 소유한다.

---

## 8. 관련 문서

| 문서 | 관계 |
|---|---|
| [ADR-0008](../adr/0008-note-synthesis-streaming.md) | 결정 배경·대안 |
| [`prompt-templates.md`](prompt-templates.md) §10 | 합성 프롬프트 SSOT |
| [`../40-frontend/screens/convert.md`](../40-frontend/screens/convert.md) | 화면·상태 설계 |
| [`../10-contracts/entities.md`](../10-contracts/entities.md) | WikiPage/Concept/ArchiveNote 계약 (무변경) |
| [`../10-contracts/markdown-frontmatter.md`](../10-contracts/markdown-frontmatter.md) | 저장 전 검증 규칙 (무변경) |
| [`../20-backend/import-pipeline.md`](../20-backend/import-pipeline.md) | 병렬 실행되는 기존 추출 파이프라인 |

---

## 9. 변경 이력 노트

- 2026-07-03 @gosu1 — 최초 작성 (ADR-0008과 동시).
