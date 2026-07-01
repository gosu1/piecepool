# Frontend Architecture

PiecePool 프론트엔드(`src/`)의 라우팅 · 상태 관리 · IPC 호출 구조. **React + TypeScript + Tailwind + Tauri 2.x** 기반.

> 본 문서는 프론트엔드 레이어 구조의 단일 출처다. 엔티티 타입은 재정의하지 않고 [`../10-contracts/entities.md`](../10-contracts/entities.md)에 link한다.

상태: ✅ 구현됨 · 🔜 MVP 예정

---

## 1. 디렉터리 구조

```
src/
  App.tsx            # 라우팅 + 좌측 네비게이션 셸
  main.tsx           # React 진입점
  screens/           # URL 1개 = 화면 1개
  store/             # Zustand store (🔜)
  lib/
    ipc.ts           # Tauri command 래퍼 (invoke()는 여기에만)
    types.ts         # 엔티티 타입 배럴 (re-export)
    generated/       # ts-rs 자동생성 타입 (수동 편집 금지)
```

원칙: **화면은 `screens/`, 전역 상태는 `store/`, 백엔드 통신은 `lib/ipc.ts`** 한 곳으로 모은다.

---

## 2. 라우팅

**라이브러리**: `react-router-dom` v7 (`BrowserRouter`). 정의 위치 = [`../../src/App.tsx`](../../src/App.tsx).

| URL | 화면 | 상태 |
|---|---|---|
| `/` | → `/inbox` 리다이렉트 (첫 진입 화면) | ✅ |
| `/inbox` | `InboxScreen` — 자료 가져오기 (텍스트/PDF/이미지 OCR) | ✅ |
| `/wiki` | `WikiViewScreen` — Concept 중심 탐색 | ✅ |
| `/graph` | `GraphViewScreen` — 타입 있는 지식 그래프 | ✅ |
| `/editor` | `MarkdownEditorScreen` — archive/wiki 편집 | ✅ |
| `/workspace` | `WorkspaceScreen` — Workspace 설정 | ✅ |

- 첫 진입 = `/inbox` (근거: [`../00-overview/scope-mvp.md`](../00-overview/scope-mvp.md) §2.3).
- **화면 추가**: `screens/`에 컴포넌트 생성 → `App.tsx`의 `<Routes>`에 `<Route>` 1줄 추가 → 필요 시 `NAV` 배열에 항목 추가.

---

## 3. 상태 관리

**라이브러리**: [Zustand](https://github.com/pmndrs/zustand) v5. Provider 없이 컴포넌트에서 hook으로 직접 구독한다.

선택 근거: 화면 5개 규모의 로컬 앱에 맞는 경량 라이브러리. 보일러플레이트가 적고 TypeScript 타입 추론이 자연스럽다. (결정 기록: [#16](https://github.com/gosu1/piecepool/issues/16))

### Store 구성 (🔜)

| Store | 파일 | 담는 것 |
|---|---|---|
| `useWorkspaceStore` | `store/workspaceStore.ts` | 현재 `Workspace`, 선택된 `KnowledgeSpace` |
| `useImportStore` | `store/importStore.ts` | `ImportJob` 진행 상태 (`status`, `errorMessage`) |

타입은 [`../10-contracts/entities.md`](../10-contracts/entities.md)의 `Workspace` · `KnowledgeSpace` · `ImportJob`을 그대로 사용한다 (재정의 금지).

### 사용 패턴

```ts
// 읽기 — selector로 필요한 값만 구독 (불필요한 리렌더 방지)
const workspace = useWorkspaceStore((s) => s.workspace);

// 쓰기 — action 함수 호출
const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
```

원칙: **IPC로 받은 데이터를 store에 넣고, 화면은 store에서 꺼내 쓴다.** 화면 로컬 전용 상태(입력 폼 값 등)는 `useState`로 둔다.

---

## 4. IPC 호출 패턴

React(TS) ↔ Rust(Tauri) 통신. command 계약 = [`../20-backend/ipc-api.md`](../20-backend/ipc-api.md).

### 규칙: `invoke()` 직접 호출 금지

```ts
// ❌ 금지 — 컴포넌트에서 invoke 직접 호출
import { invoke } from "@tauri-apps/api/core";
invoke("get_workspace");

// ✅ 사용 — lib/ipc.ts 래퍼 함수
import { getWorkspace } from "../lib/ipc";
const ws = await getWorkspace();
```

`invoke()`는 [`../../src/lib/ipc.ts`](../../src/lib/ipc.ts)에서만 사용한다. 한 곳에 모아 command 명세를 강제하고 타입을 고정한다.

### 타입 흐름 (SSOT)

```
docs/10-contracts/entities.md      # 설계 (사람이 작성)
        ↓
src-tauri/src/models/mod.rs        # Rust 구현 (런타임 SSOT)
        ↓  npm run gen:types  (ts-rs)
src/lib/generated/*.ts             # 자동생성 — 수동 편집 금지
        ↓
src/lib/types.ts                   # re-export 배럴
        ↓
컴포넌트 / store에서 import
```

**이점**: Rust 모델을 바꾸면 TS 타입이 자동 동기화되어 프론트–백 타입 불일치가 원천 차단된다.

### 새 command 추가 순서

1. [`../20-backend/ipc-api.md`](../20-backend/ipc-api.md)에 command 추가 (계약 먼저)
2. Rust에서 command 구현
3. `npm run gen:types` 실행 (타입 생성)
4. `lib/ipc.ts`에 래퍼 함수 추가

오류 규약은 [`../20-backend/ipc-api.md`](../20-backend/ipc-api.md) §1을 따른다 (`Result<T, AppError>` → reject).

---

## 5. 기능 토글 (clarify / fact-check)

단일 tier이며 플랜 전환 UI는 없다. 되묻기(clarify)·fact-check는 유료 플랜이 아니라 **기본 on, env 토글**로 동작한다 ([`../00-overview/pricing-model.md`](../00-overview/pricing-model.md) §6).

---

## 6. 의존 문서

- [`../10-contracts/entities.md`](../10-contracts/entities.md) — 엔티티 타입 (SSOT)
- [`../20-backend/ipc-api.md`](../20-backend/ipc-api.md) — Tauri command 계약
- [`../00-overview/scope-mvp.md`](../00-overview/scope-mvp.md) — MVP 범위, 첫 진입 화면
- [`../00-overview/pricing-model.md`](../00-overview/pricing-model.md) — 단일 tier · 기능 토글
- [`README.md`](README.md) — 40-frontend 영역 개요
