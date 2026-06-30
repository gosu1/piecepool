# 30-llm

LLM 호출 계층. **3-provider hybrid** (Free=Local llama.cpp llama-server (Gemma 4 E4B), Premium=OpenAI 또는 Gemini).

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

# Information Segmentation Criteria

> Piecepool이 흩어진 정보를 어떤 기준으로 잘라(segmentation) 그래프 노드로 올릴지(promotion) 정의하는 설계 문서.

## 0. 두 개의 질문 분리

"정보를 나누는 기준"은 사실 두 개의 다른 문제다. 이 둘을 섞으면 파이프라인이 어디서 망가지는지 추적이 안 된다.

1. **Segmentation (분할)** — 원문을 어디서 자를 것인가. *Chunking 문제.*
2. **Promotion (승격)** — 자른 조각 중 무엇을 그래프 노드로 올릴 것인가. *품질 필터 문제.*

일반 RAG 파이프라인은 1번만 하고 끝낸다. Piecepool은 knowledge graph가 목표이므로 2번이 핵심 차별점이다.

아래 다섯 축(A~E)이 이 두 질문을 함께 책임진다.

---

## A. 원자성 (Atomicity) — 분할 단위

Zettelkasten / Obsidian 철학: **하나의 조각 = 하나의 완결된 아이디어.**

판단 기준 3가지:

| 기준 | 질문 |
|------|------|
| **자기완결성** (self-contained) | 앞뒤 맥락 없이 이 조각만 보고 이해되는가? |
| **재사용성** (reusable) | 다른 주제·문서에서도 인용될 수 있는 단위인가? |
| **단일성** (single-idea) | "그리고/또한"으로 두 개념이 억지로 묶여 있지 않은가? |

⚠️ 너무 잘게 쪼개면 trivial 노드가 폭발하고, 너무 크면 링크가 안 걸린다. → B~E가 보정 장치.

---

## B. 정보 유형 (Node Type) — 타입 분리

조각을 종류로 나누면 그래프에 색/필터/관계 규칙을 부여할 수 있다.

- `Concept` — 정의·개념
- `Fact` — 사실·데이터
- `Claim` — 주장·논증
- `Example` — 예시·사례
- `Method` — 방법·절차
- `Question` — 미해결 질문

**타입이 관계 종류를 제약한다:**

- `Claim` —(근거)→ `Fact`
- `Concept` —(상위/하위)→ `Concept`
- `Example` —(예시)→ `Concept` / `Claim`

타입 제약이 있어야 그래프가 단순 연결망이 아니라 *의미*를 갖는다.

---

## C. 의미적 경계 (Semantic Boundary) — 어디서 자를지

고정 길이 chunking ❌ → **Semantic chunking** ✅

```
1. 인접 문장들을 embedding
2. 연속 문장 간 cosine similarity 계산
3. 유사도가 급락(drop)하는 지점을 경계로 설정
```

Topic segmentation과 본질적으로 같은 접근. embedding 기반 의미 검색 자산을 그대로 재사용 가능.

---

## D. 출처·신뢰성 (Source & Provenance) — Liner 강점 활용

Liner의 source-based search가 여기서 무기가 된다.

- **병합 (merge):** 같은 사실을 여러 출처가 뒷받침하면 한 노드로 병합
- **메타데이터:** 출처를 노드 속성으로 부착 (1차/2차 자료 구분, 신뢰도 점수)
- **추적성:** "이 연결의 근거가 무엇인가"를 그래프가 추적 가능

→ 일반 노트앱과의 결정적 차별점. provenance를 1급 시민으로 다룬다.

---

## E. 연결성 (Connectivity) — 그래프 품질 게이트

Promotion 단계의 실질 기준. 두 anti-pattern을 잡는다.

| Anti-pattern | 증상 | 조치 |
|--------------|------|------|
| **고립 노드** (isolated) | 어떤 조각과도 연결 안 됨 → 너무 특수하거나 noise | 강등(demote) / 폐기 |
| **과연결 노드** (over-connected) | "AI"처럼 거의 모든 것과 연결 → 너무 일반적 | 분할 또는 태그로 격하 |

---

## Pipeline 요약

```
원문
 └─[C] semantic chunking ──→ 조각 후보
        └─[A] 원자성 검사 ──→ 정제된 조각
               └─[B] 타입 분류
                      └─[D] 출처 병합·메타데이터
                             └─[E] 연결성 게이트 ──→ 그래프 노드
```

---

## MVP 우선순위

한꺼번에 다 넣으면 디버깅이 불가능하다. 최소 루프부터.

- **Phase 1 (최소 루프):** `A` 원자성 + `C` semantic chunking 으로 조각 생성 → `E` 연결성으로 필터
- **Phase 2:** `B` 타입 분류 추가 (그래프 형성 후 얹기)
- **Phase 3:** `D` 출처 병합·provenance (Liner API 강점 본격 활용)

> 그래프가 한 번 만들어진 다음 B·D를 얹어야 어디서 망가지는지 추적이 쉽다.

---

## Open Questions

- [ ] 원자성 검사를 LLM 판단에 맡길지, heuristic(문장 수·접속사 카운트)로 1차 필터할지
- [ ] semantic chunking의 similarity drop threshold를 고정값으로 둘지, 문서별 적응형으로 둘지
- [ ] 고립 노드를 즉시 폐기할지, "관찰 보류(staging)" 상태로 둘지
- [ ] 과연결 노드 판정의 degree 임계값
