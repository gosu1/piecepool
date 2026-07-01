# Product Model

PiecePool 제품 모델. 모든 역할이 읽는다. **단일 tier — OpenAI(LLM) + Liner(출처 검색)**.

> **본 문서는 제품 모델 단일 출처**다. 기술 구현은 [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md), [`../30-llm/provider-config.md`](../30-llm/provider-config.md) 참조.

---

## 1. 개요

PiecePool은 **OpenAI**(GPT)를 LLM provider로, **Liner API**를 출처 기반 검색 provider로 사용한다. 단일 tier다.

| 항목 | 내용 |
|---|---|
| **LLM** | OpenAI GPT (`OPENAI_API_KEY` 필요) |
| **출처 검색** | Liner API (`LINER_API_KEY` 필요) — feature 3(정보 간극 메우기·fact-check) 출처 기반 검색 |
| **핵심 기능** | Workspace, archive, wiki 생성, Graph View |
| **LLM 강화 기능** | 되묻기 + fact-check + 웹 검색 기반 비교 + Wiki 강화 |
| **한도** | OpenAI·Liner API 비용·rate에 따름 |

API 키는 사용자 본인이 발급/관리하거나 PiecePool 구독으로 제공 (정책은 별도 결정).

---

## 2. 핵심 기능

- 단일 로컬 Workspace
- Inbox → archive → wiki 흐름
- Markdown 편집
- Concept 추출, WikiPage 생성, Relation 매핑
- Graph View (타입 있는 지식 그래프)
- PDF 텍스트 추출
- 모든 데이터 타입 → 텍스트 변환 (OCR 포함, MVP 범위)

---

## 3. LLM 강화 기능

| 기능 | 설명 |
|---|---|
| **정밀 정리** | GPT가 풍부한 explanation, 예시, 구조 생성 |
| **되묻기 (Claude식)** | 입력이 불확실/모호하면 사용자에게 재확인 질문. "이 개념을 X로 해석했는데 맞나요?" |
| **Fact-check** | Liner 출처 검색으로 사용자 데이터 vs 실제 출처 비교 (feature 3) |
| **Suggest** | Fact-check 결과 차이가 있으면 수정안 제안 (자동 적용 X, 사용자 승인 필요) |
| **LLM Wiki 강화** | 위 메커니즘 종합으로 Wiki 정확도/완결성 향상 |

### 3.1 되묻기 트리거 기준 (Backend 설계 책임)
- 입력 텍스트가 너무 짧음/불명확
- 추출된 Concept이 너무 일반적 (예: "그것", "이론")
- Relation의 `confidence` < 임계값
- Source 간 모순 감지

자세한 기준: `../20-backend/import-pipeline.md` (작성 예정)

### 3.2 Fact-check 흐름
```text
사용자 데이터 → LLM 1차 정리
                ↓
        출처 검색 (Liner API)
                ↓
        실제 데이터와 비교
                ↓
        차이 발견 → suggest 패널로 사용자에게 노출
                ↓
        사용자 승인 → WikiPage 업데이트
```

`evidence` 필드에 fact-check 결과 출처 URL을 누적한다 ([entities.md#evidence](../10-contracts/entities.md#evidence)).

---

## 4. 데이터 흐름

| 단계 | 처리 |
|---|---|
| Inbox → archive | 원문 저장 |
| 1차 Concept/Wiki 생성 | OpenAI |
| 되묻기 | clarify 활성 시 |
| Fact-check | Liner, 활성 시 |
| Wiki 저장 | 되묻기/fact-check 반영 결과 |

---

## 5. Provider 인터페이스

OpenAI raw 응답은 adapter가 `LlmWikiResult` JSON Schema로 정규화한다.

**SSOT**: [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md)
**Adapter 설계**: [`../30-llm/provider-config.md`](../30-llm/provider-config.md)

---

## 6. 환경변수

```bash
OPENAI_API_KEY=...                            # (필수) OpenAI 호출 키
LINER_API_KEY=...                             # (필수) Liner 출처 검색 API 키 (feature 3·fact-check)
LINER_API_ENDPOINT=...                        # (선택) Liner API 엔드포인트 override
PIECEPOOL_LLM_MODEL=...                        # 모델명 override (provider-config.md §3 기본값)

# LLM 기능 토글 (유료 tier 아님 — 레거시 이름의 기본 on 토글)
PIECEPOOL_PREMIUM_FACT_CHECK=true|false        # fact-check, 기본 true
PIECEPOOL_PREMIUM_CLARIFY=true|false           # 되묻기, 기본 true
```

전체 매트릭스: [`../30-llm/provider-config.md`](../30-llm/provider-config.md) §2.

---

## 7. MVP 범위

| 항목 | MVP | MVP+1 이후 |
|---|---|---|
| OpenAI LLM 호출 | ✅ | — |
| Liner 출처 검색 호출 | ✅ | — |
| 정밀 정리 | ✅ | — |
| **되묻기** | ✅ | — |
| **Fact-check** | ⏸ 기본 흐름만, 정밀화는 후속 | 정밀화 |
| 결제/구독 시스템 | ⛔ | ✅ |
| API 키 관리 UI | 환경변수만 | 키 보관 UI |

결제/구독은 MVP 범위 외. MVP는 `OPENAI_API_KEY` 환경변수로 동작한다.

---

## 8. 역할 책임 매트릭스

| 영역 | 소유 |
|---|---|
| OpenAI adapter | LLM (@gosu1) |
| 프롬프트 설계 | Backend (주도) + LLM (구조화) |
| 되묻기 트리거 로직 | Backend |
| Fact-check 통합 | Backend (호출) + LLM (도구 호출 schema) |
| 결제 UI (MVP+1) | Frontend + Backend |

---

## 9. 변경 이력 노트

- 본 문서는 PiecePool 제품 모델(provider·tier·환경변수)의 단일 출처다.
- `docs/archive/PRD-v1.md`에는 provider·tier 정보가 없다. 본 문서가 1차 정의다.
- **2026-06-30**: 단일 tier 확정 — LLM은 OpenAI, feature 3(정보 간극 메우기·fact-check) 출처 검색은 Liner API. 기존 "Premium 기능"은 기본 기능으로 통합.
- 향후 변경은 PO/Tech Lead (@gosu1) 승인이 필요하다.
