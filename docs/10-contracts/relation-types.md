# RelationType (SSOT)

Concept/Source/WikiPage 사이의 의미 있는 연결. 12개 enum 값 + Relation 엔티티 정의.

> **본 문서가 단일 출처**다. 다른 폴더에서 enum 값을 코드/문서에 복붙 금지. link로 참조.
> **계약 변경**: [README.md#변경-절차](README.md#변경-절차) 참조.

---

## 1. RelationType enum

```ts
type RelationType =
  | "extracted_from"
  | "explained_by"
  | "prerequisite"
  | "part_of"
  | "used_in"
  | "causes"
  | "solves"
  | "contrasts"
  | "confused_with"
  | "related_to"
  | "tested_in"
  | "review_needed";
```

---

## 2. 의미 / 사용 기준 / 금지 조건

| 타입 | 의미 | 사용 예 | 사용 금지 조건 |
|---|---|---|---|
| `extracted_from` | A는 B 소스에서 추출됨 | Concept "Self-Attention" `extracted_from` Source "transformer-week3.pdf" | Source가 직접 근거 아닐 때 |
| `explained_by` | A는 B에 의해 설명됨 | Concept `explained_by` WikiPage | WikiPage가 단순 언급만 할 때 |
| `prerequisite` | A를 이해하려면 B가 선수 | "Backpropagation" `prerequisite` "Gradient" | 순서 무관일 때 |
| `part_of` | A는 B의 구성 요소 | "Self-Attention" `part_of` "Transformer" | 단순 연관일 때 (`related_to` 사용) |
| `used_in` | A가 B 안에서 활용됨 | "Embedding" `used_in` "Transformer" | A와 B가 동급 개념일 때 |
| `causes` | A가 B를 유발 | "Deadlock" `causes` "System Hang" | 단순 상관관계일 때 |
| `solves` | A가 B를 해결 | "Mutex" `solves` "Race Condition" | 부분 완화만 할 때 (별도 표현 필요) |
| `contrasts` | A와 B는 대조됨 | "Process" `contrasts` "Thread" | 단순 유사·차이만 있을 때 |
| `confused_with` | 학습자가 A와 B를 자주 혼동 | "Self-Attention" `confused_with` "Cross-Attention" | 객관적 차이만 있고 혼동 사례 없을 때 |
| `related_to` | 일반 연관 (최종 수단) | 위 타입 모두 부적합할 때만 | **남발 금지**. 구체적 타입 가능하면 그쪽 사용 |
| `tested_in` | A가 B(시험·과제)에 출제됨 | "BFS" `tested_in` "자료구조 중간고사 2025-2" | 일반 학습 자료일 때 |
| `review_needed` | 사용자가 복습 필요로 표시 | Concept `review_needed` (self-loop 허용) | LLM이 자동 부여 금지 (사용자 행동) |

---

## 3. Relation 엔티티

```ts
type Relation = {
  id: string;
  spaceId: string;
  sourceNodeId: string;      // Concept.id | WikiPage.id | Source.id
  targetNodeId: string;
  relationType: RelationType;
  strength: number;          // 0.0 ~ 1.0
  confidence: number;        // 0.0 ~ 1.0
  explanation: string;       // 짧은 한국어 설명
  evidence: Evidence[];      // 근거 목록 (최소 1개 권장)
  createdAt: string;
  updatedAt: string;
};
```

**Evidence 정의**: [entities.md#evidence](entities.md#evidence)

---

## 4. 필드 의미

### 4.1 `strength` (0.0 ~ 1.0)

관계의 **강도**. Graph View에서 edge 두께·노드 거리 시각화에 사용.

| 범위 | 해석 |
|---|---|
| 0.8~1.0 | 핵심 구조 관계 (예: `part_of` 직접 구성) |
| 0.5~0.8 | 명확한 의미 관계 |
| 0.2~0.5 | 약한 연관 |
| 0.0~0.2 | 매우 약함 (Graph 노출 검토 필요) |

MVP에서는 LLM이 부여한 값을 그대로 사용. 후속 버전에서 가중 합산 점수화 (`docs/70-roadmap/post-mvp.md`).

### 4.2 `confidence` (0.0 ~ 1.0)

관계 자체의 **확실성**. LLM이 해당 관계 추출에 얼마나 자신 있는가.

- 1.0: 명시적 근거 (원문에 "A는 B의 일부다" 같은 직접 언급)
- 0.5: 추론 (맥락상 명백)
- 0.0~0.3: 약한 추측 (저장 자체를 보류 검토)

### 4.3 `explanation`

사용자가 edge 상세 패널에서 읽을 한국어 짧은 설명. 1-2문장.

예: `"Self-Attention은 Transformer의 핵심 layer 중 하나로, 입력 token 간 관계를 계산한다."`

### 4.4 `evidence`

Relation 근거 목록. **Graph edge 클릭 시 사용자가 "왜 이 둘이 연결됐는지" 이해할 수 있어야 한다**. 최소 1개 권장.

각 Evidence는 archive 텍스트 발췌 또는 원본 PDF page를 가리킨다.

---

## 5. `related_to` 사용 정책 (강조)

`related_to`는 **최종 수단**이다. LLM 프롬프트와 코드 리뷰에서 다음을 강제한다.

- 가능한 한 구체 타입 (`part_of`, `used_in`, `confused_with`, `prerequisite` 등) 우선
- `related_to` 사용 시 `explanation`에 다른 타입을 쓸 수 없는 이유 명시
- 검토 시 `related_to` 비율이 30% 초과면 LLM 프롬프트 또는 데이터 점검

---

## 6. 노드 타입 호환성 매트릭스

| 타입 | source 가능 | target 가능 |
|---|---|---|
| `extracted_from` | Concept, WikiPage | Source |
| `explained_by` | Concept | WikiPage |
| `prerequisite` | Concept | Concept |
| `part_of` | Concept | Concept |
| `used_in` | Concept | Concept |
| `causes` | Concept | Concept |
| `solves` | Concept | Concept |
| `contrasts` | Concept | Concept |
| `confused_with` | Concept | Concept |
| `related_to` | Concept, WikiPage | Concept, WikiPage |
| `tested_in` | Concept | Source, Concept (시험 정보) |
| `review_needed` | Concept | Concept (self-loop 허용) |

위 매트릭스 외 조합은 schema 검증 단계에서 reject.

---

## 7. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §8.8 (line 452-486)을 분리·확장한 SSOT다.
- 노드 호환성 매트릭스(§6)는 본 리팩토링에서 신규 명시했다.
- `strength`/`confidence` 범위 의미(§4)도 신규 명시했다.
