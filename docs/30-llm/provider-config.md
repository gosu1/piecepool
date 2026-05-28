# Provider Config

PiecePool LLM **3-provider hybrid** 어댑터 인터페이스 / 환경변수 / fallback 정책.

> SSOT: [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md). 본 문서는 어댑터 계층(provider별 호출)만 정의하며 출력 schema는 SSOT를 그대로 따른다.
> 플랜 모델: [`../00-overview/pricing-model.md`](../00-overview/pricing-model.md).

---

## 1. 어댑터 인터페이스

provider 무관 호출 진입점. Backend (`20-backend/import-pipeline.md`)가 본 인터페이스를 통해 LLM에 접근한다.

```ts
interface LlmProvider {
  id: "local" | "openai" | "gemini";
  generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult>;
}

interface LlmWikiInput {
  sourceTitle: string;
  sourceText: string;
  sourceFiles?: Array<{ id: string; file: string; type: "pdf" | "image" }>;
  subjects: Array<{ id: string; name: string }>;
  existingConcepts: Array<{ id: string; title: string; normalizedTitle: string }>;
  premium?: {
    clarify: boolean;     // 되묻기 활성
    factCheck: boolean;   // fact-check 활성
  };
}
```

- `LlmWikiResult` 타입 정의는 [`llm-output-schema.md`](../10-contracts/llm-output-schema.md) SSOT 참조 (본 문서는 복붙 X)
- premium flag는 Free 호출에서 무시
- adapter는 raw 응답 → `LlmWikiResult` 변환 + JSON Schema 검증까지 책임 ([output-validation.md](output-validation.md) 작성 예정)

---

## 2. 환경변수 매트릭스

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PIECEPOOL_LLM_PROVIDER` | `local` | `local` \| `openai` \| `gemini` |
| `PIECEPOOL_LLM_MODEL` | provider별 기본값 (§3) | 모델명 override |
| `PIECEPOOL_LOCAL_LLM_ENDPOINT` | `http://localhost:11434` | local일 때 Ollama endpoint |
| `PIECEPOOL_LOCAL_LLM_BACKEND` | `ollama` | local backend (MVP=Ollama 고정) |
| `OPENAI_API_KEY` | (필수) | provider=openai일 때 |
| `GEMINI_API_KEY` | (필수) | provider=gemini일 때 |
| `PIECEPOOL_PREMIUM_FACT_CHECK` | `true` | Premium 시 fact-check 토글 |
| `PIECEPOOL_PREMIUM_CLARIFY` | `true` | Premium 시 되묻기 토글 |
| `PIECEPOOL_LLM_TIMEOUT_MS` | `60000` | 호출 timeout |
| `PIECEPOOL_LLM_MAX_RETRIES` | `2` | 재시도 횟수 |

### 2.1 provider 선택 로직

```
provider = PIECEPOOL_LLM_PROVIDER || "local"

if provider == "openai" and OPENAI_API_KEY is empty
  → 오류: "Premium=openai requires OPENAI_API_KEY"

if provider == "gemini" and GEMINI_API_KEY is empty
  → 오류: "Premium=gemini requires GEMINI_API_KEY"

if provider == "local"
  health-check: GET PIECEPOOL_LOCAL_LLM_ENDPOINT/api/tags
  실패 시 오류: "Ollama not reachable at <endpoint>"
```

플랜 결정은 provider 단독 (Free=local / Premium=openai|gemini). 별도 `plan` 환경변수 없음.

---

## 3. Provider별 구현 노트

### 3.1 Local (Ollama)

- **MVP 기본 backend**. MLX / llama.cpp는 후속 ([post-mvp §9.1](../70-roadmap/post-mvp.md))
- 기본 모델: `llama3.1:8b` (TBD, [open-questions](../00-overview/open-questions.md))
- 호출: `POST <endpoint>/api/chat`
- structured output: `format: "json"` 파라미터 + system prompt에 JSON Schema 명시
- adapter 책임:
  - 응답 본문이 JSON Schema 통과하는지 검증 (Local 모델은 schema 위반 가능성 ↑)
  - 위반 시 재시도 (max `PIECEPOOL_LLM_MAX_RETRIES`)
  - 재시도 실패 시 부분 결과 보존 + 오류 보고 ([output-validation.md](output-validation.md))

### 3.2 OpenAI (Premium)

- 기본 모델: `gpt-5-mini` (TBD)
- 호출: **Responses API** (Chat Completions 아님)
- structured output: `response_format: { type: "json_schema", json_schema: { strict: true, schema: ... } }`
- schema strict=true로 SDK 차원에서 schema 위반 차단
- adapter 책임:
  - `response_format`에 `LlmWikiResult` JSON Schema 주입
  - Premium fact-check: tool use로 `web_search` 등 호출 (OpenAI tool support 활용)
  - 되묻기: 1차 응답 분석 → confidence 임계값 미달 시 별도 round-trip ([output-validation.md](output-validation.md))

### 3.3 Gemini (Premium)

- 기본 모델: `gemini-2.5-pro` (TBD)
- 호출: Generative Language API `models.generateContent`
- structured output: `generationConfig.responseSchema` 파라미터에 JSON Schema 주입
- adapter 책임:
  - schema 주입 + 응답 본문 JSON 파싱
  - Premium fact-check: Google Search Grounding 활용 (`tools: [{ googleSearch: {} }]`)
  - 되묻기: OpenAI와 동일 흐름 (1차 응답 분석 → 임계값 → round-trip)

### 3.4 schema 동일성 보장

3 provider 모두 동일 `LlmWikiResult` 통과. provider별 raw → SSOT 정규화는 adapter 내부. 검증:
- 동일 입력 → 3 provider 결과의 `concepts[].title` 동등 입증
- 매트릭스 테스트는 [`evals.md`](evals.md)

---

## 4. Fallback 정책 (MVP)

**기본: fallback 없음**. 호출 실패는 사용자에게 명시 + 재시도 버튼.

### 4.1 재시도 (provider 내부)

| 조건 | 동작 |
|---|---|
| network timeout | `PIECEPOOL_LLM_MAX_RETRIES` 만큼 재시도 (지수 backoff) |
| JSON Schema 위반 (Local) | 같은 입력 재시도 (max retries) |
| 401 / 403 | 재시도 X (사용자 인증 문제) |
| 429 rate limit | 응답 헤더 `Retry-After` 존중, 1회만 |

### 4.2 provider 전환 (MVP 외)

- Premium → Free 자동 fallback **금지**. 사용자가 명시 전환만 허용
  - 이유: Premium 호출 비용/품질이 Free와 다름. 무단 강등 시 결과 차이 혼란
- Premium 간 fallback (openai → gemini) **MVP 외**. 후속 검토

### 4.3 오류 메시지 표준

```
[provider=<id>] <단계>: <원인>
예시:
  [provider=openai] auth: OPENAI_API_KEY missing
  [provider=local]  network: Ollama not reachable at http://localhost:11434
  [provider=gemini] schema: response field 'concepts' missing
```

전 메시지는 Frontend가 사용자에게 표시 + ImportJob.errorMessage에 기록.

---

## 5. 호출 흐름 (요약)

```
Backend import-pipeline
  → resolve provider from env (§2.1)
  → create LlmProvider instance
  → generateWikiStructured(input)
    → provider-specific HTTP call (§3)
    → raw response → LlmWikiResult 변환
    → JSON Schema 검증 (SSOT)
    → schema 위반 시 재시도 (§4.1)
  → return LlmWikiResult to Backend
```

자세한 단계별 처리: [`output-validation.md`](output-validation.md) (작성 예정), [`../20-backend/import-pipeline.md`](../20-backend/) (작성 예정).

---

## 6. Premium 전용 흐름 (schema 무변경)

본 어댑터 계층은 Premium 기능이 활성화돼도 `LlmWikiResult` schema를 확장하지 않는다.

| Premium 기능 | 어댑터 동작 |
|---|---|
| **되묻기** | 1차 응답의 `relations[].confidence` 평균이 임계값(TBD, [open-questions](../00-overview/open-questions.md#2-llm--provider))보다 낮으면 별도 round-trip. 사용자 응답 받아 2차 호출 |
| **fact-check** | OpenAI: tool use로 web search. Gemini: googleSearch grounding. 결과 URL을 `evidence[].reason`에 누적 |
| **suggest** | fact-check 결과 차이는 Frontend 패널에 표시 (어댑터는 변환만, UI 책임 X) |

Premium 트리거 기준 (되묻기 임계값, fact-check 발동 조건)은 **Backend 책임** ([`../20-backend/prompt-design.md`](../20-backend/) 작성 예정). 어댑터는 Backend가 명시한 파라미터 그대로 따른다.

---

## 7. 확장 지점 (후속)

| 항목 | 위치 |
|---|---|
| MLX backend | 본 문서 §3.1을 별도 backend로 분리. 어댑터 인터페이스 동일 |
| llama.cpp backend | 같음 |
| Anthropic Claude provider | 본 문서 §3에 §3.4 신규 절 추가. `LlmProvider.id` 확장 |
| 모델 라우팅 (작은 입력 → 작은 모델) | adapter 내부에서 model 선택. 인터페이스 무변경 |

세부 우선순위: [`../70-roadmap/post-mvp.md`](../70-roadmap/post-mvp.md) §9.

---

## 8. 변경 이력 노트

- 본 문서는 신규 작성이다. 초안 = [Phase 4 tracking #3 (LLM)](https://github.com/gosu1/piecepool/issues/3) + [sub-issue #29](https://github.com/gosu1/piecepool/issues/29) 기반.
- 3-provider hybrid 결정 (서준, 2026-05-28)을 반영.
- SSOT `LlmWikiResult` 타입은 [llm-output-schema.md](../10-contracts/llm-output-schema.md)만 정의. 본 문서는 어댑터 interface만 정의 (SSOT 위반 아님).
