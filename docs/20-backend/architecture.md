# 백엔드 아키텍처

Tauri + Rust 백엔드의 모듈 경계, 의존성 흐름, IPC 진입점, 에러 핸들링 설계도.  
새 백엔드 개발자가 전체 구조를 한 번에 파악할 수 있도록 작성되었다.

> 엔티티 타입 · 워크스페이스 레이아웃 · LLM 출력 스키마 등 모든 계약(contracts)의 SSOT는
> [`../10-contracts/`](../10-contracts/) 폴더다. 이 문서에 타입 정의나 JSON 스키마를 복붙하지 않는다.

---

## 1. 모듈 경계 및 디렉터리 구조

```
src-tauri/src/
├── main.rs          ← 바이너리 진입점 — lib.rs::run() 호출만. 로직 금지.
├── lib.rs           ← 전체 모듈 연결 · Tauri Builder 설정 · command 등록.
├── error.rs         ← 단일 AppError { kind, message }. 모든 모듈이 이 타입을 전파.
│
├── models/          ← entities.md 1-to-1 Rust 미러. ts-rs로 TS 타입 자동 생성.
│   └── mod.rs
│
├── commands/        ← Tauri IPC 표면. 얇은(thin) 레이어 — 비즈니스 로직 없음.
│   ├── mod.rs
│   └── workspace.rs
│
├── storage/         ← 파일 I/O 전담. 경로 해석 · atomic write · 외부 변경 감지.
│   └── mod.rs
│
├── import/          ← ImportJob 상태머신 · 파이프라인 오케스트레이션.
│   └── mod.rs
│
├── pdf/             ← PDF → 텍스트 추출 · 페이지 인덱싱. 다른 기능 없음.
│   └── mod.rs
│
└── seed/            ← 최초 실행 시 데모 데이터 생성. UI 레이어에 하드코딩 금지.
    └── mod.rs
```

### 각 모듈의 책임

| 모듈 | 단일 책임 | 금지 사항 |
|---|---|---|
| `main.rs` | 바이너리 엔트리 — `run()` 1줄 | 어떤 로직도 추가 불가 |
| `lib.rs` | 모듈 wire-up + Tauri 설정 | 직접 비즈니스 로직 작성 금지 |
| `error.rs` | `AppError` 정의 · `Display` 구현 | 복수 에러 타입 생성 금지 |
| `models/` | 엔티티 struct/enum 선언 + ts-rs 연결 | 직접 DB/파일 접근 금지 |
| `commands/` | IPC 파라미터 수신 → 내부 모듈 위임 → 결과 반환 | 비즈니스 로직 · 파일 I/O 직접 작성 금지 |
| `storage/` | `tokio::fs` 비동기 파일 읽기/쓰기 · 경로 해석 | LLM 호출 · 상태 전이 금지 |
| `import/` | `ImportJob` 상태 전이 · 파이프라인 단계 조율 | 직접 파일 쓰기(storage 위임) · LLM 호출(TS 위임) 금지 |
| `pdf/` | PDF 바이너리 → 텍스트/메타데이터 변환 | 결과 저장 금지 (storage에 위임) |
| `seed/` | 데모 데이터 fixture 정의 · storage 통해 기록 | 프로덕션 데이터 경로 변경 금지 |

---

## 2. 모듈 간 의존성 흐름

의존성은 **단방향**이다. 아래 방향으로만 호출이 허용된다.

```
Frontend (React/TS)
      │  invoke()
      ▼
  commands/          ← Tauri IPC 표면
      │
      ├──► storage/  ← 파일 읽기/쓰기
      │
      ├──► import/   ← ImportJob 오케스트레이션
      │       │
      │       └──► storage/   (파일 영속화)
      │       └──► pdf/       (텍스트 추출 요청)
      │       └──► [TS llm/]  (LLM 호출은 TS 계층으로 역방향 불가)
      │
      └──► pdf/      ← 텍스트 추출 직접 요청 (선택적)

  models/            ← 모든 모듈이 참조 (의존성 방향 없음 — 공유 타입 전용)
  error.rs           ← 모든 모듈이 참조 (동일)
```

### 역방향 호출 금지 원칙

- `storage/`는 `commands/`나 `import/`를 호출하지 않는다.
- `pdf/`는 `storage/`나 `import/`를 호출하지 않는다.
- `import/`는 LLM을 직접 호출하지 않는다 — TS `src/llm/` 어댑터가 완료 후 Rust를 통해 영속화한다.
- `models/`와 `error.rs`는 순수 공유 타입 모듈이다 — 어떤 모듈도 호출하지 않는다.

### LLM 제어권 분리

LLM 오케스트레이션(요약 · 개념 추출 · 관계 매핑)은 **Rust가 아닌 TypeScript `src/llm/`** 이 담당한다.  
Rust `import/`는 파이프라인 상태(idle → parsing → archiving → llm_processing → writing → completed)를 추적하고
TS 계층의 완료 신호를 받아 결과를 파일에 기록하는 역할만 수행한다.  
이 결정의 근거는 [`ipc-api.md` §1 규약](./ipc-api.md)과 CLAUDE.md §LLM Provider Rules에 명시되어 있다.

---

## 3. IPC 진입점 개요 (Frontend ↔ Backend)

Frontend의 모든 Rust 호출은 `commands/` 모듈을 통해서만 진입한다.

### 얇은(Thin) 레이어 원칙

`commands/` 함수는 다음 세 가지만 수행한다:

1. **파라미터 수신**: Tauri `invoke()` 페이로드를 Rust 타입으로 역직렬화.
2. **내부 모듈 위임**: `storage/`, `import/`, `pdf/` 등에 실제 작업을 위임.
3. **결과 또는 에러 반환**: `Result<T, String>` — Frontend가 처리할 수 있는 형식으로 직렬화.

비즈니스 로직을 `commands/`에 작성하면 CI 리뷰에서 기각된다.

### 타입 직렬화 파이프라인

```
entities.md (SSOT)
    └─► models/mod.rs  [#[derive(TS, Serialize, Deserialize)]]
            └─► (ts-rs) src/lib/generated/*.ts   ← TS가 그대로 사용
                    └─► src/lib/ipc.ts            ← invoke() 래퍼
```

`npm run gen:types`로 Rust → TS 타입을 재생성한다. **생성된 파일을 직접 편집하지 않는다.**

### 현재 등록된 command

상세 스펙은 [`ipc-api.md`](./ipc-api.md) 참조.

| command | 상태 | 담당 모듈 |
|---|---|---|
| `get_workspace` | ✅ 구현됨 | `commands::workspace` → `storage/` |
| `list_spaces`, `create_space` 등 | 🔜 MVP 예정 | `commands/` → `storage/` |
| `extract_pdf_text` | 🔜 MVP 예정 | `commands/` → `pdf/` |
| `save_source`, `save_wiki_page` 등 | 🔜 MVP 예정 | `commands/` → `storage/` |

---

## 4. 통합 에러 핸들링

### AppError 구조

```rust
pub struct AppError {
    pub kind: String,    // 오류 분류 (예: "io", "schema", "pdf", "llm_timeout")
    pub message: String, // 사용자/로그용 메시지
}
```

`AppError`는 `serde::Serialize`를 구현하므로 Tauri IPC를 통해 Frontend로 그대로 전달된다.

### 에러 전파 규칙

- 모든 내부 함수는 `Result<T, AppError>`를 반환하고 `?` 연산자로 전파한다.
- `unwrap()` · `expect()` · `panic!()` 은 **프로덕션 코드에서 절대 사용하지 않는다**.
- `commands/` 함수는 `AppError`를 `String`으로 변환하여 반환한다 — Frontend `invoke()` reject 페이로드가 된다.

```
내부 모듈 에러
    └─► AppError { kind, message }
            └─► commands/ 에서 .to_string()
                    └─► Frontend → invoke() reject (JS Error)
```

### kind 값 규약 (예시)

| kind | 발생 위치 | 의미 |
|---|---|---|
| `"io"` | `storage/` | 파일 읽기/쓰기 실패 |
| `"pdf"` | `pdf/` | PDF 파싱 불가 |
| `"schema"` | `import/` | LLM 출력 검증 실패 |
| `"not_found"` | `storage/` | 요청한 경로/ID 없음 |
| `"llm_timeout"` | `import/` | TS llm/ 응답 타임아웃 |

상세 에러 처리 가이드는 `error-handling.md` (작성 예정)를 참조한다.

---

## 관련 문서

| 문서 | 내용 |
|---|---|
| [`../10-contracts/entities.md`](../10-contracts/entities.md) | 엔티티 타입 SSOT |
| [`../10-contracts/workspace-layout.md`](../10-contracts/workspace-layout.md) | 파일 경로 규약 |
| [`./ipc-api.md`](./ipc-api.md) | Tauri command 전체 목록 및 페이로드 스펙 |
| `./import-pipeline.md` | ImportJob 상태 전이 상세 (작성 예정) |
| `./storage-io.md` | atomic write · fs watch 설계 (작성 예정) |
| `./error-handling.md` | kind 분류 · 사용자 메시지 규약 (작성 예정) |
