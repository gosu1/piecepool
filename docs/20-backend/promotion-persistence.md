# Promotion 영속화 — 노드 상태(nodeState) 계약변경 제안 (초안)

> **상태**: 제안 / 발의. 아직 확정 아님. post-MVP 후보.
> **성격**: `docs/10-contracts/` 계약변경을 수반한다 → `contracts-change` 라벨 + 4역할(Backend/Frontend/LLM/Design) review 필수. 절차: [10-contracts README](../10-contracts/README.md) "변경 절차".
> **설계 출처**: [30-llm/README](../30-llm/README.md) §E "연결성(Connectivity) — 그래프 품질 게이트" + "Node 상태 머신".
> **프로토타입**: `src/llm/promote.ts`(순수 연결성 게이트), `scripts/promote-preview.ts`(TTL 시뮬레이터), `src/llm/generate.ts`(현재는 **비영속 advisory**로만 부착).
> **추적 이슈**: (발의 시 생성) — 확정되면 본 문서를 근거로 10-contracts PR을 연다.

---

## 1. 배경 / 동기

[30-llm/README](../30-llm/README.md) §E는 그래프 노드의 상태 머신을 정의한다:

```text
[신규 조각] → STAGING ──(연결 ≥ 1)──► ACTIVE
                 │
        (TTL 초과 고립) ──► ARCHIVED   (완전 삭제 ❌, 재연결 시 복구)
```

현재 구현(`src/llm/generate.ts`)은 `promote()`를 매 생성 때 돌려 `WikiGenResult.promotion`으로 **부착만** 한다 — 세션 한정, 디스크에 남지 않는다. 그 결과:

- **STAGING 보류가 지속되지 않는다.** 앱을 껐다 켜면 "이 개념이 며칠째 고립인지"를 잃는다 → TTL 기반 ARCHIVED 판정 불가.
- **재연결 복구가 불가능하다.** 새 문서 유입 시 과거 고립 노드를 다시 평가하려면 이전 상태가 필요하다.
- **§E 상태 머신이 반쪽만 산다.** STAGING↔ACTIVE는 매번 재계산되지만 ARCHIVED(시간 축)는 영속 상태 없이는 구현 불가.

→ 노드 상태를 **디스크에 영속**해야 §E가 완성된다. 본 문서가 그 계약변경을 발의한다.

---

## 2. 제안 요약

1. **엔티티**: `Concept`에 선택 필드 `nodeState`, `stagedAt` 추가 ([entities.md](../10-contracts/entities.md) 변경).
2. **저장 위치**: 휘발성 그래프 메타데이터를 사용자 콘텐츠(wiki/archive)와 분리해 **`<space>/relations/graph-nodes.json`** 신설 ([workspace-layout.md](../10-contracts/workspace-layout.md) 변경). frontmatter에는 넣지 않는다(§5 근거).
3. **거버넌스**: `nodeState`는 **Backend 연결성 게이트가 계산**한다. LLM은 절대 부여하지 않는다(`review_needed`와 동일 원칙).
4. **하위호환**: 두 필드 모두 선택. 파일/필드 부재 = 전부 `active`로 간주(레거시 vault 무영향). 다음 import 때 lazy 초기화.

---

## 3. 계약 변경 — 엔티티 (`Concept`)

전체 타입 재정의가 아니라 **delta만** ([entities.md#concept](../10-contracts/entities.md) 참조):

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `nodeState` | `"staging" \| "active" \| "archived"` | ⛔ | 연결성 게이트가 부여. 부재 = `active`(레거시) |
| `stagedAt` | ISO 8601 string | ⛔ | STAGING 진입 시각. TTL(ARCHIVED 전환) 기준. `active`/`archived`면 무의미 |

추가할 필드 스니펫(전체 타입 아님):

```ts
// entities.md#concept 에 아래 2개 필드만 추가
nodeState?: "staging" | "active" | "archived";  // 연결성 게이트가 부여. 부재 = active
stagedAt?: string;                                // ISO 8601. STAGING 진입 시각(TTL 기준)
```

Rust 미러(`src-tauri/src/models/mod.rs`) — 기존 optional 패턴 재사용:

```rust
// NodeState enum 신설 (SourceType/RelationType/ImportJobStatus 와 동일 스타일)
#[serde(rename_all = "snake_case")]
pub enum NodeState { Staging, Active, Archived }

// Concept 구조체에 추가
#[serde(skip_serializing_if = "Option::is_none")]
#[ts(optional)]
pub node_state: Option<NodeState>,
#[serde(skip_serializing_if = "Option::is_none")]
#[ts(optional)]
pub staged_at: Option<String>,
```

TS 타입은 ts-rs 자동 생성(`npm run gen:types`) — 수동 편집 금지.

---

## 4. 저장 위치 — `graph-nodes.json` (권장)

`<space>/relations/graph-nodes.json` 신설. `relations.json` 옆에 두어 그래프 메타데이터를 한곳에 모은다. 인코딩은 `relations.json`과 동일(UTF-8, LF, 2-space indent).

conceptId → 노드 상태 맵:

```json
{
  "version": 1,
  "nodes": {
    "concept-self-attention": { "nodeState": "active",  "stagedAt": null,                          "degree": 3, "updatedAt": "2026-07-01T09:00:00+09:00" },
    "concept-obscure-term":   { "nodeState": "staging", "stagedAt": "2026-06-25T09:00:00+09:00",   "degree": 0, "updatedAt": "2026-07-01T09:00:00+09:00" }
  }
}
```

- `degree`는 마지막 평가 시점 연결 수 캐시(선택, 디버깅/시각화용).
- 노드 정체성은 `Concept.id`. wiki 파일은 `conceptId`로 이 맵과 join.

### 왜 frontmatter가 아니라 별도 파일인가 (핵심 근거)

`promote()`는 **매 import 라운드마다 전체 노드를 재평가**한다(고립 노드가 뒤늦게 연결되거나 TTL로 ARCHIVED 될 수 있으므로). 상태를 wiki frontmatter에 두면:

- 상태 플립만으로 사용자 편집 대상 `wiki/*.md`를 대량 재기록 → churn + `updatedAt` 노이즈.
- "WikiPage 본문 LLM 재생성 정책"([open-questions §5](../00-overview/open-questions.md), 미결)과 충돌 — 사용자 편집 보존 원칙 위협.
- [workspace-layout §5](../10-contracts/workspace-layout.md)의 "외부 에디터 미지원 자산은 별도 폴더에 격리" 가이드와도 어긋남.

별도 파일이면 재평가가 **json 1개만** 다시 쓰고 사용자 콘텐츠는 건드리지 않는다. archive 불가침 원칙과도 정렬.

---

## 5. TTL / 시계 결정

- **재평가 트리거 = 이벤트(import 라운드).** "새 문서 유입마다 재연결 시도"(§E)와 일치.
- **ARCHIVED 판정 = 시간(wall-clock).** `now - stagedAt ≥ ttlDays`면 ARCHIVED. 기간 개념이라 시각 기반이 자연스럽고, ISO 8601은 엔티티 관례이며, 전역 라운드 카운터를 영속할 필요가 없다.
- 프로토타입 `promote.ts`는 **시계 비의존**(round + ttl을 주입받음) — `round`에 "경과일", `ttlRounds`에 `ttlDays`를 넣으면 그대로 재사용된다. 코어 로직 변경 없음.
- `ttlDays` 기본값은 실데이터 튜닝 대상(`npm run promote`) — 문서상 미결 파라미터. config(예: `config/workspace.json` 또는 앱 설정)에 두고 엔티티에는 넣지 않는다.

---

## 6. 거버넌스 — LLM 금지 (중요)

`nodeState`는 **Backend 연결성 게이트(`import/`)가 LLM 출력 이후 계산**한다. `review_needed`가 "LLM 자동 부여 금지, 사용자 행동"인 것과 동형으로, `nodeState`는 "LLM 부여 금지, Backend 계산"이다.

- [llm-output-schema.md](../10-contracts/llm-output-schema.md)의 `LlmWikiResult`는 **무변경** — `nodeState`를 포함하지 않는다.
- 파이프라인 순서: LLM 추출 → 검증/정규화 → **연결성 게이트(promote) → graph-nodes.json 기록** → writing. [import-pipeline.md](import-pipeline.md)에 단계 추가.

---

## 7. 하위호환 / 마이그레이션

- 두 필드 모두 선택. `graph-nodes.json` 부재 또는 특정 conceptId 누락 = 해당 노드 `active`로 간주(레거시 vault를 소급 ARCHIVED 하지 않는다).
- 다음 import 때 Backend가 기존 `relations.json`으로 `promote()`를 1회 돌려 `graph-nodes.json`을 **lazy 초기화**. 파괴적 마이그레이션 없음.
- 롤백: 파일 삭제 시 전부 `active`로 되돌아감(무해).

---

## 8. 영향 범위

| 대상 | 변경 |
|---|---|
| [10-contracts/entities.md](../10-contracts/entities.md) | `Concept`에 `nodeState?`, `stagedAt?` 추가 |
| [10-contracts/workspace-layout.md](../10-contracts/workspace-layout.md) | `<space>/relations/graph-nodes.json` 신설 명세 |
| `src-tauri/src/models/mod.rs` | `NodeState` enum + `Concept` 필드 2개. ts-rs 재생성 |
| `src-tauri/src/storage/` | `graph-nodes.json` read/write(atomic) |
| `src-tauri/src/import/` | writing 전 연결성 게이트 실행 + 상태 기록 |
| `src/llm/generate.ts` | 현 비영속 `promotion` → 영속 상태 읽어와 round/ttl 주입 |
| [20-backend/import-pipeline.md](import-pipeline.md), [storage-io.md](storage-io.md) | 파이프라인/IO 단계 문서화(동기화 PR) |
| 40-frontend (그래프 뷰) | STAGING 흐리게/점선, ARCHIVED 기본 숨김+토글 (동기화 PR) |
| [llm-output-schema.md](../10-contracts/llm-output-schema.md) | **무변경**(LLM은 nodeState 미부여) |

---

## 9. 대안 검토 (기각)

- **현행 비영속 advisory 유지** — §E ARCHIVED(시간 축) 구현 불가. 세션 간 상태 소실. **기각**.
- **wiki frontmatter에 nodeState 저장** — 재평가 churn + 사용자 편집 충돌 위험(§5). **기각**.
- **relations.json에 nodes 섹션 병합** — 엣지 파일에 노드 상태를 섞으면 관심사 혼재 + 잦은 상태 쓰기가 엣지 데이터까지 재직렬화. 별도 파일이 더 깔끔. **기각(단, 파일 통합은 후속 재검토 여지)**.

---

## 10. 열린 하위질문 (오너 결정 필요)

1. 저장 위치 최종: `graph-nodes.json`(권장) vs frontmatter vs relations.json 병합.
2. `ttlDays` 기본값 + 단위(일 vs 라운드). 실데이터 튜닝 후 확정.
3. ARCHIVED 노드의 그래프 가시성 기본값(숨김+토글 권장).
4. STAGING(고립) 개념도 wiki 파일을 쓰는가 — **현행대로 쓴다** 권장(ARCHIVED도 파일 보존, 삭제 아님).
5. `degree` 캐시를 저장할지(디버깅 유용 vs 중복 데이터).

---

## 11. 롤아웃 단계

1. **Phase A — 계약**: entities.md + workspace-layout.md PR(`contracts-change`, 4역할 review). 본 문서를 근거로 첨부.
2. **Phase B — Rust**: `NodeState` + Concept 필드 + storage read/write + ts-rs 재생성.
3. **Phase C — 게이트 연결**: import/ 파이프라인에 promote 실행 + graph-nodes.json 기록. `generate.ts`는 영속 상태 주입.
4. **Phase D — 프론트**: 그래프 뷰 STAGING/ARCHIVED 시각화.
5. **Phase E — 튜닝**: `ttlDays` 실데이터 확정(`npm run promote`), open-questions에서 항목 제거.

---

## 12. 변경 절차 체크리스트

- [ ] 발의 이슈 생성, 본 문서 링크
- [ ] 10-contracts PR(entities.md + workspace-layout.md)에 `contracts-change` 라벨
- [ ] Backend / Frontend / LLM / Design 4역할 review 승인
- [ ] merge 후 20-backend / 30-llm / 40-frontend 동기화 PR을 이슈로 trace
- [ ] `docs-check`(link + ssot) green 확인 후 merge

---

## 13. 참고

- 설계: [30-llm/README](../30-llm/README.md) §E
- 엔티티 SSOT: [entities.md](../10-contracts/entities.md), [relation-types.md](../10-contracts/relation-types.md)
- 폴더 규약: [workspace-layout.md](../10-contracts/workspace-layout.md)
- 미결 파라미터: [open-questions.md](../00-overview/open-questions.md) (staging TTL, Concept 중복 판정)
- 로드맵: [post-mvp.md](../70-roadmap/post-mvp.md)
