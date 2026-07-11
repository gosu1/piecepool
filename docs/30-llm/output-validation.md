# Output Validation

LLM 호출 결과를 저장 전에 검증 / 재시도 / 부분 실패 처리하는 절차.

> SSOT: [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md) (JSON Schema 정의).
> 어댑터 계층: [`provider-config.md`](provider-config.md).
> 호출 흐름: `../20-backend/import-pipeline.md` (작성 예정).

---

## 1. 책임 범위

본 문서는 **어댑터 내부의 검증 / 재시도 / 부분 실패 처리**를 정의한다.

| 책임 | 위치 |
|---|---|
| HTTP 호출 + raw 응답 수신 | [`provider-config.md`](provider-config.md) §3 |
| raw → `LlmWikiResult` 변환 | 본 문서 §2 |
| JSON Schema 검증 | 본 문서 §3 |
| 재시도 정책 | 본 문서 §4 (provider-config §4.1 확장) |
| 부분 실패 처리 | 본 문서 §5 |
| 파인만(에디터 도구) · 핵심 주제 게이트 | 본 문서 §6 |
| ImportJob 상태 전이 | `../20-backend/import-job-states.md` (작성 예정) |

---

## 2. 변환 단계

Gemini raw JSON → `LlmWikiResult` 정규화.

| Provider | raw 형식 | 정규화 단계 |
|---|---|---|
| Gemini | `{choices: [{message: {content: "..."}}]}` (OpenAI 호환 Chat Completions, `response_format`) | `choices[0].message.content` JSON 파싱 |

### 2.1 정규화 실패 처리

- raw가 JSON 파싱 안 됨 → §4.1 schema 위반과 동일 처리 (재시도)
- raw가 JSON이지만 최상위 형식 다름 (예: `{result: {...}}`로 한 단계 더 래핑) → adapter가 wrap 자동 unwrap 시도 (1회), 실패 시 재시도

---

## 3. 검증 단계

`LlmWikiResult`로 변환된 결과를 저장 전에 7개 검증을 거친다.

### 3.1 JSON Schema 통과

[`llm-output-schema.md`](../10-contracts/llm-output-schema.md) §4의 JSON Schema (Draft 2020-12) 적용.

- 라이브러리: `ajv` 또는 동등 (TBD, [open-questions](../00-overview/open-questions.md))
- strict mode (`additionalProperties: false`)
- 실패 시 §4.1 재시도

### 3.2 Concept title 일관성

- `relations[].sourceConceptTitle` / `targetConceptTitle`이 같은 응답의 `concepts[].title` 또는 기존 Workspace의 `Concept.normalizedTitle`과 일치해야 함
- 매칭 우선순위: 같은 응답 → 같은 Subject → 같은 KnowledgeSpace
- 미스매치 시 해당 relation drop, 경고 로그

### 3.3 RelationType 노드 호환성

- [`relation-types.md`](../10-contracts/relation-types.md) §6 노드 호환성 매트릭스 위반 시 해당 relation reject
- 매트릭스 위반 = §5 부분 실패 (해당 relation만 drop)

### 3.4 SourceRef 무결성

- `concepts[].sourceRefs[].sourceId`가 호출 입력의 Source.id 목록에 포함되는지
- `page` 값이 해당 PDF 총 page 범위 내인지
- 위반 시 해당 SourceRef drop (Concept 자체는 저장)

### 3.5 `related_to` 비율

- 응답 전체 relation 중 `related_to` 비율이 50% 초과 시 **경고 로그** (저장은 허용)
- 비율 30% 초과 시 info 로그
- LLM 프롬프트 검토 신호

### 3.6 빈 결과 처리

- `concepts.length === 0` → 호출 자체는 성공이지만 추출 결과 0 (저장 안 함, ImportJob status=`completed_empty` TBD)
- `relations.length === 0`는 정상 (single Concept일 수 있음)

### 3.7 중복 Concept 처리

- 응답 안에 동일 `normalizedTitle` 다중 등장 시 마지막 1개만 유지 + 경고
- 기존 Workspace의 Concept과 동일 시 merge (overwrite 아님, [`../20-backend/import-pipeline.md`](../20-backend/) 작성 예정에서 상세)

---

## 4. 재시도 정책

[`provider-config.md`](provider-config.md) §4.1의 매트릭스를 본 문서가 확장.

### 4.1 재시도 대상

| 조건 | 재시도 | 같은 입력? |
|---|---|---|
| network timeout | ✅ | 동일 |
| JSON 파싱 실패 | ✅ | 동일 |
| JSON Schema 위반 (필드 누락) | ✅ | 동일 + system prompt에 schema reminder 추가 |
| Concept title 미스매치만 | ❌ | 해당 relation drop (§3.2), 재시도 안 함 |
| 노드 호환성 위반만 | ❌ | 해당 relation drop |
| 빈 결과 (concepts=0) | ❌ | 사용자에게 알림 (입력이 부족) |
| 401 / 403 | ❌ | 인증 오류 노출 |
| 429 rate limit | ✅ (1회) | `Retry-After` 헤더 존중 |
| 500 / 502 / 503 | ✅ | 지수 backoff |

### 4.2 재시도 한도

- `PIECEPOOL_LLM_MAX_RETRIES` (기본 2). 호출 자체 + N회 = 최대 N+1 시도
- 매 재시도 사이 지수 backoff (1s → 2s → 4s)
- 총 소요 > `PIECEPOOL_LLM_TIMEOUT_MS` 시 강제 중단

### 4.3 재시도 시 프롬프트 보강

JSON Schema 위반으로 재시도 시 system prompt에 다음 추가:

```
[재시도 #N] 이전 응답이 다음 schema 위반:
- 누락 필드: <필드명 목록>
- 잘못된 타입: <필드명: 기대 vs 실제>
JSON Schema를 엄격히 따르세요.
```

Gemini는 structured output에서 `strict: true`를 거부하므로 `strict: false` + 다운스트림 파싱으로 받는다 — schema 위반이 발생할 수 있고, 발생 시 위반 정보 주입으로 재시도한다.

---

## 5. 부분 실패 처리

LLM 응답에 유효한 부분과 무효한 부분이 섞여 있으면 **유효 부분만 저장**.

### 5.1 시나리오 매트릭스

| 유효한 concepts | 유효한 relations | 처리 |
|---|---|---|
| ≥1 | ≥0 | 저장 (relations만 부분 drop 가능) |
| 0 | ≥0 | 저장 안 함 (§3.6 빈 결과) |
| ≥1 (모든 relations 무효) | 0 | concepts만 저장, relations 빈 배열 |

### 5.2 ImportJob 기록

부분 실패 시 `ImportJob.errorMessage`에 다음 형식 기록:

```
[partial] concepts=N saved, relations=M saved
- dropped relations: K (reasons: title-mismatch=X, node-compat=Y, sourceref=Z)
- warnings: related_to=P%, duplicates=Q
```

`ImportJobStatus`는 `completed` 유지 (실패 아님). UI는 경고 배지만 표시.

### 5.3 사용자 알림

부분 실패는 Frontend의 `screens/wiki-view.md` (작성 예정)에서 다음 위치에 노출:
- 새 WikiPage 상세에 "일부 관계 누락" 인디케이터
- 클릭 시 drop된 relation 목록 + 사유

---

## 6. 파인만(에디터 도구) · 핵심 주제 게이트

파인만은 **파이프라인 단계가 아니라 노트 에디터의 도구**다. 사용자가 언제든 열어, 고른 섹션을 **자기 말로 설명**한다. LLM 은 정답을 주지 않은 채 그 설명의 구멍 하나만 짚어 되묻는다(`probeExplanation`, `src/llm/feynman.ts`). 사용자가 쓴 설명은 그대로 위키의 재료가 된다.

> Liner 출처 검증으로 label↔user 간극을 판정하는 경로는 **파인만이 아니라 별도 기능**이다 — 정보 간극 메우기(`src/llm/gaps.ts`, feature 3). 초기 설계에서 한 절에 뭉쳐 있었으나 두 기능으로 분리됐다.

### 6.1 진입점 (세 가지)

자동 임계값 트리거는 **없다**(초기 설계에서 폐기). 사용자가 연다:

- `##`/`###` **제목 줄에 마우스를 올리면** 제목 끝에 `파인만` 버튼 → 클릭 한 번으로 그 섹션 시작 (`src/lib/cmHeadingAction.ts`)
- 텍스트를 **드래그**하면 선택 위에 버튼 → 선택에 걸친 여러 섹션을 한 번에
- 인박스 **`파인만` pill**(토글 아님, 액션) → 글 전체

`##` 을 고르면 자신 + 하위 `###` 소주제까지 순차로 묻는다. `###` 만 고르면 그 하나만. 섹션 판별은 `src/lib/noteSections.ts`, 세션·판정은 `src/store/feynmanStore.ts`, UI 는 `src/app/panes/FeynmanPanel.tsx`.

키가 없어 휴리스틱으로 내려갔으면 되묻는 질문을 만들 수 없다 — 있는 척하지 않고 건너뛰며 사용자에게 알린다.

### 6.2 판정은 오직 사용자

- 설명↔되물음 왕복 횟수에 상한은 없다. **종료는 오직 사용자가** 결정한다 — LLM 은 채점하지 않는다.
- 설명을 **한 번도 쓰지 않으면 `[네, 이해했어요]` 를 누를 수 없다**(근거 없는 판정 금지).
- 대화는 메모리 전용. 판정 결과(answered / understood / 사용자가 쓴 설명)만 `localStorage`(`pp-feynman-sections`)에 남는다.
- `[네, 이해했어요]` → 사용자의 설명을 재료로 **그 섹션 스코프만** 다시 생성해 기존 위키에 병합한다(`src/lib/sectionRegen.ts`). 노트 원문(`archive/`)은 바뀌지 않는다. 재생성이 Gemini 가 아니라 휴리스틱으로 떨어지면 **적용하지 않는다**(멀쩡한 위키를 헤딩 분해물로 덮지 않는다).
- `[아직 모르겠어요]` + 설명이 있으면 해당 개념에 `review_needed` self-loop 를 붙인다([relation-types.md](../10-contracts/relation-types.md)). 사용자가 쓴 설명이 그대로 evidence 가 된다.
- 인박스 초안에서 한 파인만은 저장 시 진짜 노트로 이관되고, 그 설명이 위키 생성 입력에 함께 들어간다.

### 6.3 핵심 주제 게이트

**Gemini 가 노트의 `##` 섹션 중 "핵심 주제"를 판별한다**(`classifyCoreSections`, `src/llm/coretopics.ts`). 핵심 주제는 사용자가 파인만에 **답하고(answered) "이해했다"고 선언해야(understood)** 위키로 변환할 수 있다 (`src/lib/coreGate.ts`).

- 게이트는 **wiki/ 로 가는 모든 경로**에 걸린다: DocView `AI 위키 생성`, DocView `정리 글 변환`(합성 + 개념 추출), 인박스 `저장 + AI 정리`.
- **노트(`archive/`)는 언제나 저장된다** — 막는 것은 위키뿐이다. 사용자의 원문은 사용자 것이다.
- 판정은 **노트 내용의 해시로 캐시한다**(`localStorage["core-topics:<sourceId>"]`) — 같은 글에 모델이 오늘내일 다르게 답하면 게이트가 변덕스러워진다. 노트를 고치면 해시가 바뀌어 다시 판별한다.
- **키가 없거나 판별에 실패하면 게이트를 걸지 않는다(fail-open)** — 사람을 못 막는 것보다 잘못 막는 것이 나쁘다. 응답에서 못 알아들은 섹션(없는 id·형식 위반)도 핵심이 아닌 것으로 본다.
- 차단 시 어느 주제가 막는지 알려준다(하단 토스트 + AI 상태줄).

### 6.4 ImportJob 상태

파인만이 파이프라인을 멈춰 세우지 않으므로 사용자 응답을 기다리는 상태는 없다:

- `llm_processing` → `writing` → `completed`
- 핵심 주제 게이트에 걸리면 `llm_processing` 을 건너뛴다 → `writing`(노트만) → `completed`

`clarify_pending` 은 [`entities.md`](../10-contracts/entities.md) `ImportJobStatus` enum 에 **그대로 남아 있으나**(계약 유지) **코드에서 도달하지 않는다.** 전이는 [`../20-backend/import-job-states.md`](../20-backend/import-job-states.md).

---

## 7. 오류 분류 + 사용자 메시지

| 분류 | provider 응답 | 사용자 메시지 |
|---|---|---|
| `auth` | 401 / 403 | "API 키를 확인해주세요. 설정에서 재입력하세요." |
| `network` | timeout, DNS 실패 | "LLM 서버에 연결할 수 없습니다. 네트워크를 확인하세요." |
| `rate_limit` | 429 | "잠시 후 재시도하세요." |
| `schema` | JSON Schema 위반 (재시도 후) | "LLM 응답이 형식에 맞지 않습니다. 입력을 확인하거나 모델을 변경하세요." |
| `empty` | concepts=0 | "입력에서 추출할 개념을 찾지 못했습니다. 더 자세한 자료를 입력해주세요." |
| `partial` | 부분 실패 | "일부 관계가 누락됐습니다. 자세히 보기 →" |

전 메시지는 한국어. 사용자 표시는 Frontend의 `screens/import.md` (작성 예정).

---

## 8. 변경 이력 노트

- 본 문서는 신규 작성이다. 초안 = [Phase 4 tracking #3 (LLM)](https://github.com/gosu1/piecepool/issues/3) + [sub-issue #30](https://github.com/gosu1/piecepool/issues/30) 기반.
- §6.4에 `clarify_pending` 상태 신규 제안 — SSOT 변경 필요 ([entities.md ImportJobStatus](../10-contracts/entities.md#importjob)). 후속 `contracts-change` 이슈 분리 예정. → `contracts-change`로 enum 에 추가됨(2026-05-29).
- 2026-07-11 — §6 재작성. 파인만이 파이프라인의 clarify 분기에서 **에디터 도구**로 바뀌었다(진입점 3개 · 섹션 단위 · 판정은 사용자). **핵심 주제 게이트**(§6.3, Gemini 판별 + 사용자 파인만 판정) 신설. `clarify_pending` enum 값은 계약에 유지하되 코드에서 도달하지 않는다.
