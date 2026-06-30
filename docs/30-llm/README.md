# 30-llm

LLM 호출 계층. **3-provider hybrid** (Free=Local llama.cpp llama-server (Gemma 4 E4B), Premium=OpenAI 또는 Gemini).

> **플랜 모델**: [`../00-overview/pricing-model.md`](../00-overview/pricing-model.md)

## LLM이 하는 일 3가지 (핵심 특징)

1. **LLM Wiki 생성** — 사용자 원본 노트(`archive/`)를 입력으로 Concept 중심 `WikiPage`를 생성한다. 출력은 `LlmWikiResult` 스키마([`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md))를 따른다.
2. **Graph View 데이터** — LLM이 타입 있는 `Relation`(엣지)을 산출한다([`../10-contracts/relation-types.md`](../10-contracts/relation-types.md)의 12종 enum). 그래프 렌더는 프론트(`40-frontend`)가 담당.
3. **정보 간극 메우기 (label ↔ user)** — 교수 자료(정답=label)와 사용자 필기 간 간극을 검증하고 사용자에게 선택지를 제시한다.

### 3. 정보 간극 메우기 상세

교수님 PDF = 정답(**label**). 사용자 필기에는 오기·오해가 섞일 수 있고, 여기서 정보 간극이 발생한다. LLM이 간극을 캐치·검증한 뒤:

- 최대 **1~3개** 선택지로 _"이렇게 생각하신 게 맞나요?"_ 가이드 제공
- **기타** 칸 1개 추가 — 사용자가 직접 서술 (소크라테스식 · 하브루타식 학습법, Claude Plan 스킬과 동형)

> 구현은 아래 **되묻기**(clarify) round-trip 활용. 현재 Premium 기능으로 게이트 (Free=local은 `clarify_pending` 미발생). `LlmWikiResult` JSON Schema는 무변경.

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

# local (llama.cpp llama-server — Gemma 4 E4B, Free)
PIECEPOOL_LOCAL_LLM_ENDPOINT=http://localhost:8080
PIECEPOOL_LOCAL_LLM_BACKEND=llama-server     # MVP 기본

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
