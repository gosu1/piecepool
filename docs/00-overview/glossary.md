# Glossary

PiecePool 용어 정의. **모든 역할 필독**. 협업 시 용어 표류 방지가 목적.

> 본 문서는 PRD에 없던 신규 자산이다. 엔티티 정의는 [`../10-contracts/entities.md`](../10-contracts/entities.md), Relation 타입은 [`../10-contracts/relation-types.md`](../10-contracts/relation-types.md).

---

## 1. 저장 단위

| 용어 | 정의 | 예 |
|---|---|---|
| **Workspace** | 사용자가 운용하는 단일 로컬 폴더. PiecePool 앱이 여는 root | `~/PiecePool/` |
| **KnowledgeSpace** (= 지식 영역 폴더) | Workspace 안의 학습 도메인 폴더. **독립 Workspace가 아님** | `deeplearning/`, `operating-systems/` |
| **Subject** | KnowledgeSpace 안의 과목 메타데이터. **Workspace/폴더 분리 기준 아님** | "AI", "운영체제" |

⚠️ Workspace는 하나다. `deeplearning/`은 폴더(KnowledgeSpace), Workspace 분리 아님.

---

## 2. 자료 / 문서

| 용어 | 정의 | 저장 위치 |
|---|---|---|
| **Source** | 사용자가 추가한 자료 1단위 | `<space>/inbox/` 진입 후 `archive/`로 |
| **ArchiveNote** | 사용자 원문 또는 추출 텍스트 Markdown | `<space>/archive/*.md` |
| **WikiPage** | LLM이 정리한 Concept 중심 Markdown | `<space>/wiki/*.md` |
| **OriginalFile** | 보존된 원본 (PDF/이미지) | `<space>/sources/original-files/` |

---

## 3. 지식 표현

| 용어 | 정의 |
|---|---|
| **Concept** | Source에서 추출된 핵심 개념. 1 Concept ↔ 1 WikiPage |
| **Relation** | Concept/WikiPage/Source 사이의 의미 있는 연결 |
| **RelationType** | Relation의 타입 enum 12종 ([relation-types](../10-contracts/relation-types.md)) |
| **Evidence** | Relation의 근거 (archive 발췌 또는 원본 PDF page) |
| **Question** | WikiPage와 연결된 관련 질문 |
| **SourceRef** | WikiPage frontmatter에서 본문 `[[...]]`/`![[...]]`를 가리키는 구조화 참조 |

---

## 4. Wikilink / embed

| 용어 | 문법 | 동작 |
|---|---|---|
| **Wikilink** | `[[파일명]]` | 원본 파일 링크 |
| **Embed** | `![[파일명]]` | inline preview (PDF page, 이미지) |
| **PDF page link** | `[[파일.pdf#page=12]]` | 특정 page 링크 |
| **PDF page embed** | `![[파일.pdf#page=12]]` | 특정 page preview |

탐색 root는 현재 KnowledgeSpace의 `sources/original-files/`. 자세한 규약: [`wikilink-embed`](../10-contracts/wikilink-embed.md).

---

## 5. 처리 흐름

| 용어 | 정의 |
|---|---|
| **Inbox** | 처리 전 임시 입력 공간 (`<space>/inbox/`) |
| **Archive** | 원문 보존 영역 (`<space>/archive/`). **LLM이 덮어쓰지 않음** |
| **Wiki** | LLM 정리 영역 (`<space>/wiki/`) |
| **Import** | Inbox → archive → LLM → wiki 흐름 |
| **ImportJob** | Import 처리 상태 단위. `idle → parsing → archiving → llm_processing → writing → completed/failed` |
| **Seed** | 첫 실행 데모 데이터 |

---

## 6. LLM / Provider

| 용어 | 정의 |
|---|---|
| **Provider** | LLM 호출 대상. 3종: `local` (Ollama), `openai` (GPT), `gemini` (Google) |
| **Adapter** | provider별 raw 응답을 공통 `LlmWikiResult` schema로 변환하는 계층 |
| **LlmWikiResult** | provider 무관 출력 JSON Schema ([llm-output-schema](../10-contracts/llm-output-schema.md)) |
| **Free plan** | Local LLM 무제한 사용 |
| **Premium plan** | GPT 또는 Gemini 사용 + 강화 기능 |

### 6.1 Premium 전용 용어

| 용어 | 정의 |
|---|---|
| **되묻기 (Clarification)** | 입력이 불확실할 때 사용자에게 재확인 질문. Claude식. Backend가 트리거 |
| **Fact-check** | 웹 검색으로 사용자 데이터 vs 실제 출처 비교 |
| **Suggest** | Fact-check 결과 차이를 사용자에게 수정안으로 제안. 자동 적용 X |

자세한 흐름: [`pricing-model`](pricing-model.md).

---

## 7. 입력 처리

| 용어 | 정의 |
|---|---|
| **OCR** | 이미지/필기/스크린샷을 텍스트로 변환. **MVP 범위** (Frontend 책임) |
| **PDF text extraction** | PDF에서 layout 보존하며 텍스트 추출 (Backend 책임) |
| **Subject 즉시 생성** | Import 화면에서 Subject가 없으면 즉석 생성 |

---

## 8. Graph View

| 용어 | 정의 |
|---|---|
| **Node** | Graph 점. 종류: Concept / WikiPage / Source |
| **Edge** | Graph 선. Relation 1개에 대응. 타입(`relationType`) 보유 |
| **Strength** | Relation 강도 (0.0~1.0). edge 두께·노드 거리에 반영 |
| **Confidence** | Relation 자체의 확실성 (0.0~1.0). LLM이 부여 |

---

## 9. 협업 규약

| 용어 | 정의 |
|---|---|
| **SSOT** | Single Source of Truth. `docs/10-contracts/`만 정의. 다른 곳 복붙 금지 |
| **contracts-change** | SSOT 수정 PR에 부착하는 라벨. 4역할 owner review 필수 |
| **CODEOWNERS** | GitHub 폴더별 owner 매핑 파일 (`.github/CODEOWNERS`) |
| **Tracking issue** | 역할별 Phase 4 작업 추적 이슈 (Backend #1, Frontend #2, LLM #3, Design #4, Contracts #5) |
| **Phase** | PRD_REFACTOR_PLAN의 5단계. 1=Skeleton, 2=SSOT, 3=Overview, 4=Roles, 5=QA/Roadmap |

---

## 10. 자주 헷갈리는 구분

### 10.1 `archive/` vs `sources/`
- `archive/`: **추출 텍스트** Markdown (사람이 읽음)
- `sources/original-files/`: **원본 바이너리** PDF/이미지

### 10.2 link vs embed
- `[[X]]`: link (클릭하면 열림)
- `![[X]]`: embed (그 자리에 preview)

### 10.3 Concept vs WikiPage
- Concept: 추상 개념 entity (메타데이터)
- WikiPage: 해당 Concept을 설명하는 Markdown 파일

### 10.4 confidence vs strength
- confidence: 관계 추출 자체의 확실성 (LLM이 자신 있나)
- strength: 관계의 강도 (얼마나 강한 연결인가)

### 10.5 KnowledgeSpace vs Subject
- KnowledgeSpace: 폴더 (`deeplearning/`)
- Subject: 메타데이터 ("AI 2026-1학기")

---

## 11. 변경 이력 노트

- 본 문서는 PRD에 없던 신규 자산이다. 협업자 증가에 따른 용어 표류 방지가 목적이다.
- §6.1 (Premium 전용 용어), §9 (협업 규약)는 본 리팩토링에서 추가된 용어 정의다.
