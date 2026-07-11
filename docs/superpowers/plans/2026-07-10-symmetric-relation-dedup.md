# 대칭 관계 중복 엣지 제거 (contrasts / confused_with / related_to)

작성 2026-07-10. 조사 완료, 구현 완료 (테스트 통과, 앱 육안 확인 미실시).

## 증상

그래프 뷰에서 교감신경 ↔ 부교감신경 사이에 `contrasts` 점선이 2개 그려진다.

## 근본 원인

`contrasts` / `confused_with` / `related_to` 는 **대칭 관계**다 — `src/lib/relationMeta.ts:27` 이 `assoc` 그룹으로 묶고 "대칭 — 방향 무의미", `docs/40-frontend/graph-view.md:15` 가 화살표 제거 근거로 명시. 즉 `(A,B)` 와 `(B,A)` 는 같은 관계 하나여야 한다.

그런데 파이프라인 어디에도 대칭 정규화가 없다. LLM 이 양방향 두 건을 뱉으면 네 게이트를 모두 통과한다.

| 계층 | 위치 | 왜 못 막나 |
|---|---|---|
| LLM 검증 | `src/llm/validate.ts:101-111` | `review_needed` 거부 · node-compat · known-title 만 필터. 유일성 검사 없음 |
| 변환 | `src/lib/llmApply.ts` | `LlmRelation` 1개 → `Relation` 1개. 병합 없음 |
| **저장 (진범)** | `src-tauri/src/commands/graph.rs:142` | dedup 키가 `HashSet<(source_node_id, target_node_id, relation_type)>` — **순서 민감**. `(교감,부교감,Contrasts)` 와 `(부교감,교감,Contrasts)` 는 다른 키 |
| 렌더 | `src/lib/CytoscapeGraph.tsx:242` | `rels.map` 으로 Relation 1개당 엣지 1개. 접지 않음 → `curve-style: bezier` 가 평행 엣지를 두 곡선으로 벌림 |

`graph.rs:186` 주석은 `// 동일 엣지는 중복 저장 안 함` 이라 적혀 있으나, "동일 엣지" 를 방향까지 포함해 정의한 것이 버그다. 대칭 타입에는 틀린 정의.

> `llmApply.ts:200` 의 `slugOrHash(sourceTitle + targetTitle)` id 생성이 순서 민감한 것은 **원인이 아니다.** 그 id 는 dedup 키로 쓰이지 않고, `-${i}` 인덱스 접미사 때문에 어차피 항상 유일하다. (조사 중 오지목 → 검증으로 정정)

## 실제 오염 데이터

`~/PiecePool/` 워크스페이스에서 확인:

| 워크스페이스 | 개념 쌍 | Relation id 2개 | 타입 |
|---|---|---|---|
| `untitled-2`, `untitled-3` | 교감신경 ↔ 부교감신경 | `rel-c-24cf3c3f`, `rel-c-7cc64c9f` | `contrasts` |
| `untitled-2`, `untitled-3` | 인슐린 ↔ 글루카곤 | `rel-c-f9b4d7dd`, `rel-c-658ec3dd` | `contrasts` |
| `untitled` | concept-1 ↔ concept-2 | `rel-1-2-12`, `rel-2-1-13` | `confused_with` |

각 레코드에 `explanation` 이 따로 붙어 있다 ("인슐린이 글루카곤과 반대" / "글루카곤이 인슐린과 반대") — LLM 이 양방향으로 생성했다는 직접 증거.

부수 발견: `untitled` 의 `rel-t-t-14` 는 `used_in` 인데 `sourceNodeId == targetNodeId == "concept-t"` — **self-loop**. `relation-types.md:45` 는 self-loop 를 `review_needed` 에만 허용한다. `append_relations` 에 `source != target` 검사가 없어 통과했다.

## 구현 계획

### 0. 선결: SSOT 문서

`docs/10-contracts/relation-types.md` 에 대칭성 규정이 **없다**. 현재 대칭성은 프론트(`relationMeta.ts`)에만 인코딩돼 있다. Rust 가 이걸 알아야 하므로 계약 문서에 절을 추가한다.

- 새 절 `## N. 대칭성` — `contrasts` · `confused_with` · `related_to` 는 대칭. `(A,B)` 와 `(B,A)` 는 동일 관계이며 저장 시 하나로 접는다. 나머지 9종은 방향성.
- `review_needed` 외 타입의 self-loop 금지도 여기서 명문화 (현재는 `review_needed` 행에 "self-loop 허용" 이라고만 적혀 암묵적).
- **비용**: `docs/10-contracts/` 변경 → `contracts-change` 라벨 + 4개 역할 오너 전원 승인 (CLAUDE.md).

CI 확인 완료: `docs-check.yml:69` 의 "RelationType 3개 이상 나열" 체크는 `docs/**/*.md` 만 스캔하고 `::warning::` 수준이다. Rust 소스에 대칭 타입 3개를 나열해도 CI 는 안 막는다.

### 1. Rust — `src-tauri/src/commands/graph.rs`

`compat` (line 27) 옆에 헬퍼 2개 추가:

```rust
fn is_symmetric(rt: RelationType) -> bool {
    matches!(rt, RelationType::Contrasts | RelationType::ConfusedWith | RelationType::RelatedTo)
}

/// 대칭 관계는 (source,target) 을 정렬해 방향 차이를 지운다.
fn dedup_key(r: &Relation) -> (String, String, RelationType) {
    let (a, b) = (r.source_node_id.clone(), r.target_node_id.clone());
    if is_symmetric(r.relation_type) && a > b {
        (b, a, r.relation_type)
    } else {
        (a, b, r.relation_type)
    }
}
```

**`append_relations` (line 140):**
- `seen` HashSet 구성과 삽입을 `dedup_key(&r)` 로 교체.
- self-loop 처리: `r.source_node_id == r.target_node_id && r.relation_type != ReviewNeeded` 이면 **`Err` 반환이 아니라 조용히 skip.** 이유 — 기존 compat 위반은 `Err` 로 배치 전체를 실패시키는데, 지금 LLM 이 self-loop 를 내보내면 통과하고 있다. 여기서 `Err` 로 바꾸면 **지금까지 성공하던 임포트가 실패하는 회귀**가 된다. dedup 과 같이 skip 이 안전.

**`read_relations` (line 61):**
- 반환 직전 `dedup_key` 기준으로 첫 항목만 남기고 접는다.
- 효과: `graph_data` 도 `append_relations` 도 깨끗한 리스트를 받는다. **기존 워크스페이스의 중복선이 앱 재시작만으로 사라진다.** 별도 마이그레이션 스크립트 불필요 — 다음 `append_relations` 때 `write_relations` 가 정리된 배열을 디스크에 영속화한다.
- 읽기 시점 제거는 비파괴적(쓰기 전까지 파일 불변)이라 안전.
- **데이터 손실 주의**: 역방향 레코드의 `explanation` / `evidence` 는 버려진다. 대칭 관계라 거울 문장이므로 수용 가능. evidence 병합은 스코프 확대 — 하지 않는다.

### 2. `src/lib/mockIpc.ts:355`

`appendRelations` 가 무조건 append 한다. 파일 상단 주석이 "Rust graph.rs 와 같은 불변식을 브라우저에서도 지킨다" 고 선언하므로 같은 dedup 을 미러링한다. 안 하면 브라우저 dev 모드에서만 중복선이 계속 보인다.

### 3. 테스트 (pass condition)

`src-tauri/src/lib.rs:141` 에 이미 `append_relations` 테스트 블록이 있다. 거기 추가:

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | `(A,B,contrasts)` 저장 후 `(B,A,contrasts)` 저장 | `relations.json` 에 **1개** |
| 2 | `(A,B,part_of)` 저장 후 `(B,A,part_of)` 저장 | **2개** (방향성 타입은 접지 말 것) |
| 3 | 양방향 `contrasts` 가 이미 든 fixture 를 `read_relations` | **1개** 반환 |
| 4 | `(X,X,used_in)` 저장 | skip, `Err` 아님. 나머지 배치는 저장됨 |
| 5 | `mark_review_needed` (X,X,review_needed) | 기존대로 동작 (self-loop 허용) |

테스트 1·2 가 핵심이다. 2번이 없으면 `part_of` 계층축을 망가뜨리는 과잉 dedup 을 못 잡는다.

### 4. 실제 검증

`npm run tauri dev` 로 `untitled-3` 열고 교감신경 ↔ 부교감신경 사이 점선이 **1개**인지 눈으로 확인. 인슐린 ↔ 글루카곤도 동일.

### 5. PR

- 커밋 타입 `fix` → `journey.md` 여정 기록 면제 (CLAUDE.md: feat 만 필수).
- 단, `docs/10-contracts/relation-types.md` 를 건드리므로 `contracts-change` 라벨 + 오너 4명 승인 필요.
- 그래프 뷰가 바뀌므로 **비포/애프터 스크린샷 필수** (선 2개 → 1개). 에이전트는 캡처 불가 — 사용자가 첨부.

## 건드리는 파일

- `docs/10-contracts/relation-types.md` — 대칭성 절 신설 (contracts-change)
- `src-tauri/src/commands/graph.rs` — `is_symmetric`, `dedup_key`, `append_relations`, `read_relations`
- `src-tauri/src/lib.rs` — 테스트 5종
- `src/lib/mockIpc.ts` — dedup 미러링

`validate.ts` / `llmApply.ts` / `CytoscapeGraph.tsx` 는 **안 건드린다.** 저장 게이트 한 곳에서 접으면 상류·하류 모두 저절로 정상화된다.
