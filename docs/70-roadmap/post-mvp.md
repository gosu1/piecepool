# Post-MVP Roadmap

MVP 이후 단계. 우선순위·시기는 별도 결정.

> 본 문서는 [`docs/archive/PRD-v1.md`](../archive/PRD-v1.md) §17 (line 1064-1140)을 분리·정렬하고, 본 리팩토링 신규 결정사항에 따른 후속 항목을 추가한 결과다.

---

## 1. 장기 지식 지도 강화 (핵심 가치)

PiecePool의 장기 가치 = **개인 전공 지식 지도의 성장**.

### 1.1 강화 메타데이터
- 학기
- 과목
- 교수
- 시험
- 과제
- 프로젝트
- 읽은 자료

위 정보는 **별도 Workspace를 만드는 기준이 아니라** 하나의 Workspace 안의 필터/Relation으로 작동한다.

### 1.2 새 RelationType 후보
- `taught_by` (Concept → 교수)
- `assigned_in` (Concept → 과제)
- `appeared_in_exam` (Concept → 시험 회차)

추가 시 [relation-types.md](../10-contracts/relation-types.md) 변경 → `contracts-change` 4역할 review.

---

## 2. Today Task

Graph + Wiki 기반 일일 복습 행동 생성.

예:
- 헷갈리는 개념 복습 (`confused_with` 관계가 있는 Concept)
- 최근 추가된 WikiPage 확인 (`createdAt` 기준 7일)
- 시험 관련 Concept 우선 복습 (`tested_in` 또는 `appeared_in_exam`)
- `review_needed` 마킹된 항목 우선

---

## 3. Project Flow

개념과 자료를 장기 프로젝트에 연결.

대상:
- 팀플
- 연구
- 포트폴리오
- 캡스톤

`used_in` RelationType 확장 또는 신규 `applied_in` 추가 검토.

---

## 4. OCR 정밀화

> ⚠️ OCR 기본 흐름은 **MVP에 흡수됨** (서준 결정). 본 절은 정밀화 후속.

- PDF page 안 좌표 highlight
- 이미지 OCR 기반 영역 highlight
- 수식 OCR (Mathpix 등 외부 API)
- 손글씨 정확도 향상 (한국어)
- 다국어 (영/일/중) 확장

---

## 5. Premium 강화

### 5.1 Fact-check 정밀화
- 멀티 소스 비교 (1개 검색 vs N개 검색 결과 종합)
- 신뢰도 점수화 (출처 권위 / 인용 수 / 최신성)
- 사용자 학습 맥락 반영 (시험 범위 안 사실만 검증)
- 모순 자동 감지 (서로 다른 출처가 충돌 시 명시)

### 5.2 결제 / 구독 시스템
- 결제 UI (Stripe / 토스 / 카카오페이)
- 구독 상태 동기화
- API 키 관리 UI (BYOK = Bring Your Own Key)
- 사용량 트래킹

### 5.3 추가 Premium 기능 후보
- 자동 요약 일정 (주간 / 월간 학습 요약)
- 교수 스타일 모방 LLM (개별 강의 톤 학습)
- 동료 공유 (선택 WikiPage만 제한 공유)

---

## 6. 저장 / 인덱스 확장

- IndexedDB UI 캐시 (Frontend)
- SQLite query layer (Backend)
- File watcher (외부 Markdown 수정 감지)
- 외부 변경 충돌 해소 (3-way merge)
- 선택적 sync account (E2EE)
- Obsidian 호환 vault mode (vault 위치 import / export)

---

## 7. Relation scoring

MVP에서 LLM이 부여한 `strength` 값 사용. 후속에서 가중 합산:

```text
strength =
  0.30 * semanticSimilarity
+ 0.25 * coOccurrence
+ 0.25 * llmConfidence
+ 0.10 * userInteraction
+ 0.10 * goalRelevance
```

- `semanticSimilarity`: 임베딩 cosine
- `coOccurrence`: 같은 archive에서 함께 등장한 빈도
- `llmConfidence`: 기존 `confidence` 값
- `userInteraction`: edge 클릭, WikiPage 방문 빈도
- `goalRelevance`: 시험/과제 임박도

---

## 8. Cross-space link

MVP는 같은 KnowledgeSpace 안의 `[[...]]` / `![[...]]`만 해석.

후속:
- `[[deeplearning/transformer.md]]`처럼 다른 KnowledgeSpace 참조
- Wikilink → 자동 KnowledgeSpace prefix 추론

---

## 9. LLM 확장

### 9.1 추가 로컬 backend
- **MLX** (Apple Silicon 최적화) — 우선순위 후보
- **llama.cpp** (포터빌리티)
- 선택 우선순위: [open-questions §2](../00-overview/open-questions.md#2-llm--provider)

### 9.2 추가 외부 provider
- Anthropic Claude (Premium 옵션 추가)
- Mistral
- Cohere
- 추가 시 [llm-output-schema](../10-contracts/llm-output-schema.md) §7에 명시 (Adapter 패턴)

### 9.3 모델 라우팅
- 작은 input은 작은 모델, 큰 input은 큰 모델 자동 선택
- 비용/품질 trade-off 사용자 설정

---

## 10. 협업 (다중 사용자)

> 본 항목은 PiecePool 핵심 컨셉(개인 지식 지도)과 거리가 있어 **신중 검토**.

- 같은 Workspace 공유 (E2EE 또는 클라우드 sync)
- 권한 (read / edit / suggest)
- 충돌 해소

---

## 11. 인프라 / 운영

- Branch protection rule (즉시: GitHub Settings 수동) — [open-questions §4](../00-overview/open-questions.md#4-인프라--운영)
- 자동 릴리즈 (tag → `.dmg`/`.pkg` 빌드, GitHub Actions Tauri Action)
- 에러 로깅 (Sentry vs 로컬 파일 vs 자체 서버)
- 텔레메트리 (옵트인 사용량 통계)

---

## 12. 모바일

- iOS / iPadOS read-only viewer (필기 사진 input + 동기화)
- Android는 후순위

---

## 13. 우선순위 (제안)

| 단계 | 항목 |
|---|---|
| MVP+1 | OCR 정밀화, fact-check 정밀화, branch protection, 자동 릴리즈 |
| MVP+2 | Today Task, Relation scoring, file watcher, MLX backend |
| MVP+3 | 결제 시스템, cross-space link, Project Flow |
| MVP+4 | 모바일 viewer, Obsidian vault 호환, Anthropic Claude provider |
| 신중 검토 | 협업, 텔레메트리 |

위 우선순위는 제안. 실제 결정은 사용자 피드백 / 자원에 따라.

---

## 14. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §17에서 분리·정렬한 결과다.
- §1.2 (새 RelationType 후보), §4 OCR 정밀화 (기본 흐름은 MVP 흡수), §5 Premium 강화 (3개 절), §9 LLM 확장, §11 인프라/운영, §13 우선순위는 본 리팩토링 신규 추가다.
- §7 Relation scoring 공식은 PRD-v1과 동일.
