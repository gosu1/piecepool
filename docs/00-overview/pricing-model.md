# Product Model

PiecePool 제품 모델. 모든 역할이 읽는다. **단일 tier — Google Gemini(LLM) + Liner(출처 검색)**.

> **본 문서는 제품 모델 단일 출처**다. 기술 구현은 [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md), [`../30-llm/provider-config.md`](../30-llm/provider-config.md) 참조.

---

## 1. 개요

PiecePool은 **Google Gemini**를 LLM provider로, **Liner API**를 출처 기반 검색 provider로 사용한다. 단일 tier다.

| 항목 | 내용 |
|---|---|
| **LLM** | Google Gemini (`GEMINI_API_KEY` 필요) |
| **출처 검색** | Liner API (`LINER_API_KEY` 필요) — feature 3(정보 간극 메우기·fact-check) 출처 기반 검색 |
| **핵심 기능** | Workspace, archive, wiki 생성, Graph View |
| **LLM 강화 기능** | 파인만 + fact-check + 웹 검색 기반 비교 + Wiki 강화 |
| **한도** | Gemini·Liner API 비용·rate에 따름 |

API 키는 사용자 본인이 발급/관리한다. (PiecePool 구독 제공은 **경진대회 이후 BM 계획** — §7 참조.)

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
| **정밀 정리** | Gemini가 풍부한 explanation, 예시, 구조 생성 |
| **파인만** | 사용자가 노트 섹션을 자기 말로 설명하면, LLM이 정답을 주지 않고 그 설명의 구멍 하나만 짚어 되묻는다. 이해 판정은 오직 사용자가 한다 |
| **핵심 주제 게이트** | Gemini가 노트의 핵심 주제를 가려내고, 그 주제를 설명하고 "이해했다"고 선언해야 Wiki로 변환된다. 원본 노트(`archive/`)는 언제나 저장된다 |
| **Fact-check** | Liner 출처 검색으로 사용자 데이터 vs 실제 출처 비교 (feature 3) |
| **Suggest** | Fact-check 결과 차이가 있으면 수정안 제안 (자동 적용 X, 사용자 승인 필요) |
| **LLM Wiki 강화** | 위 메커니즘 종합으로 Wiki 정확도/완결성 향상 |

### 3.1 파인만 진입 조건
- 자동 임계값 트리거는 **없다**. 파인만은 저장할 때 켜는 토글이 아니라 **노트 에디터의 도구**이며, 사용자가 언제든 직접 연다: `##`/`###` 제목 줄에 마우스를 올려 나오는 `파인만` 버튼 · 텍스트 드래그 선택 · 인박스 `파인만` pill(글 전체).
- Gemini 키가 없으면 되묻는 질문을 만들 수 없다 — 있는 척하지 않고 건너뛰며 사용자에게 알린다.
- 이해 여부는 **오직 사용자가** 판정한다. LLM 은 채점하지 않는다. `[네, 이해했어요]` 를 누르면 사용자가 쓴 설명을 재료로 그 섹션의 Wiki가 다시 쓰인다.

자세한 흐름: [output-validation.md §6](../30-llm/output-validation.md)

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

### 3.3 핵심 주제 게이트
- Gemini 가 노트의 `##` 섹션 중 **"핵심 주제"**(모르면 나머지가 무너지는 주제)를 판별한다.
- 핵심 주제는 사용자가 파인만에 **답하고 "이해했다"고 선언해야** Wiki로 변환된다. 설명 못 한 개념이 Wiki가 되면 그건 "내가 아는 것"이 아니라 "AI가 아는 것"이다.
- Wiki로 가는 **모든 경로**에 걸린다 — `AI 위키 생성` · `정리 글 변환` · 인박스 `저장 + AI 정리`.
- **원본 노트(`archive/`)는 언제나 저장된다 — 막는 것은 Wiki뿐이다.**
- Gemini 키가 없거나 판별에 실패하면 게이트를 걸지 않는다(fail-open). 못 막는 것보다 잘못 막는 것이 나쁘다.

---

## 4. 데이터 흐름

| 단계 | 처리 |
|---|---|
| Inbox → archive | 원문 저장 (게이트와 무관하게 언제나) |
| 핵심 주제 게이트 | Gemini 판별 + 사용자 파인만 판정 — 통과해야 Wiki 생성으로 간다 (§3.3) |
| 1차 Concept/Wiki 생성 | Gemini |
| 파인만 | 파이프라인 단계가 아니다 — 사용자가 노트 에디터에서 언제든 연다 (§3.1) |
| Fact-check | Liner, 활성 시 |
| Wiki 저장 | 파인만/fact-check 반영 결과 |

---

## 5. Provider 인터페이스

Gemini raw 응답은 adapter가 `LlmWikiResult` JSON Schema로 정규화한다.

**SSOT**: [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md)
**Adapter 설계**: [`../30-llm/provider-config.md`](../30-llm/provider-config.md)

---

## 6. 환경변수

```bash
GEMINI_API_KEY=...                            # (필수) Gemini 호출 키
LINER_API_KEY=...                             # (필수) Liner 출처 검색 API 키 (feature 3·fact-check)
LINER_API_ENDPOINT=...                        # (선택) Liner API 엔드포인트 override
PIECEPOOL_LLM_MODEL=...                        # 모델명 override (provider-config.md §3 기본값)

# LLM 기능 토글 (유료 tier 아님 — 레거시 이름의 기본 on 토글)
PIECEPOOL_FACT_CHECK=true|false        # fact-check, 기본 true
PIECEPOOL_CLARIFY=true|false           # (레거시) 코드가 읽지 않는다 — 파인만은 토글이 아니라 에디터 도구다 (§3.1)
```

> ⚠️ 위 env 값은 **CLI 스크립트**(`npm run eval:feynman`, `chunk` 등)가 읽는다. 데스크톱 앱은 `.env`를 읽지 않고 설정 모달(→ `localStorage["gemini-key"]`)로 Gemini 키를 받는다 ([ADR-0009](../adr/0009-llm-provider-gemini.md)).

전체 매트릭스: [`../30-llm/provider-config.md`](../30-llm/provider-config.md) §2.

---

## 7. MVP 범위

| 항목 | MVP | MVP+1 이후 |
|---|---|---|
| Gemini LLM 호출 | ✅ | — |
| Liner 출처 검색 호출 | ✅ | — |
| 정밀 정리 | ✅ | — |
| **파인만** (에디터 도구) | ✅ | — |
| **핵심 주제 게이트** | ✅ | — |
| **Fact-check** | ⏸ 기본 흐름만, 정밀화는 후속 | 정밀화 |
| 결제/구독 시스템 | ⛔ | ✅ |
| API 키 관리 UI | 환경변수만 | 키 보관 UI |

결제/구독은 MVP 범위 외 — **경진대회 이후 BM(비즈니스 모델) 계획**이다. 현재는 사용자가 `GEMINI_API_KEY`(+`LINER_API_KEY`)를 직접 설정한다.

---

## 8. 역할 책임 매트릭스

| 영역 | 소유 |
|---|---|
| Gemini adapter | LLM (@gosu1) |
| 프롬프트 설계 | Backend (주도) + LLM (구조화) |
| 파인만(에디터 도구) · 핵심 주제 게이트 | Frontend (에디터 UI·게이트 배선) + LLM (되묻기·핵심 주제 판별 호출) |
| Fact-check 통합 | Backend (호출) + LLM (도구 호출 schema) |
| 결제 UI (MVP+1) | Frontend + Backend |

---

## 9. 변경 이력 노트

- 본 문서는 PiecePool 제품 모델(provider·tier·환경변수)의 단일 출처다.
- `docs/archive/PRD-v1.md`에는 provider·tier 정보가 없다. 본 문서가 1차 정의다.
- **2026-06-30**: 단일 tier 확정 — LLM은 OpenAI, feature 3(정보 간극 메우기·fact-check) 출처 검색은 Liner API. 기존 "Premium 기능"은 기본 기능으로 통합.
- **2026-07-10**: LLM provider를 OpenAI → **Google Gemini 단일**로 교체 ([ADR-0009](../adr/0009-llm-provider-gemini.md), ADR-0001 대체). 키 `GEMINI_API_KEY`, Gemini의 OpenAI 호환 Chat Completions 규격 사용. Liner 역할·tier 구조는 무변경.
- **2026-07-11**: 파인만이 **저장 시 켜는 토글에서 노트 에디터의 도구로** 바뀌었다(§3.1). `PIECEPOOL_CLARIFY`는 키 이름만 남고 **코드가 읽지 않는다**(§6). **핵심 주제 게이트**(§3.3) 신설 — Gemini 판별 + 사용자 파인만 판정을 통과해야 Wiki가 만들어지고, 원본 노트는 언제나 저장된다. tier·provider 구조는 무변경.
- 향후 변경은 PO/Tech Lead (@gosu1) 승인이 필요하다.
