# 30-llm

LLM 호출 계층. **3-provider hybrid** (Free=Local Ollama, Premium=OpenAI 또는 Gemini).

> **플랜 모델**: [`../00-overview/pricing-model.md`](../00-overview/pricing-model.md)

## 포함 문서 (작성 예정)

| 파일 | 내용 | 1차 소유 |
|---|---|---|
| `provider-config.md` | 3개 Adapter 인터페이스, 환경변수, fallback 정책 | LLM (@gosu1) |
| `prompt-templates.md` | system/user 프롬프트 (한국어 학습 컨텍스트) | **Backend 주도** (@ChangSik88, @O6west) + LLM 구조화 |
| `output-validation.md` | 구조화 출력 schema 검증 + 재시도 + 부분 실패 + 되묻기 round-trip | LLM (@gosu1) |
| `evals.md` | 골든 케이스, 회귀 방지, 3-provider 동일성 입증 | LLM (@gosu1) |
| `wiki-qa-agent.md` | 질의 계층 에이전트 + grounding guard + 에이전트 eval (**post-MVP 제안**) | LLM (@gosu1) |
| `qa-review-agent.md` | 저장 전 의미 검증: 환각/추측/경로 (**post-MVP 제안**) | LLM (@gosu1) |
| `skill-export.md` | vault → SKILL.md export, 외부 에이전트 질의 (**post-MVP 제안**) | LLM (@gosu1) |

## 소유권 분리 (중요)

- **Adapter / 호출 메커니즘 / schema 검증**: LLM (@gosu1)
- **프롬프트 설계 (도메인 지식, 한국어 학습 맥락, 되묻기 트리거 문구)**: **Backend** (@ChangSik88, @O6west). 인간이 직접 고민
- 두 영역이 만나는 지점은 `prompt-templates.md` — CODEOWNERS에서 공동 owner

## 환경변수 매트릭스

```bash
# 공통
PIECEPOOL_LLM_PROVIDER=local|openai|gemini   # 기본 local (Free)
PIECEPOOL_LLM_MODEL=...                      # provider별 기본값

# local (Ollama, Free)
PIECEPOOL_LOCAL_LLM_ENDPOINT=http://localhost:11434
PIECEPOOL_LOCAL_LLM_BACKEND=ollama           # MVP 기본

# openai (Premium 선택지)
OPENAI_API_KEY=...

# gemini (Premium 선택지)
GEMINI_API_KEY=...

# 공통 (Premium 기능 토글)
PIECEPOOL_PREMIUM_FACT_CHECK=true|false
PIECEPOOL_PREMIUM_CLARIFY=true|false
```

## Premium 흐름 (schema 무변경)

- **되묻기**: Backend가 import-pipeline에서 LLM 1차 응답 분석 → 불확실 판정 시 사용자에게 재질의
- **Fact-check**: LLM이 웹 검색 도구 호출 → `evidence[].reason`에 출처 URL 누적
- 둘 다 `LlmWikiResult` JSON Schema는 그대로 ([`../10-contracts/llm-output-schema.md#7-provider-무관성-보장-3-provider`](../10-contracts/llm-output-schema.md))

## 의존

- [`../10-contracts/llm-output-schema.md`](../10-contracts/) — provider 무관 출력 JSON Schema (SSOT)
- [`../10-contracts/entities.md`](../10-contracts/) — Concept/WikiPage/Relation 엔티티
- [`../00-overview/pricing-model.md`](../00-overview/) — 플랜·기능 매트릭스
- [`../20-backend/import-pipeline.md`](../20-backend/) (작성 예정) — 호출 흐름 / 되묻기 트리거

## 작성 일정

Phase 4. Tracking issue: [#3](https://github.com/gosu1/piecepool/issues/3)
