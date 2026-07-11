# Vision

PiecePool 제품 비전, 핵심 사용자, 장기 사용 시나리오. **모든 역할 필독**.

> 본 문서는 [`docs/archive/PRD-v1.md`](../archive/PRD-v1.md) §2~§3에서 분리·정렬한 결과다.

---

## 1. 한 줄 정의

PiecePool은 대학생을 위한 **로컬 우선 AI 지식 Workspace**다.

사용자는 강의 PDF, 직접 작성한 필기, 붙여넣은 수업 정리 텍스트, 질문 기록 등 학습 자료를 하나의 로컬 Workspace에 넣는다. PiecePool은 원문을 보존하면서 **실제 LLM 호출**로 개념 중심 Wiki 문서와 타입 있는 지식 그래프로 재구성한다.

---

## 2. 핵심 컨셉 (절대 명제)

> **시간이 지날수록 Wiki/Graph가 개인 전공 지식 지도처럼 성장한다.**

본 명제가 PiecePool의 모든 설계 결정을 정렬한다.

---

## 3. 차별점

| 일반 노트 앱 | PiecePool |
|---|---|
| 자료를 단순 저장 | 자료를 **LLM-Wiki와 Graph로 계속 재구성** |
| 폴더/태그 기반 분류 | **타입 있는 Relation** (`part_of`, `used_in`, `confused_with` 등) |
| 단발 요약 | **누적 지식 지도** |
| 클라우드 SaaS | **로컬 우선** (Obsidian 같은 vault 구조) |

제품 경험은 Notion/SaaS 대시보드가 아니라 **Obsidian 같은 로컬 Markdown 작업 공간**에 가깝다.

---

## 4. 핵심 사용자

**초기 타깃**: 여러 전공 과목을 동시에 공부하는 대학생.

학년/과목/학기/시험은 **Workspace 분리 기준이 아니다**. 메타데이터/필터로 표현한다. 사용자는 정확히 1개의 Workspace를 운용한다.

---

## 5. 장기 사용 시나리오

중요한 사용 시나리오는 **단발성 요약이 아니라 장기 누적**이다.

- 사용자는 하나의 Workspace를 계속 사용한다
- 1학년 2학기에 시작한 학습 기록이 4학년까지 같은 Workspace 안에서 이어진다
- 시간이 지날수록 개념, 원문, 질문, Wiki, Relation이 누적된다
- 서로 다른 과목에서 배운 개념도 Graph 안에서 연결된다

### 5.1 cross-subject 연결 예시

```text
자료구조: Graph
  ↳ AI: Graph Neural Network
  ↳ 운영체제: Resource Allocation Graph
```

자료구조 강의에서 처음 만난 "Graph" 개념이, AI 수업의 GNN과 운영체제의 Resource Allocation Graph로 자연스럽게 연결된다. PiecePool은 이런 cross-subject 관계를 `related_to`보다 구체적인 타입(`used_in`, `extracted_from`, `confused_with`)으로 추적한다.

**RelationType 정의**: [`../10-contracts/relation-types.md`](../10-contracts/relation-types.md)

---

## 6. 제품 경험 원칙

| 원칙 | 의미 |
|---|---|
| **로컬 우선** | 모든 데이터는 사용자 머신에 저장. 외부 의존은 LLM(Gemini)·출처 검색(Liner) API 호출뿐 |
| **원문 보존** | LLM 정리가 archive 노트를 덮어쓰지 않는다 |
| **타입 있는 지식 그래프** | edge가 단순 선이 아니라 의미(`part_of`, `used_in` 등)를 갖는다 |
| **Obsidian 호환** | `[[파일]]`, `![[파일]]` 문법 그대로. 추후 vault로 이식 가능 |
| **실제 LLM 호출** | 가짜 UI/정적 데모 금지. MVP부터 진짜 호출 |

---

## 7. LLM

LLM 처리는 **Google Gemini**를 사용한다. fact-check·정보 간극 메우기(feature 3, label↔user)는 **Liner** 출처 검색을 주 해결책으로 쓴다. 파인만, 웹 검색 비교, suggest로 Wiki 품질·검증을 강화한다.

자세한 매트릭스: [`pricing-model.md`](pricing-model.md)

---

## 8. MVP 비전 범위

- 단일 로컬 Workspace
- Inbox → archive → wiki/graph 흐름이 **실제로 작동**
- Concept/WikiPage/Relation/Evidence를 실제 LLM 호출로 생성
- Graph View가 단순 시각화가 아니라 사용자 학습 맥락을 반영

MVP 합격선: [`scope-mvp.md`](scope-mvp.md), [`../60-qa/acceptance-criteria.md`](../60-qa/) (작성 예정).

---

## 9. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §2 (line 11-17) + §3 (line 19-37)에서 분리·정렬한 결과다.
- 제품 경험 원칙(§6) 5개 표는 본 리팩토링에서 신규 정리했다.
- LLM 절(§7)은 [pricing-model](pricing-model.md) 추가에 따른 cross-link.
