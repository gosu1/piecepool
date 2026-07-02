# Provider Config

PiecePool 어댑터 인터페이스 / 환경변수 / fallback 정책. LLM은 **OpenAI 단일 provider**, feature 3 출처 검색·검증은 **Liner API**.

> SSOT: [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md). 본 문서는 어댑터 계층(provider별 호출)만 정의하며 출력 schema는 SSOT를 그대로 따른다.
> 플랜 모델: [`../00-overview/pricing-model.md`](../00-overview/pricing-model.md).

---

## 1. 어댑터 인터페이스

provider 무관 호출 진입점. Backend (`20-backend/import-pipeline.md`)가 본 인터페이스를 통해 LLM에 접근한다.

```ts
interface LlmProvider {
  id: "openai";
  generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult>;
}

interface LlmWikiInput {
  sourceTitle: string;
  sourceText: string;
  sourceFiles?: Array<{ id: string; file: string; type: "pdf" | "image" }>;
  subjects: Array<{ id: string; name: string }>;
  existingConcepts: Array<{ id: string; title: string; normalizedTitle: string }>;
  features?: {
    clarify: boolean;     // 되묻기 활성
    factCheck: boolean;   // fact-check 활성
  };
}
```

- `LlmWikiResult` 타입 정의는 [`llm-output-schema.md`](../10-contracts/llm-output-schema.md) SSOT 참조 (본 문서는 복붙 X)
- adapter는 raw 응답 → `LlmWikiResult` 변환 + JSON Schema 검증까지 책임 (`output-validation.md` (작성 예정) 작성 예정)
- feature 3(정보 간극 메우기)·fact-check의 출처 검색은 별도 **Liner 어댑터**가 담당(§3.3). LLM 어댑터와 분리한다.

---

## 2. 환경변수 매트릭스

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PIECEPOOL_LLM_MODEL` | 기본값 (§3) | 모델명 override |
| `OPENAI_API_KEY` | (필수) | OpenAI 호출 키 (LLM) |
| `LINER_API_KEY` | (feature 3 필수) | Liner 출처 검색·검증 키 |
| `LINER_API_ENDPOINT` | 기본 endpoint | Liner API endpoint override |
| `PIECEPOOL_FACT_CHECK` | `true` | fact-check 토글 (유료 tier 아님 · 기본 on) |
| `PIECEPOOL_LLM_TIMEOUT_MS` | `60000` | 호출 timeout |
| `PIECEPOOL_LLM_MAX_RETRIES` | `2` | 재시도 횟수 |

### 2.1 키 검증 로직

```
if OPENAI_API_KEY is empty
  → 오류: "OpenAI requires OPENAI_API_KEY"
if feature 3 활성 && LINER_API_KEY is empty
  → 오류: "Liner requires LINER_API_KEY"
```

---

## 3. Provider 구현 노트

### 3.1 OpenAI

- 기본 모델: `gpt-5-mini` (TBD)
- 호출: **Responses API** (Chat Completions 아님)
- structured output: `response_format: { type: "json_schema", json_schema: { strict: true, schema: ... } }`
- schema strict=true로 SDK 차원에서 schema 위반 차단
- adapter 책임:
  - `response_format`에 `LlmWikiResult` JSON Schema 주입
  - fact-check(대안): tool use로 `web_search` 등 호출 — 주 경로는 Liner 어댑터(§3.3)
  - 되묻기: 1차 응답 분석 → confidence 임계값 미달 시 별도 round-trip (`output-validation.md` (작성 예정))

### 3.2 schema 정규화

adapter는 OpenAI raw 응답을 SSOT `LlmWikiResult`로 정규화한다. 검증:
- 응답이 `LlmWikiResult` JSON Schema 통과
- 케이스 테스트는 `evals.md` (작성 예정)

### 3.3 Liner

- 역할: feature 3(정보 간극 메우기)·fact-check의 출처 검색·검증·provenance. LLM 아님(위키 생성 X).
- 키: `LINER_API_KEY` (필수), endpoint: `LINER_API_ENDPOINT` (override 가능)
- 모드: source-based search API — 권위 있는 출처를 검색해 정답 기준(label)을 세우고 사용자 필기 간극을 검증
- adapter 책임:
  - 사용자 필기·label(교수 자료)을 질의로 출처 검색
  - 검증 결과(출처 URL·인용)를 `evidence[].reason`에 누적 (schema 무변경)
  - Liner 미가용 시 OpenAI 되묻기(§6)로 대안 처리

---

## 4. Fallback 정책 (MVP)

**기본: fallback 없음**. 호출 실패는 사용자에게 명시 + 재시도 버튼.

### 4.1 재시도 (provider 내부)

| 조건 | 동작 |
|---|---|
| network timeout | `PIECEPOOL_LLM_MAX_RETRIES` 만큼 재시도 (지수 backoff) |
| JSON Schema 위반 | 같은 입력 재시도 (max retries) |
| 401 / 403 | 재시도 X (사용자 인증 문제) |
| 429 rate limit | 응답 헤더 `Retry-After` 존중, 1회만 |

### 4.2 오류 메시지 표준

```
[provider=openai] <단계>: <원인>
예시:
  [provider=openai] auth: OPENAI_API_KEY missing
  [provider=openai] schema: response field 'concepts' missing
```

전 메시지는 Frontend가 사용자에게 표시 + ImportJob.errorMessage에 기록.

---

## 5. 호출 흐름 (요약)

```
Backend import-pipeline
  → validate OPENAI_API_KEY (§2.1)
  → create LlmProvider instance
  → generateWikiStructured(input)
    → OpenAI HTTP call (§3)
    → raw response → LlmWikiResult 변환
    → JSON Schema 검증 (SSOT)
    → schema 위반 시 재시도 (§4.1)
  → return LlmWikiResult to Backend
```

자세한 단계별 처리: `output-validation.md` (작성 예정), [`../20-backend/`](../20-backend/) (해당 폴더 README에서 import-pipeline 작성 예정).

---

## 6. 부가 흐름 (schema 무변경)

본 어댑터 계층은 아래 기능이 활성화돼도 `LlmWikiResult` schema를 확장하지 않는다.

| 기능 | 어댑터 동작 |
|---|---|
| **되묻기** | **주: Liner 출처 검증으로 간극 판정.** 대안(Liner 미가용): 1차 응답의 `relations[].confidence` 평균이 임계값(TBD, [open-questions](../00-overview/open-questions.md#2-llm--provider))보다 낮으면 OpenAI 별도 round-trip. 사용자 응답 받아 2차 호출 |
| **fact-check** | **주: Liner API 출처 검색·검증.** 결과 URL을 `evidence[].reason`에 누적 (대안: OpenAI web_search tool) |
| **suggest** | fact-check 결과 차이는 Frontend 패널에 표시 (어댑터는 변환만, UI 책임 X) |

트리거 기준 (되묻기 임계값, fact-check 발동 조건)은 **Backend 책임** ([`../20-backend/prompt-design.md`](../20-backend/) 작성 예정). 어댑터는 Backend가 명시한 파라미터 그대로 따른다.

---

## 7. 확장 지점 (후속)

| 항목 | 위치 |
|---|---|
| Anthropic Claude provider | 본 문서 §3에 신규 절 추가. `LlmProvider.id` 확장 |
| 모델 라우팅 (작은 입력 → 작은 모델) | adapter 내부에서 model 선택. 인터페이스 무변경 |

세부 우선순위: [`../70-roadmap/post-mvp.md`](../70-roadmap/post-mvp.md) §9.

---

## 8. 변경 이력 노트

- 본 문서는 신규 작성이다. 초안 = [Phase 4 tracking #3 (LLM)](https://github.com/gosu1/piecepool/issues/3) + [sub-issue #29](https://github.com/gosu1/piecepool/issues/29) 기반.
- OpenAI 단일 LLM provider + Liner 출처 검색(feature 3) 결정을 반영.
- SSOT `LlmWikiResult` 타입은 [llm-output-schema.md](../10-contracts/llm-output-schema.md)만 정의. 본 문서는 어댑터 interface만 정의 (SSOT 위반 아님).
