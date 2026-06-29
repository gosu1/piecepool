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
| Premium 되묻기 round-trip | 본 문서 §6 |
| ImportJob 상태 전이 | `../20-backend/import-job-states.md` (작성 예정) |

---

## 2. 변환 단계

3 provider 모두 raw JSON → `LlmWikiResult` 정규화.

| Provider | raw 형식 | 정규화 단계 |
|---|---|---|
| Local (llama.cpp llama-server) | `{choices: [{message: {content: "..."}}]}` content가 JSON 문자열 (OpenAI 호환) | `JSON.parse(choices[0].message.content)` → `LlmWikiResult` |
| OpenAI | `{output_parsed: {...}}` 또는 Responses API output text | `output_parsed` 우선, 없으면 text parse |
| Gemini | `{candidates: [{content: {parts: [{text: "..."}]}}]}` text가 JSON 문자열 | `JSON.parse(text)` → `LlmWikiResult` |

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
| JSON 파싱 실패 (Local provider) | ✅ | 동일 (Local 모델 비결정성 활용) |
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

위반 정보 주입은 Local provider에서 효과 큼. Premium provider (strict mode)는 거의 발생 안 함.

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

## 6. Premium 되묻기 round-trip

[`pricing-model.md`](../00-overview/pricing-model.md) §3.3의 되묻기를 어댑터가 구현.

### 6.1 트리거 조건

1차 응답이 다음 중 1개 이상 만족 시 round-trip 진입:

| 조건 | 임계값 (기본) |
|---|---|
| `relations[].confidence` 평균 | < 0.5 |
| `concepts[]` 중 `summary.length` | < 20자인 경우 비율 ≥ 50% |
| `concepts[].title`이 너무 일반적 ("그것", "이론", "방법" 등) | 1개라도 등장 |
| Source 텍스트 길이 | < 100자 (입력 자체 부족 가능) |

임계값은 환경변수 또는 Backend `prompt-design.md` (작성 예정)에서 override 가능.

### 6.2 round-trip 흐름

```
1차 호출 → LlmWikiResult₁
  → 트리거 평가
    → trigger=false: §3 검증 → 저장
    → trigger=true:
      → 사용자에게 재확인 질문 생성 (LLM 또는 템플릿)
      → Frontend가 질문 UI 노출 + 사용자 응답 수집
      → 2차 호출 (input = 원본 + 사용자 응답)
        → LlmWikiResult₂
        → §3 검증 → 저장 (1차 결과는 폐기)
```

### 6.3 round-trip 제한

- round-trip은 **최대 1회**. 2차 응답도 트리거 조건 만족하면 그대로 저장 (무한 루프 방지)
- 사용자가 재확인 질문을 무시 (timeout 또는 명시 스킵) → 1차 결과 그대로 저장
- timeout 기본 5분 (TBD, [open-questions](../00-overview/open-questions.md))

### 6.4 ImportJob 상태

`ImportJobStatus` 확장 (`../10-contracts/entities.md`의 enum과 정렬 필요 — Backend tracking #1과 조율):

- `llm_processing` (1차 호출 중)
- `clarify_pending` (사용자 응답 대기, 신규)
- `llm_processing` (2차 호출 중)
- `writing` → `completed`

⚠️ 신규 `clarify_pending` 상태는 SSOT 변경 (entities.md) → `contracts-change` 라벨 + 4역할 review 필요.

---

## 7. 오류 분류 + 사용자 메시지

| 분류 | provider 응답 | 사용자 메시지 |
|---|---|---|
| `auth` | 401 / 403 | "API 키를 확인해주세요. 설정에서 재입력하세요." |
| `network` | timeout, DNS 실패 | "LLM 서버에 연결할 수 없습니다. 네트워크 또는 로컬 llama-server를 확인하세요." |
| `rate_limit` | 429 | "잠시 후 재시도하세요." |
| `schema` | JSON Schema 위반 (재시도 후) | "LLM 응답이 형식에 맞지 않습니다. 입력을 확인하거나 모델을 변경하세요." |
| `empty` | concepts=0 | "입력에서 추출할 개념을 찾지 못했습니다. 더 자세한 자료를 입력해주세요." |
| `partial` | 부분 실패 | "일부 관계가 누락됐습니다. 자세히 보기 →" |

전 메시지는 한국어. 사용자 표시는 Frontend의 `screens/import.md` (작성 예정).

---

## 8. 변경 이력 노트

- 본 문서는 신규 작성이다. 초안 = [Phase 4 tracking #3 (LLM)](https://github.com/gosu1/piecepool/issues/3) + [sub-issue #30](https://github.com/gosu1/piecepool/issues/30) 기반.
- §6.4에 `clarify_pending` 상태 신규 제안 — SSOT 변경 필요 ([entities.md ImportJobStatus](../10-contracts/entities.md#importjob)). 후속 `contracts-change` 이슈 분리 예정.
