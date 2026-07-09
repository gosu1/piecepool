# 파인만식 되묻기 (Feynman Clarify) — 설계

- 날짜: 2026-07-10
- 브랜치: `docs/feynman-clarify-design`
- 대상: `src/llm/`, `src/store/importStore.ts`, `src/app/panes/InboxSection.tsx`, `src/lib/CytoscapeGraph.tsx`, `src-tauri/src/commands/graph.rs`
- 관련 계약: [relation-types.md](../../10-contracts/relation-types.md) · [entities.md](../../10-contracts/entities.md) · [workspace-layout.md](../../10-contracts/workspace-layout.md)

## 배경 / 문제

되묻기(clarify)는 이미 end-to-end로 동작한다. `runImport` 가 1차 위키를 만들고, `buildGaps` 로 질문을 만들고, `clarify_pending` 에서 멈추고, 사용자 응답을 2차 생성 입력에 반영한다 (`importStore.ts:153-189`).

문제는 **그 상호작용이 학습적으로 역효과**라는 것이다.

`gaps.ts:122` 의 시스템 프롬프트는 스스로를 `"You are a Socratic study coach"` 라 부른다. 그러나 실제 동작은 소크라테스식도, 파인만식도 아니다.

```
topSections()        → 노트 ## 헤딩 3개 추출
firstSentence(body)  → 사용자의 주장을 코드가 대신 뽑아 준다
choices[0] = claim   → 그 주장을 첫 선택지로 제시
→ 사용자는 클릭만 한다   (InboxSection.tsx:384-396)
```

**소크라테스가 아니다.** 질문 형식만 있고 elenchus(논박)가 없다. 모순을 끌어내지 않고 아포리아로 데려가지 않는다. 그냥 확인을 구한다.

**파인만도 아니다.** 핵심인 "학습자가 설명을 생산한다"가 통째로 빠졌다. `choices[0]` 이 사용자가 했어야 할 설명을 코드가 대신 써 준다.

지금 것의 정확한 이름은 **재인(recognition) 과제**다. 그리고 이것이 나쁜 이유가 있다.

> **설명 깊이의 착각 (Illusion of Explanatory Depth)** — 사람은 복잡한 현상을 실제보다 훨씬 정확하고 깊이 이해한다고 느낀다. 이 착각은 사실이나 절차보다 **설명적 지식에서 압도적으로 강하다.**
> Rozenblit & Keil, *The misunderstood limits of folk science: an illusion of explanatory depth*, Cognitive Science 26(5), 2002.

착각을 깨는 방법은 **직접 설명하게 시키는 것**뿐이다. 선택지 클릭은 착각을 못 깬다. 오히려 사용자가 자기 주장(`choices[0]`)을 클릭하면 "맞았다"고 확인해 주는 셈이라 **착각을 강화한다.**

## 용어 정의

두 기법은 정반대 방향의 도구다. 섞어 쓰되 무엇을 빌리는지 명확히 한다.

| | 소크라테스식 (elenchus) | 파인만 기법 |
|---|---|---|
| 학습자가 하는 일 | 주장하고 **답한다** | 설명을 **생산한다** |
| 구멍이 드러나는 방식 | 질문자가 모순을 **끌어낸다** | 설명하다 스스로 **막힌다** |
| 종료 조건 | 아포리아 (답 없음) | 초보자도 알아듣는 설명 완성 |
| 원자료 | 안 돌아간다 | **반드시 돌아간다** (3단계) |
| 대화 상대 | 필수 | 불필요 |
| 산출물 | 없음 (자각) | 평이한 설명문 |

**주의**: 리처드 파인만은 이 기법을 명명하거나 단계로 정리하거나 출판한 적이 없다. 후대(주로 Scott Young)가 그의 학습·강의 습관에서 패턴을 뽑아 4단계로 포장한 것이다. 발표·문서에서 "파인만이 제안한"이라 쓰지 말 것. **"파인만의 학습 습관에서 유래한"** 이 정확하다.

우리가 만드는 것은 **혼합형**이다. 사용자가 설명을 생산하고(파인만 2단계), LLM이 그 설명에서 모순·비약을 찾아 되묻고(소크라테스 elenchus), 막히면 원본 PDF의 그 대목으로 데려가고(파인만 3단계), 종료 시 그 설명을 재료로 위키를 만든다(파인만 4단계).

순수 파인만은 대화 상대가 필요 없어 LLM을 쓸 이유가 약하고, 순수 소크라테스는 아포리아로 끝나 위키 생성으로 이어지지 않는다. PiecePool에는 **막힘을 감지할 눈(LLM)과 돌아갈 원자료(PDF)와 산출물(위키)** 이 모두 있다.

## 목표 (성공 기준)

- 사용자가 **직접 설명을 쓴다.** 선택지 클릭이 사라진다.
- LLM은 되묻되 **답을 주지 않는다.**
- 루프는 **사용자가 `[그만]` 을 누를 때까지** 반복된다. LLM이 종료를 판정하지 않는다.
- 이해 여부는 **사용자가 선언한다.** `[네, 이해했어요]` / `[아직 모르겠어요]`
- `[아직 모르겠어요]` 는 `review_needed` self-loop 로 디스크에 남고, 그래프·노트·홈에서 보인다.
- 계약 변경 0. 새 엔티티 0. 새 파일(레이아웃) 0.

## 범위 밖 (Non-goals)

- **AI 이해도 채점.** LLM이 "설명이 충분/불충분"을 판정하지 않는다. 계약(`relation-types.md:45`)이 금지하고, 코드(`validate.ts:99`)가 이미 막고 있으며, 사용자 경험상으로도 나쁘다.
- 사이드바 파일 트리 **필터 모드**. 빨간 점 배지로 대체한다 (비용 대비 동일 가치).
- `pdfdigest.ts` 되살리기. 호출처 0인 사장 코드다. `outline.ts` 가 대체했다.
- 무키(오프라인) 파인만 루프. `heuristicWiki` 는 헤딩 분해라 되묻기를 만들 수 없다.

## 설계

### 1. 데이터 모델 — 새 파일 0

상태는 단 하나, `relations.json` 의 self-loop 다.

```jsonc
{
  "sourceNodeId": "concept-임계구역",
  "targetNodeId": "concept-임계구역",
  "relationType": "review_needed",
  "strength": 1.0,
  "confidence": 1.0,
  "evidence": ["사용자가 3회 설명 시도 후 '아직 모르겠어요' 선택 (2026-07-16)"]
}
```

계약이 이 모양을 이미 규정하고 있다.

```
relation-types.md:45
| review_needed | 사용자가 복습 필요로 표시 | Concept review_needed Concept (self-loop 허용) | LLM이 자동 부여 금지 (사용자 행동) |
```

UI 세 곳이 전부 이 쿼리 하나에서 파생된다.

```
relations.json 에서  relationType === "review_needed" && sourceNodeId === targetNodeId
  → 그래프 노드 강조      (그 개념)
  → StudyHome 집계        (그 개수)
  → 노트 하단 플로팅 바    (이 노트에서 나온 개념 ∩ 위 집합)
```

**사용자가 쓴 설명 텍스트**는 `save_note` (`notes.rs:96`) 로 원본 archive 노트 끝에 `## 내 설명` 섹션으로 덧붙인다. 원문은 위에 그대로 남으므로 `workspace-layout.md:97` ("LLM 결과로 archive 노트를 덮어쓰지 않는다") 를 지킨다. **LLM의 되묻기 문장은 저장하지 않는다** — archive 는 사용자 원문이어야 한다.

### 2. 백엔드 — 신규 커맨드 2개 (P0 blocker)

현재 `review_needed` 를 **기록할 경로가 코드에 없다.**

```rust
// commands/graph.rs:160 — append_relations 안
if r.relation_type == RelationType::ReviewNeeded {
    return Err("[relation_invalid] review_needed 는 사용자만 지정 가능(자동 부여 금지)".into());
}
```

계약은 "사용자가 붙인다"고 말하는데, 사용자가 붙일 수단이 없다. 미완성이다. 전용 커맨드를 판다.

```rust
#[tauri::command]
pub fn mark_review_needed(space: String, concept_id: String, evidence: Vec<String>) -> Result<u32, String>

#[tauri::command]
pub fn unmark_review_needed(space: String, concept_id: String) -> Result<u32, String>
```

`append_relations` 의 **거울상**이다.

| | `append_relations` | `mark_review_needed` |
|---|---|---|
| `review_needed` | **거부** | **유일하게 허용** |
| 그 외 타입 | 허용 | 거부 |
| self-loop | — | **강제** (`source == target`) |
| 호출자 | LLM 결과 기록 | 사용자 명시 행동 |

나머지 검증(`compat`, `evidence ≥ 1`, `strength/confidence ∈ [0,1]`, dedup)은 그대로 재사용한다. `lib.rs` `invoke_handler` 등록 + `src/lib/ipc.ts` 노출.

**두 커맨드가 나뉘어 있다는 사실 자체가 "LLM은 못 붙이고 사용자만 붙인다"의 구조적 증명이다.**

### 3. 상태머신 — `ImportJobStatus` 변경 없음

```
parsing → archiving → llm_processing (1차: 개념 목록 확보)
   → clarify_pending  ←──┐   파인만 루프 (LLM 호출 N회, 디스크 안 씀)
   │                     │
   └── 사용자 [그만] ────┘
        → llm_processing (2차: 대화 전체 반영)
        → writing → completed
             └→ mark_review_needed  (사용자가 [아직 모르겠어요] 선택 시)
```

`ImportJobStatus::ClarifyPending` 은 `models/mod.rs:277` 에 **이미 있다.**
(참고: `CLAUDE.md` 는 "아직 코드에 없다"고 서술한다 — 낡은 기술. 별도 PR로 정정할 것.)

**1차 위키 생성을 유지한다.** `review_needed` 는 `Concept → Concept` 이고 **Concept 은 위키 생성 후에야 존재**하기 때문이다. 1차 생성이 되묻기 대상 개념 목록을 만든다.

2차 생성 입력에는 대상 개념을 반드시 포함하라는 힌트를 넣는다. 생성 후 `normalizedTitle` (lowercase + 공백 정규화) 로 매칭해 `review_needed` 를 붙인다. **매칭 실패 시 조용히 건너뛰고 경고 토스트만 띄운다.** 크래시 금지.

### 4. 대상 개념 선정

1차 생성 결과의 `concepts[]` 중 **가장 취약한 1개**를 LLM이 고른다. 판단 근거는 노트 안에서 그 개념이 얼마나 얕게 서술됐는지(문장 수, 정의문 유무, 예시 유무)다.

사용자는 `[다른 개념으로]` 로 갈아탈 수 있다. 저장 직후 선택 화면을 끼워 넣지 않는다 — 마찰 0 으로 곧장 "'임계 구역'을 설명해보세요"가 뜬다.

부수 효과: 사용자가 개념을 고르지 않았는데 AI가 골랐다. 이것이 코드로 뒷받침되는 **능동성**이다.

### 5. LLM 계약 — `src/llm/feynman.ts` (신규)

```ts
export interface Probe {
  probe: string;      // 되물음 한 문장
  targetGap: "why" | "term" | "example" | "contradiction";
}

export async function probeExplanation(
  concept: string,
  noteText: string,
  history: Array<{ role: "user" | "probe"; text: string }>,
  apiKey: string,
): Promise<Probe>;
```

시스템 프롬프트의 불변 제약:

1. **답을 주지 마라.** 개념의 정의나 정답을 문장에 담지 마라.
2. 사용자 설명에서 **빠진 인과("왜"), 정의되지 않은 용어, 예시 부재, 앞말과의 모순** 중 **하나만** 짚어 되물어라.
3. 판정하지 마라. "충분하다/부족하다"를 말하지 마라.
4. 한국어 한 문장.

소크라테스의 elenchus 이되, 아포리아로 끝내지 않고 다음 라운드로 넘긴다.

`gaps.ts` 는 **삭제하지 않는다.** `topSections` / `firstSentence` 를 export 해 재사용하고, `linerGaps` 는 P3 힌트 사다리 2칸에서 되살린다. 선택지형 clarify 경로는 이 변경으로 고아가 되지만, 사전 존재 코드이므로 **보고만 하고 지우지 않는다** (CLAUDE.md 코딩 규칙).

### 6. 힌트 사다리 (P3)

사용자가 막히면 답을 주는 대신 **사다리를 한 칸씩 내려 준다.** 각 칸은 사용자가 명시적으로 요청해야 열린다.

```
[모르겠어요] 클릭
  ↓ 1칸: 원본 PDF 의 그 대목으로 데려간다      ← 파인만 3단계 정통. 답을 안 준다
  ↓ 2칸: 그 대목만 평이한 한국어로 풀어 준다     ← 번역 + 국소 요약 (P4)
  ↓ 3칸: 비유를 하나 준다                       ← 파인만 4단계 보조
     (정답은 끝까지 안 준다 — 다시 설명하게 한다)
```

**1칸은 새 인프라가 필요 없다.**

```
src-tauri/src/pdf/mod.rs:24      pdf_extract::extract_text_by_pages(path)
src-tauri/src/models/mod.rs:253  PageText { page: u32 /* 1-indexed */, text: String }
docs/10-contracts/entities.md:203  SourceRef.page?: number
docs/10-contracts/wikilink-embed.md  [[file.pdf#page=N]]
```

PDF 가 이미 페이지별로 추출되고, `SourceRef` 가 페이지 번호를 담는 계약이며, PDF 뷰어가 이미 있다. LLM 에게 페이지별 텍스트를 주고 고르게 하면 된다.

몇 번째 칸에서 풀렸는지가 그 개념의 이해도 신호가 된다 (후속 활용 여지).

#### 번역에 관한 경고 (P4)

**번역과 요약은 학습적으로 정반대다.**

- **번역은 안전하다.** 영어를 못 읽으면 개념 이해를 시작조차 못 한다. 언어 장벽은 이해의 장벽이 아니다.
- **요약은 위험하다.** 특히 "12살도 이해하게 풀어 주는" 요약이. 파인만 2단계는 **사용자가** 평이한 설명을 생산하는 것이다. LLM이 먼저 해 버리면 사용자가 할 일이 사라지고, 읽고 "쉽네, 이해했다" 하고 덮는다. **IOED 를 정확히 강화하는 동작이다.**

같은 화면에 "설명 써 보세요" 칸과 "AI 요약 보기" 버튼이 나란히 있으면 사용자는 항상 요약을 누른다.

따라서 **12살 수준의 설명은 사다리 2칸, 즉 사용자가 막힌 뒤에만 제공한다.** 그러면 그것이 파인만 3단계("원자료로 돌아가라")의 정확한 구현이 된다. 원문 전체 요약은 이 기능에 넣지 않는다.

### 7. UI 표면

| 위치 | 변경 |
|---|---|
| `InboxSection.tsx:377-415` | 선택지 칩 → **자유 설명 입력 + `[그만]`**. 종료 시 `[네, 이해했어요]` / `[아직 모르겠어요]` |
| `CytoscapeGraph.tsx` | `node[review]` → **빨간 점선 테두리** |
| 노트 뷰 하단 | 플로팅 바 — "'임계 구역'을 아직 모르겠다고 표시하셨어요 `[다시 설명해보기]`" |
| `StudyHome.tsx:61-75` | 기존 `nudges`(임계값 문자열) 자리 → "아직 모르겠다고 표시한 개념 3개" · 클릭 시 **루프 재개** |
| 파일 트리 | wiki 항목 옆 빨간 점 배지 |

#### 그래프 시각 인코딩 — 채널을 분리한다

노드 색은 이미 의미가 있다(파랑=중심/선택, 회색=일반). 여기에 빨강을 얹으면 "선택된 review 노드"의 색이 정의되지 않는다. **채움과 테두리는 직교하는 채널**이다.

```
fill    = 상호작용 상태 (선택/중심)     ← 현행 유지
border  = 데이터 상태 (review_needed)   ← 빨간 점선 신규
size    = 우선도 (prioritization.md)    ← 현행 유지
```

> **크고, 빨간 테두리인 노드 = 중요한데 아직 설명 못 하는 개념. 지금 가장 먼저 공부해야 할 것.**

노드 크기는 이미 중심성 기반 우선도로 구동된다. 새로 만드는 것 없이 "무엇부터 공부할지"가 화면에서 드러난다.

#### 시각 언어 SSOT 는 깨지 않는다

모노크롬 관계 언어의 **유일한 예외가 이미 `review` 로 예약돼 있다.**

```
relationMeta.ts:8     RelationGroupId = ... | "review"
relationMeta.ts:11    REVIEW_COLOR = "#e03131"   // 모노크롬 그래프에서 유일하게 색을 갖는 그룹
relationMeta.ts:31    { id: "review", members: ["review_needed"], dash: "dashed", arrow: false }
relationMeta.ts:81    src === tgt ? "복습이 필요하다고 표시한 개념이에요"
relationMeta.ts:111   computeDepth: self-loop 무시  → 계층 레이아웃이 안 깨진다
CytoscapeGraph.tsx:371  edge[grp="review"] → 빨간 점선, 화살표 없음
GraphSection.tsx:283    "복습" 필터 칩 존재
```

금지된 것은 관계 타입별 다색(`EDGE_COLOR`)이지 review 강조색이 아니다. 신규 색 도입 없음.

#### 문구 — 판정이 아니라 선언

| 쓰지 말 것 (AI 판정) | 쓸 것 (사용자 선언) |
|---|---|
| "설명이 충분하지 않습니다" | "아직 모르겠다고 표시하셨어요" |

`relationMeta.ts:81` 이 이미 정확한 문장을 갖고 있다 — *"복습이 필요하다고 **표시한** 개념이에요."* 표시한 주체가 사용자다.

### 8. 개념 단위와 노트 단위를 섞지 않는다

`review_needed` 는 `Concept → Concept` 이다. **상태는 개념에 붙지 노트에 붙지 않는다.** 개념은 여러 노트에서 병합된다(`llm-output-schema.md` 중복 병합). "임계 구역"이 3주차·5주차 노트 양쪽에서 나왔다면 노트로 세는 순간 같은 무지가 2번 카운트된다.

- StudyHome 집계: **"아직 모르겠다고 표시한 개념 3개"** (노트가 아니라 개념)
- 클릭 동작: 노트를 여는 대신 **파인만 루프 재개**. 노트를 열어 봤자 사용자는 다시 뭘 해야 할지 모른다.
- 노트 하단 바: 그 노트를 `target` 으로 하는 `extracted_from` 의 source 개념들 ∩ `review_needed` 집합

### 9. 오프라인 / 에러 처리

- **무키 상태에서 파인만 루프는 비활성.** 토글을 끄고 "AI 정리 키를 넣으면 되묻기를 쓸 수 있어요"를 표시한다. `heuristicWiki` 는 헤딩 분해라 되묻기를 생성할 수 없다. **없는 걸 있는 척하지 않는다.**
- 루프 중 LLM 실패 → 대화를 메모리에 유지한 채 재시도 버튼. 작업을 잃지 않는다.
- `clarify_pending` 은 localStorage 로 복원하지 않는다 (`importStore.ts:73` 현행 규칙 유지 — 복원하면 Inbox 영구 잠금).
- 2차 생성에서 대상 개념이 사라짐 → `mark_review_needed` 스킵 + 경고 토스트. 크래시 금지.
- 모든 Rust 오류는 `AppError` 로 전파. `unwrap()` / `panic!()` 금지.

## 테스트

Rust (`cargo test`):
- `mark_review_needed` 가 self-loop 를 `relations.json` 에 기록한다
- `append_relations` 는 여전히 `review_needed` 를 거부한다 (회귀 방지)
- `mark_review_needed` 에 비-`review_needed` 타입 → 거부
- `mark_review_needed` 에 `source != target` → 거부
- `evidence` 빈 배열 → 거부
- 경로 traversal 방어 (기존 패턴 재사용)

TypeScript (`vitest`):
- `feynman.ts` 가 LLM 응답을 파싱하고, 구조화 출력 실패 시 throw
- `probeExplanation` 이 history 를 프롬프트에 누적한다
- 2차 생성 결과에 대상 개념이 없을 때 `mark_review_needed` 를 호출하지 않는다
- `computeDepth` 가 self-loop 를 무시해 계층이 안 깨진다 (기존 `:111` 보강)

## 스코프

| | 항목 | 근거 |
|---|---|---|
| **P0** | Rust 커맨드 2개 · `feynman.ts` · InboxSection 루프 UI · 그래프 빨간 테두리 | 이게 없으면 나머지의 데이터가 존재하지 않는다 |
| **P1** | 노트 하단 플로팅 바 | 조회만. 싸다 |
| **P2** | StudyHome 집계 → 루프 재개 · 트리 배지 | 기존 `nudges` 자리 교체 |
| **P3** | 힌트 사다리 (원문 PDF 페이지 점프) | `PageText`·`SourceRef.page` 이미 존재 |
| **P4** | 영어 PDF 번역 | 순수 신규. 사다리 2칸 안에서만 노출 |

P0 둘만 있어도 기능은 성립한다.

## 미결 사항

- `mark_review_needed` 의 `evidence` 문자열 포맷 — 사용자의 마지막 설명 원문을 넣을지, 메타 문장("N회 시도 후 미완")만 넣을지. 전자가 근거로서 정직하나 길이 제한 필요.
- 루프 라운드 수 상한. 무한 반복 방지 장치가 필요한가, 사용자 `[그만]` 만으로 충분한가.
- `[다른 개념으로]` 전환 시 이전 개념의 대화 히스토리를 유지할지 버릴지.

## 참고

- Rozenblit, L. & Keil, F. (2002). *The misunderstood limits of folk science: an illusion of explanatory depth.* Cognitive Science 26(5). — 설명 깊이의 착각
- [Socratic method — elenchus / aporia](https://en.wikipedia.org/wiki/Socratic_method)
- [The Feynman Technique Explained — Scott H. Young](https://www.scotthyoung.com/blog/the-feynman-technique-explained/) — 4단계 정식화의 출처(파인만 본인 아님)
