# 노드 우선도 및 클릭 빈도 처리 아키텍처

> **상태**: Draft — 리뷰 전
> **SSOT 참조**: [entities.md](../10-contracts/entities.md) · [workspace-layout.md](../10-contracts/workspace-layout.md) · [markdown-frontmatter.md](../10-contracts/markdown-frontmatter.md) · [storage-io.md](./storage-io.md) · `src-tauri/src/commands/graph.rs`
> **계약 변경 여부**: **없음** (§6 참조) — 일반 1-reviewer PR + `journey.md` feat row로 충분

---

## 0. 배경과 문제

그래프 뷰의 노드(=`Concept`/`WikiPage`)는 현재 **구조적 이분류**만 갖는다. `get_graph`(`commands/graph.rs`)가 `relations.json`에서 in/out degree를 계산해 `kind = "core" | "result"`로 나누는 게 전부다. `GraphNode` DTO에는 연속적 **중요도(priority)** 필드가 없어, 노드 크기·라벨 노출·레이아웃 우선순위를 데이터로 구동할 수 없다.

우선도를 산정하려면 여러 팩터가 필요하고, 그중 하나가 **클릭 빈도**(사용자가 특정 노드의 wiki 문서를 얼마나 자주 여는가)다. 클릭 빈도는 다른 팩터와 성질이 근본적으로 다르다 — **고빈도로 발생하고, 휘발성이며, 기기별 행동 데이터**다. 이 데이터를 "어디에 어떻게 쌓을 것인가"가 이 문서의 핵심 결정이다.

---

## 1. 두 개의 관통 원칙

1. **우선도(priority)는 저장하는 엔티티가 아니라 파생값(derived value)이다.** 매 그래프 조회 시 계산한다. 저장하지 않으므로 `entities.md` 계약을 건드리지 않는다.
2. **클릭 빈도는 vault 자산이 아니라 기기별 텔레메트리다.** 사용자 학습 자산(`archive/`, `wiki/`, `relations/`)과 물리적으로 분리해, 동기화·외부 에디터·계약의 경계 **밖**에 둔다.

---

## 2. 왜 클릭 빈도를 vault 본문·핵심 파일에 넣으면 위험한가 (아키텍처 근거)

이 프로젝트에서 `wiki/*.md`, `archive/*.md`, `relations/relations.json`은 전부 **사용자 학습 자산**이자 **외부 에디터 호환 동기화 대상**이다. 여기에 클릭 카운터를 섞으면 백엔드 아키텍처의 4개 계약과 정면충돌한다.

### 2.1 외부 에디터/동기화 자산 오염 — 본문 충돌
`workspace-layout.md §5`는 "외부 에디터 미지원 자산(예: `relations.json`)은 **별도 폴더에 격리해 본문 충돌을 피한다**"고 명시한다. `wiki/*.md`는 사람이 읽고 외부 에디터·git·iCloud로 동기화하는 파일이다. 클릭 1회마다 이 파일을 다시 쓰면:
- `updatedAt`이 계속 갱신되어, **의미 없는 diff**가 하루에 수백 번 발생(git/동기화 폴더가 "변경됨"으로 오염).
- 사용자가 외부 에디터로 같은 파일을 열어둔 상태에서 카운터 쓰기가 끼어들면 **양방향 덮어쓰기 충돌**.

### 2.2 SSOT 계약 비용 — 4역할 승인
`entities.md`·`markdown-frontmatter.md`·`workspace-layout.md`는 SSOT다. 여기 `clickCount`/`priority` 필드를 추가하는 순간 `contracts-change` 라벨 + **Backend·Frontend·LLM·Design 4역할 전원 승인** + CI `docs-check`/`ssot-check`가 걸린다. 선례: 선택 필드 `tags` 하나 추가(2026-06-25)도 4역할 review를 거쳤다. **기기별 휘발성 카운터를 팀 공용 스키마에 밀어넣는 것은 거버넌스 낭비**다.

### 2.3 fs-watch 외부 수정 충돌
`storage-io.md §3`의 `notify` 워처는 `wiki/`·`archive/` `.md`의 외부 `Modify` 이벤트를 **충돌로 간주**해 "외부 변경 감지" 배너를 띄운다(무시 대상은 `.tmp`뿐). 카운터 쓰기가 감시 대상 파일을 건드리면 self-write가 `file-changed`를 폭주시키고, 사용자의 외부 에디터 편집과 겹치면 **거짓 충돌**을 만든다.

### 2.4 원자적 whole-file 쓰기 = write amplification
`storage/mod.rs`의 쓰기는 전부 **tmp 파일 생성 → `fs::rename`** 방식의 whole-file 교체다. 카운터 하나 올리려고 WikiPage `.md` 전체 또는 `relations.json` 배열 전체를 매번 다시 쓰는 것은 명백한 write amplification이고, 동시 사용자 편집을 클로버할 위험까지 얹는다.

### 2.5 계층 경계 위반
클릭 집계는 파일 I/O(`storage/`)도, 저장 엔티티(`models/`)도, import 시퀀싱(`import/`)도 아닌 **파생·행동 데이터**다. 억지로 기존 엔티티 파일에 얹으면 각 모듈의 단일 책임이 깨진다.

### 2.6 결론
클릭 빈도는 **재생성 가능한 soft signal**이다. 크래시로 유실돼도 사용과 함께 다시 쌓인다. 따라서 `archive/`가 요구하는 내구성(원자 쓰기·덮어쓰기 금지)을 **줄 필요도 없고**, 그 자산을 이 데이터 때문에 **위험에 빠뜨려서도 안 된다**. → 반드시 격리한다.

---

## 3. 클릭 빈도 3원칙(A/B/C) 평가

| 원칙 | 판정 | 근거 | 보강 사항 |
|---|---|---|---|
| **A. 인메모리 버퍼링** | ✅ **채택** | 클릭은 초 단위 고빈도 이벤트. 매 클릭 disk write = §2.4 write amplification + §2.3 워처 폭주. 인메모리 누적이 정답. | 버퍼 위치를 확정해야 함(§4.2). 크래시 시 마지막 flush 이후분 유실 → B로 완화(§4.3에서 유실 허용 범위를 명시). |
| **B. 주기적 플러시** | ✅ **채택 + 보강** | A의 유실 위험을 시간 상한으로 제한. flush = whole-file JSON 1회 → 저렴. | **순수 타이머만으로 부족.** 트리거를 (1) 주기/디바운스 + (2) **앱 종료** + (3) space 전환/blur 3종으로 확장(§4.3). |
| **C. 분리된 메타데이터 파일** | ✅ **방향 정확, 위치 강화 필요** | frontmatter·relations.json 오염 회피(§2.1) — 필수. | **"별도 파일"을 `<space>/` 안에 두면 여전히 `workspace-layout.md` 계약 변경 + vault 동기화 대상.** → vault **밖** app-local 디렉토리로 밀어야 계약·충돌을 원천 차단(§4.1). |

**핵심 조정**: A·B는 그대로 채택. C는 "분리"에서 한 걸음 더 나아가 **vault 외부(app-local)로 분리**한다. 이렇게 하면 계약 변경이 0이 되고 §2의 모든 위험이 사라진다.

---

## 4. 채택 아키텍처 — 클릭 빈도 처리

### 4.1 저장 위치: app-local `node-stats.json` (원칙 C 강화)
클릭 빈도는 **기기별(per-device) 행동 데이터**이므로 포터블 vault가 아닌 **Tauri app-local 데이터 디렉토리**(`app_data_dir`)에 둔다.

```
<app_data_dir>/PiecePool/stats/node-stats.json     ← vault 밖. 동기화·워처·계약 경계 밖.
```

이 위치가 사는 이유:
- `workspace-layout.md`(SSOT) **미변경** → 4역할 승인 불요.
- git/외부 에디터/동기화 폴더 밖 → §2.1 본문 충돌·sync noise 원천 차단.
- `notify` 워처의 감시 트리(vault) 밖 → self-write가 `file-changed`를 발생시키지 않음(§2.3 해소).
- 기기별 사용 패턴이 기기별로 유지 → 다기기 병합 지옥 회피(오히려 랭킹이 더 정확).

> **trade-off**: 기기 간 클릭 빈도 미공유. MVP에서 허용. 다기기 병합이 필요해지면 post-MVP에서 병합 정책과 함께 vault 내 이관을 재검토한다(§8).

### 4.2 인메모리 버퍼 (원칙 A) — 위치
버퍼는 **프론트엔드(TS) in-memory**에 둔다.
- 클릭은 프론트 그래프 뷰(Cytoscape/MiniGraph)에서 발생하고, ADR-0007의 "TS가 상호작용·오케스트레이션을 소유" 방침과 정합.
- 현재 Rust 코드에 `tauri::State`/managed-state 패턴이 없어 Rust 버퍼는 신규 인프라 도입 비용이 큼.
- 계층 경계: 집계·타이머(비즈니스 로직)를 `storage/`·`commands/`에 넣지 않고 프론트가 소유 → Rust는 **flush 커맨드 1개**만 얇게 노출.

### 4.3 플러시 정책 (원칙 B)
프론트 버퍼 → 단일 IPC 커맨드 `flush_node_stats(space, deltas)` → Rust `storage`가 app-local `node-stats.json`을 read-merge-atomic-write.

플러시 트리거 3종:
| 트리거 | 구현 | 목적 |
|---|---|---|
| **주기/디바운스** | 프론트 `setInterval` 60초 또는 누적 N클릭 도달 시 | 정상 유실 상한 |
| **앱 종료** | Tauri v2 `getCurrentWindow().onCloseRequested` → preventDefault → flush await → close | 세션 마지막분 보존 |
| **space 전환/blur** | 라우팅 이탈 / `visibilitychange(hidden)` | 컨텍스트 이탈 시 확정 저장 |

flush는 **델타 병합**(현재 파일 read → 카운트 가산 → atomic write)이라, 여러 기기가 아니라 한 세션 내에서도 안전하게 누적된다.

**크래시/강제 종료 유실 허용 정책(Tolerable Data Loss)**: 정상 종료(`onCloseRequested`)는 flush를 기다리지만, OS 강제 종료(taskkill, 정전, 크래시)는 이 훅을 우회하므로 방어 불가능하다. 이 경우 **마지막 주기 플러시(최대 60초) 이후 누적된 클릭 데이터의 유실을 정책적으로 허용(tolerable)한다.** 근거: §2.6에서 정의했듯 클릭 빈도는 재생성 가능한 soft signal이며, 손실 상한이 "최대 1분치 클릭"으로 명확히 bounded돼 있고, 그 이상의 durability(예: WAL, 매 클릭 즉시 fsync)를 확보하는 비용이 §2.4가 지적한 write amplification·워처 폭주 문제를 다시 불러오기 때문이다. `archive/`·`wiki/` 같은 손실 불가 자산과 달리, 이 데이터는 **정확성보다 저비용·저마찰이 우선**이다.

### 4.4 데이터 흐름
```
[graph node click] (React)
      │ increment
      ▼
 TS in-memory buffer  { conceptId: deltaClicks }        (A)
      │ 60s / N-click / on-quit / on-blur                (B)
      ▼
 invoke("flush_node_stats", { space, deltas })
      ▼
 commands/  (thin)  ──►  storage/ (app-local 경로 해석 + read-merge-atomic-write)
      ▼
 <app_data_dir>/PiecePool/stats/node-stats.json          (C, vault 밖)
      ▲
      │ read (1회)
 get_graph()  ──►  priority 산정에 clicks 입력 (§5)
```

### 4.5 파일 스키마 (`node-stats.json`)
```jsonc
{
  "operating-systems": {                    // space slug
    "concept-paging": { "clicks": 42, "lastClickedAt": "2026-07-05T14:03:00+09:00" },
    "concept-virtual-memory": { "clicks": 17, "lastClickedAt": "2026-07-04T21:11:00+09:00" }
  }
}
```
- `storage/`의 기존 `read_json`/`write_json`(atomic tmp+rename) 재사용. 단, vault-root 기반 경로 함수와 **분리된 app-local 경로 헬퍼**(예: `app_stats_path()`)를 추가한다.
- `lastClickedAt`을 함께 저장해, 후속에서 "최근 클릭 가중(클릭 recency decay)"을 계약 변경 없이 확장할 여지를 남긴다.

### 4.6 Eviction 정책 (Garbage Collection, Post-MVP)
`node-stats.json`은 무기한 append-only 구조가 아니다. concept이 삭제되거나 오래 방치되면 통계 항목이 죽은 채로 파일에 남아 앱 사용 기간에 비례해 파일이 무한히 커진다. MVP 이후 다음 **Eviction 정책**을 도입한다:

- **대상**: `lastClickedAt`이 **6개월(180일)** 이상 경과했거나, 누적 `clicks`가 임계치(예: 3회) 미만인 노드 항목.
- **시점**: 앱 시작 시 1회, `node-stats.json` 로드 직후 스윕(사용자 조작과 무관한 백그라운드 정리 — flush 경로와 별개).
- **동작**: 대상 항목을 맵에서 제거 후 즉시 atomic write로 되쓴다. 삭제된 concept(더 이상 `relations.json`/`wiki/`에 없는 id)도 같은 스윕에서 함께 정리한다.
- **범위**: MVP 범위 아님 — 파일 크기가 실질적 문제가 되는 시점(수천 concept 규모)에 맞춰 우선순위를 재평가한다. 성급하게 구현하지 않는다(Karpathy 원칙: 문제가 실재할 때 푼다).

---

## 5. 노드 우선도 산정 알고리즘

### 5.1 팩터
전부 space 내에서 정규화(0–1) 후 가중 합산. 가중치는 초기값이며 실제 그래프로 튜닝한다.

| # | 팩터 | 신호 | 데이터 출처 | 초기 가중치 |
|---|---|---|---|---|
| 1 | **Graph centrality** | in+out degree (허브 개념) | `relations.json` — **get_graph가 이미 계산** | 0.35 |
| 2 | **Edge quality** | 인접 엣지의 `strength·confidence` 합 | `relations.json` | 0.15 |

**팩터 1·2에서 제외하는 관계** (`graph.rs::counts_toward_priority`) — `kind`(core/result) 판정에도 동일 적용:

- **`review_needed`** — 사용자가 "아직 모르겠다"고 붙인 마커이지 지식 구조가 아니다. 팩터 1의 신호는 **"허브 개념"**이고, 표시했다는 사실은 그 개념이 허브라는 근거가 못 된다.
- **self-loop**(`source_node_id == target_node_id`) — 한 노드의 in/out을 동시에 올리고 `edge_quality`를 두 번 더해 **이중 계산**된다.

빼지 않으면 표시하는 행위가 그 노드를 키우고(`size = 6 + priority*30`), `out == 0 && inn > 0`으로 판정하던 result 노드를 core로 뒤집는다 — 크기·색이 사용자 표시로 오염돼 **"크다 = 중요하다"**가 깨진다. 관계 자체는 `get_graph`가 그대로 반환한다(프런트가 빨간 테두리를 그리는 근거).
| 3 | **Click frequency** | 사용자 실제 주목도 | app-local `node-stats.json` (§4) | 0.25 |
| 4 | **Recency** | `updatedAt` 기반 신선도 decay | wiki frontmatter — **get_graph가 이미 읽음** | 0.15 |
| 5 | **Source-backing** | `sourceIds`/`sourceRefs` 수 (근거 탄탄함) | wiki frontmatter — **get_graph가 이미 읽음** | 0.10 |

> 5개 중 4개(1,2,4,5)는 `get_graph`가 **이미 읽거나 계산하는 데이터**다. 추가 I/O는 `node-stats.json` 1회 read뿐 → 사실상 무비용.

### 5.2 정규화 & 공식
```
raw_click(n)  = ln(1 + clicks(n))          // 로그 스케일: 핫 노드 1개가 전체를 압도하는 것 방지
norm_f(n)     = (raw_f(n) - min_f) / (max_f - min_f)   // space 내 min-max; max==min 이면 0
priority(n)   = clamp( Σ_f  w_f · norm_f(n),  0, 1 )
```
- **정규화는 space 단위**로 한다(그래프 내 상대 비교가 목적).
- 클릭은 로그 스케일 후 정규화해 편향을 완화한다.
- v1은 **누적 클릭 수**를 그대로 쓴다. 시간 감쇠(최근 클릭 가중)는 v1 이후 확장 과제로 §8에 구체화한다.

### 5.3 계산 위치 & DTO
- **위치**: `commands/graph.rs::get_graph`가 이미 degree 맵 + wiki frontmatter를 조립하므로, 그 파이프라인 끝에 priority를 계산한다.
- **경계**: 순수 점수 계산은 별도 헬퍼 `fn score(...) -> f32`(또는 규모가 커지면 소형 `priority` 모듈)로 빼서 `commands/`의 thin 원칙을 지킨다. (참고: get_graph는 이미 degree·kind 분류를 인라인으로 수행 중이므로 private fn 수준도 기존 관행과 정합 — §8 결정 항목.)
- **DTO 확장**: `GraphNode`에 `pub priority: f32` 1필드 추가. `GraphNode`는 `entities.md` 엔티티가 아니라 **graph.rs 커맨드 DTO**이므로 **계약 변경 아님**.
- **프론트**: `priority`를 노드 크기 / 불투명도 / 라벨 노출 임계(graph-view.md §4의 progressive disclosure)에 매핑.

### 5.4 콜드스타트 · graceful degrade
- 클릭 데이터가 없는 새 그래프: factor 3의 정규화 입력이 전부 0 → 우선도는 **구조적 팩터(1·2·4·5)만으로** 계산됨. 자연스러운 폴백.
- `node-stats.json` 부재/파손: 빈 맵으로 취급, 크래시 없음(§`storage`의 `exists` 가드 패턴 재사용).

---

## 6. 계약 영향 요약

| 변경 대상 | 계약 문서? | 비용 |
|---|---|---|
| `GraphNode += priority: f32` | ❌ (graph.rs DTO, entities 아님) | 무료 |
| app-local `node-stats.json` | ❌ (vault 밖, workspace-layout 아님) | 무료 |
| `flush_node_stats` 커맨드 신규 | ❌ (IPC 표면 추가일 뿐) | 무료 |
| entities.md / frontmatter / workspace-layout | **미변경** | — |

→ `contracts-change` 라벨·4역할 review **불필요**. **일반 1-reviewer PR** + `journey.md` feat row 1줄로 충분.

---

## 7. 구현 체크리스트 (per-step 검증)

1. **Rust**: `storage`에 `app_stats_path()` + `read_node_stats`/`write_node_stats`(atomic) 추가 → *검증*: 유닛 테스트로 read-merge-write 왕복.
2. **Rust**: `flush_node_stats(space, deltas)` 커맨드 등록 → *검증*: `cargo test` + 델타 병합 정확성.
3. **Rust**: `get_graph`에 priority 계산 헬퍼 + `GraphNode.priority` → *검증*: 알려진 relations/clicks 픽스처로 점수 스냅샷.
4. **TS**: 클릭 in-memory 버퍼 + 3종 flush 트리거(주기/종료/blur) → *검증*: 강제 종료 시 유실이 마지막 주기(§4.3 정책상 최대 60초) 이내인지.
5. **TS**: `priority` → 노드 크기/라벨 매핑 → *검증*: 우선도 높은 노드가 크게·라벨 우선 노출.
6. **가중치 상수화**: §5.1 가중치를 코드 상단 상수로 → 튜닝 용이.

**Pass 조건**: 클릭이 많은 노드가 콜드스타트 그래프에서도 구조적으로 합당하게 커지고, 강제 종료 후 재시작 시 클릭 누적이 (마지막 flush 주기 이내로) 보존되며, `docs-check`/`ssot-check` CI가 green(계약 미변경 확인).

---

## 8. 열린 질문

1. **버퍼 위치**: TS 버퍼(권장) vs Rust managed-state. → TS 권장, 확정 필요.
2. **점수 로직 위치**: graph.rs private fn(최소) vs 신규 `priority` 모듈(경계 순수). → 규모 보고 결정.
3. **per-device vs per-vault**: MVP는 per-device(app-local) 권장. 다기기 클릭 공유 요구 시 병합 정책 재설계.
4. **시간 감쇠(Time Decay) 공식 도입** — v1 이후 과제, 두 가지 후보를 구체화한다:
   - **(a) 반감기(Half-life) 방식**: `decayed_click(n) = clicks(n) · 0.5^(days_since_last_click / H)`. `H`(half-life, 예: 30일) 하나만 튜닝하면 되고 해석이 직관적("30일 지나면 절반으로 감가")이라 우선 후보.
   - **(b) 지수 이동 평균(EMA) 방식**: 매 클릭마다 `score = α·1 + (1-α)·score_prev`를 flush 시점에 갱신. 스트리밍 갱신이 가능해 "누적 클릭 수" 필드 자체를 대체할 수 있지만, `α` 튜닝이 덜 직관적이고 flush 호출 시점(§4.3의 배치 델타 병합)과 결합하려면 병합 순서에 따라 결과가 달라지지 않도록 delta 적용 로직을 다시 설계해야 한다.
   - **잠정 결론**: (a) 반감기 방식이 현재 §4.5 스키마(`clicks` 누적치 + `lastClickedAt`)를 그대로 재사용할 수 있어 마이그레이션 비용이 없다 — **1순위 후보**. `priority` 계산 시 `raw_click(n)`을 `ln(1+clicks(n))`에서 `ln(1+decayed_click(n))`으로 교체하는 정도의 변경으로 §5.2 공식과 호환된다. (b)는 스키마 자체를 바꿔야 해 채택 시 별도 마이그레이션 계획 필요.
   - 이 항목은 v1 출시 후 실사용 클릭 분포를 관찰한 뒤 `H` 또는 `α` 값을 정하고 확정한다.
5. **가중치 초기값**: §5.1은 출발점 — 실제 그래프 A/B로 조정.
6. **Eviction 정책 세부(§4.6)**: 6개월·3회 임계값은 잠정치. 실사용 데이터 축적 후 재조정.
