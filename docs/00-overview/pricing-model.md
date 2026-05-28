# Pricing Model (Freemium)

PiecePool 제품 모델. 모든 역할이 읽는다.

> **본 문서는 제품 모델 단일 출처**다. 기술 구현은 [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md), [`../30-llm/provider-config.md`](../30-llm/) 참조.

---

## 1. 두 플랜 요약

| 플랜 | LLM 호출 대상 | 한도 | 추가 기능 |
|---|---|---|---|
| **Free** | Local LLM (Ollama 기본) | 무제한 | 핵심 기능 모두 (Workspace, archive, wiki 생성, Graph View) |
| **Premium** | 외부 API: Gemini **또는** GPT (사용자 선택) | API 비용·rate에 따름 | 되묻기 + fact-check + 웹 검색 기반 비교 + Wiki 강화 |

---

## 2. Free 플랜

### 2.1 LLM
- 로컬 모델 (Ollama 기본). 사용자 머신에서 추론
- 환경변수 `PIECEPOOL_LLM_PROVIDER=local`
- 인터넷 미연결 환경에서도 동작
- 추론 속도/품질은 사용자 머신 성능에 의존

### 2.2 핵심 기능 (Free에서 동일 제공)
- 단일 로컬 Workspace
- Inbox → archive → wiki 흐름
- Markdown 편집
- Concept 추출, WikiPage 생성, Relation 매핑
- Graph View (타입 있는 지식 그래프)
- PDF 텍스트 추출
- 모든 데이터 타입 → 텍스트 변환 (OCR 포함, MVP 범위)

### 2.3 한도
- LLM 호출 횟수 제한 없음
- Workspace 크기 제한 없음
- 본인 머신 자원만 제한 요소

---

## 3. Premium 플랜

### 3.1 LLM
- 외부 API. 사용자가 둘 중 선택:
  - **Gemini** (Google)
  - **GPT** (OpenAI)
- 환경변수 `PIECEPOOL_LLM_PROVIDER=gemini|openai`
- API 키는 사용자 본인이 발급/관리 또는 PiecePool 구독 (정책은 별도 결정)

### 3.2 Free 대비 강화 기능

| 기능 | 설명 |
|---|---|
| **정밀 정리** | Gemini/GPT가 더 풍부한 explanation, 예시, 구조 생성 |
| **되묻기 (Claude식)** | 입력 데이터가 불확실하거나 모호하면 사용자에게 재확인 질문 던짐. "이 개념을 X로 해석했는데 맞나요?" |
| **Fact-check** | 웹 검색으로 사용자 데이터 vs 실제 출처 비교 |
| **Suggest** | Fact-check 결과 차이가 있으면 수정안 제안 (자동 적용 X, 사용자 승인 필요) |
| **LLM Wiki 강화** | 위 메커니즘 종합으로 Wiki 정확도/완결성 향상 |

### 3.3 되묻기 트리거 기준 (Backend 설계 책임)
- 입력 텍스트가 너무 짧음/불명확
- 추출된 Concept이 너무 일반적 (예: "그것", "이론")
- Relation의 `confidence` < 임계값
- Source 간 모순 감지

자세한 기준: `../20-backend/import-pipeline.md` (작성 예정)

### 3.4 Fact-check 흐름
```text
사용자 데이터 → LLM 1차 정리
                ↓
        웹 검색 (Gemini/GPT 도구 호출)
                ↓
        실제 데이터와 비교
                ↓
        차이 발견 → suggest 패널로 사용자에게 노출
                ↓
        사용자 승인 → WikiPage 업데이트
```

`evidence` 필드에 fact-check 결과 출처 URL을 누적한다 ([entities.md#evidence](../10-contracts/entities.md#evidence)).

---

## 4. 데이터 흐름 차이

| 단계 | Free | Premium |
|---|---|---|
| Inbox → archive | 동일 | 동일 |
| 1차 Concept/Wiki 생성 | Local LLM | Gemini/GPT |
| 되묻기 | ❌ | ✅ |
| Fact-check | ❌ | ✅ |
| Wiki 저장 | 1차 결과 | 되묻기/fact-check 반영 결과 |

---

## 5. Provider 인터페이스 통일

3 provider 모두 동일한 `LlmWikiResult` JSON Schema로 정규화된다. Provider별 raw 응답은 adapter가 변환.

**SSOT**: [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md)
**Adapter 설계**: `../30-llm/provider-config.md` (작성 예정)

---

## 6. 환경변수 매트릭스

```bash
# 공통
PIECEPOOL_LLM_PROVIDER=local|openai|gemini   # 기본 local (Free)
PIECEPOOL_LLM_MODEL=...                      # provider별 기본값

# local (Ollama)
PIECEPOOL_LOCAL_LLM_ENDPOINT=http://localhost:11434
PIECEPOOL_LOCAL_LLM_BACKEND=ollama           # MVP 기본

# openai (Premium)
OPENAI_API_KEY=...

# gemini (Premium)
GEMINI_API_KEY=...

# 공통 (Premium 기능)
PIECEPOOL_PREMIUM_FACT_CHECK=true|false      # 기본 true (Premium일 때)
PIECEPOOL_PREMIUM_CLARIFY=true|false         # 되묻기, 기본 true
```

---

## 7. MVP 범위

| 항목 | MVP | MVP+1 이후 |
|---|---|---|
| Free 플랜 (Local LLM) | ✅ | — |
| Premium 플랜 토글 | ✅ (provider 전환 작동) | — |
| 정밀 정리 (Premium) | ✅ | — |
| **되묻기 (Premium)** | ✅ | — |
| **Fact-check (Premium)** | ⏸ 기본 흐름만, 정밀화는 후속 | 정밀화 |
| 결제/구독 시스템 | ⛔ | ✅ |
| API 키 관리 UI | 환경변수만 | 키 보관 UI |

결제/구독은 MVP 범위 외. MVP에서는 환경변수로 provider 전환만 작동시킨다.

---

## 8. 역할 책임 매트릭스

| 영역 | 소유 |
|---|---|
| Provider adapter (3종) | LLM (@gosu1) |
| 프롬프트 설계 (Free/Premium 모두) | Backend (주도) + LLM (구조화) |
| 되묻기 트리거 로직 | Backend |
| Fact-check 통합 | Backend (호출) + LLM (도구 호출 schema) |
| Premium 토글 UI | Frontend |
| 결제 UI (MVP+1) | Frontend + Backend |

---

## 9. 변경 이력 노트

- 본 문서는 사용자(서준)가 명시한 freemium 모델을 신규로 추가한 결과다.
- `docs/archive/PRD-v1.md`에는 freemium 정보가 없다. 본 문서가 1차 정의다.
- 향후 변경은 PO/Tech Lead (@gosu1) 승인이 필요하다.
