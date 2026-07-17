# Storage I/O 설계

`storage/` 모듈의 핵심 설계 원칙. 파일 경로 해석, 원자적 쓰기, 외부 수정 감지를 다룬다.

> **계층 경계**: 이 모듈은 **오직 파일 I/O에만 집중한다.** LLM 오케스트레이션, Import 파이프라인의 상태 전이, PDF 추출 로직은 절대 이 계층에 섞이지 않는다. 비즈니스 로직은 `import/` 또는 상위 계층이 소유한다.

폴더 트리와 파일 명명 규약은 이 문서에서 다루지 않는다 → [`docs/10-contracts/workspace-layout.md`](../10-contracts/workspace-layout.md)

---

## 1. 경로 해석 (Path Resolution)

### 1.1 기본 원칙

`storage/` 모듈은 두 개의 루트 경로를 인자로 받아 동작한다.

| 변수명           | 의미                                    |
| ---------------- | --------------------------------------- |
| `workspace_root` | 사용자가 선택한 Workspace 폴더 절대경로 |
| `space_root`     | `workspace_root/<space-slug>/`          |

모든 하위 경로는 이 두 루트에서 **`Path::join`으로만** 구성한다. 문자열 연산(포맷 매크로, `+` 연산자)으로 경로를 조합하지 않는다.

```rust
// 올바른 예시
let archive_dir = space_root.join("archive");
let target = archive_dir.join(filename);

// 금지
let target = format!("{}/archive/{}", space_root.display(), filename);
```

### 1.2 Path Traversal 방지

외부에서 주입되는 slug, 파일명, 상대경로는 위험 컴포넌트를 거부한 뒤 루트 안에 있는지 확인한다.

```rust
use std::path::Component;

/// 반환된 경로가 `base` 하위임을 보장한다. 아니면 AppError 반환.
fn safe_join(base: &Path, untrusted: &str) -> Result<PathBuf, AppError> {
    // 1. null byte, 절대경로 접두사 즉시 거부
    if untrusted.contains('\0') || Path::new(untrusted).is_absolute() {
        return Err(AppError::path_invalid(untrusted));
    }
    let joined = base.join(untrusted);
    // 2. ParentDir(`..`) 컴포넌트를 명시적으로 거부.
    //    주의: Path::components()는 `.`와 중복 구분자만 제거할 뿐
    //    `..`는 보존하므로, starts_with() 검사만으로는 탈출을 막지 못한다.
    if joined.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(AppError::path_traversal(untrusted));
    }
    // 3. 최종 안전망: base가 결과 경로의 prefix인지 확인
    if !joined.starts_with(base) {
        return Err(AppError::path_traversal(untrusted));
    }
    Ok(joined)
}
```

거부 대상:

- `..`(ParentDir) 컴포넌트를 포함하는 경로
- 절대경로 (`/`, `C:\` 등)
- null byte `\0`

> 중복 구분자(`//` 등)는 `Path::components()`가 정규화해 흡수하므로 별도 거부 대상이 아니다. 단, `..`는 정규화되지 않으므로 위와 같이 명시적으로 거부해야 한다.

### 1.3 OS별 경로 구분자

Rust의 `std::path::Path`/`PathBuf`는 OS 네이티브 구분자를 자동 처리한다. 직접 `/`나 `\`를 하드코딩하지 않는다. 직렬화(JSON 저장, IPC 응답)할 때만 `/`로 정규화한다.

```rust
// IPC 직렬화 시
path.to_string_lossy().replace('\\', "/")
```

---

## 2. 원자적 쓰기 (Atomic Write)

### 2.1 왜 필요한가

`archive/`, `wiki/`, `relations/` 파일은 사용자의 학습 자산이다. 쓰기 도중 앱 충돌이 발생하면 파일이 반쯤 쓰인 채로 남아 데이터가 손상된다. 원자적 쓰기는 이를 방지한다.

### 2.2 메커니즘: tmp → rename

```
[1] 대상 파일과 같은 디렉토리에 임시 파일 생성
      <target> + ".tmp"  (예: self-attention.md.tmp, relations.json.tmp)

[2] 임시 파일에 전체 내용 기록

[3] 임시 파일을 flush + sync (fsync)

[4] rename(tmp → target)  ← OS 수준 원자 연산
```

같은 파티션 내 `rename`은 POSIX 및 Windows 모두에서 원자적이다. 크로스-파티션 이동은 원자성을 보장하지 않으므로 임시 파일은 반드시 **대상 파일과 동일한 디렉토리**에 생성한다.

```rust
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;

async fn write_atomic(target: &Path, content: &[u8]) -> Result<(), AppError> {
    // with_extension은 마지막 확장자를 "교체"하므로 사용 금지
    // (relations.json → relations.md.tmp 같은 손상 유발).
    // 파일명 뒤에 ".tmp"를 그대로 덧붙인다.
    let mut tmp = target.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp_path = PathBuf::from(tmp);

    // 1. 임시 파일 쓰기
    let mut file = fs::File::create(&tmp_path).await
        .map_err(AppError::io_write)?;
    file.write_all(content).await.map_err(AppError::io_write)?;
    file.flush().await.map_err(AppError::io_write)?;
    file.sync_all().await.map_err(AppError::io_write)?; // 파일 데이터 디스크 반영
    drop(file);

    // 2. 원자 교체
    fs::rename(&tmp_path, target).await.map_err(AppError::io_write)?;

    // 3. (선택) 크래시 내구성을 위해 부모 디렉토리 fsync.
    //    rename 자체는 원자적이나, 메타데이터 반영을 보장하려면
    //    부모 디렉토리 핸들에 sync가 필요하다. MVP에서는 생략 가능.
    Ok(())
}
```

실패 시 `.tmp` 파일이 남을 수 있으므로 앱 시작 시 잔여 `.tmp` 파일을 정리하는 초기화 단계를 `lib.rs`에서 수행한다.

### 2.3 `tokio::fs` 비동기 I/O 원칙

- `storage/` 내 모든 파일 I/O는 `tokio::fs`를 사용한다. `std::fs`는 동기 컨텍스트(테스트, 초기화 단계)에서만 허용한다.
- `tokio::fs::File`은 `sync_all`/`sync_data`를 제공하므로 fsync에 별도 `spawn_blocking`이 필요 없다. `spawn_blocking`은 `tokio::fs`로 표현하기 어려운 동기 전용 연산(예: 부모 디렉토리 핸들 fsync, 일부 OS 전용 API)에 한해 제한적으로 사용한다.
- 동일 파일에 대한 동시 쓰기는 호출자 계층(`import/`)에서 직렬화한다. `storage/`는 잠금을 소유하지 않는다.

### 2.4 `relations.json` 쓰기

`relations.json`은 Markdown과 달리 전체 파일을 교체하는 방식으로 갱신한다. 위 `write_atomic`을 그대로 적용하고, 인코딩 요건은 계약을 따른다: UTF-8, LF, 2-space indent.

```rust
let json = serde_json::to_string_pretty(&relations)?;
let bytes = json.replace("\r\n", "\n"); // 플랫폼 무관 LF 보장
write_atomic(&relations_path, bytes.as_bytes()).await?;
```

---

## 3. 외부 수정 감지 (External Modification Detection)

### 3.1 배경

PiecePool은 VS Code 등 외부 에디터와 동일한 파일을 공유한다. 앱이 열린 상태에서 사용자가 외부 에디터로 `wiki/` 또는 `archive/` 파일을 수정하면, 앱은 이를 인지해야 한다.

### 3.2 감지 전략: `notify` 크레이트

MVP에서는 OS 네이티브 파일시스템 이벤트를 활용한다.

| 크레이트                                    | 역할                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------- |
| [`notify`](https://crates.io/crates/notify) | OS fs 이벤트 구독 (`inotify` / `FSEvents` / `ReadDirectoryChangesW`) |
| `tokio::sync::mpsc`                         | notify 이벤트 → 비동기 채널 전달                                     |

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

pub async fn watch_space(
    space_root: PathBuf,
    tx: mpsc::Sender<FsEvent>,
) -> Result<(), AppError> {
    let (ntx, mut nrx) = mpsc::channel(64);
    // 초기화 실패는 panic하지 않고 AppError로 전파한다 (4.3절: 호출자가 mtime 폴백으로 전환).
    let mut watcher = RecommendedWatcher::new(
        move |res| { let _ = ntx.blocking_send(res); },
        notify::Config::default(),
    ).map_err(AppError::watcher)?;

    watcher.watch(&space_root, RecursiveMode::Recursive)
        .map_err(AppError::watcher)?;

    while let Some(Ok(event)) = nrx.recv().await {
        if let Some(fs_event) = classify_event(&event) {
            let _ = tx.send(fs_event).await;
        }
    }
    Ok(())
}
```

감지 대상 이벤트:

| 이벤트 종류                    | 처리                                        |
| ------------------------------ | ------------------------------------------- |
| `Modify` (wiki, archive `.md`) | 프론트엔드에 `file-changed` 이벤트 전파     |
| `Create` (새 `.md`)            | 프론트엔드에 `file-created` 이벤트 전파     |
| `Remove`                       | 프론트엔드에 `file-removed` 이벤트 전파     |
| `Rename`                       | `file-removed` + `file-created` 쌍으로 분해 |
| `Modify` (`.tmp` 파일)         | **무시** — 앱 자체 쓰기 중 발생             |

### 3.3 mtime 폴링 (폴백)

`notify`가 지원되지 않는 환경(원격 마운트 드라이브, 일부 WSL2 구성)을 위한 폴백이다. 앱 시작 시 각 파일의 `mtime`을 스냅샷으로 기록하고, 일정 간격으로 비교한다.

- 폴링 주기: 30초 (배터리 소모 최소화)
- `notify` 이벤트와 mtime 폴링 중 **하나라도** 변경을 감지하면 동일 처리 흐름으로 합류한다
- mtime은 해상도가 거칠고(일부 FS에서 1초 단위), 빠른 연속 편집 시 값이 갱신되지 않을 수 있어 변경을 놓칠 수 있다. 따라서 보조 수단으로만 사용한다

### 3.4 프론트엔드 이벤트 전파

`storage/` 모듈은 변경 사실을 채널로 상위(`lib.rs`)에 전달한다. `lib.rs`가 Tauri 이벤트 채널을 통해 프론트엔드로 발행한다.

```
[OS fs event]
      │
  notify watcher  (storage/)
      │
  mpsc::Sender<FsEvent>
      │
  lib.rs 이벤트 루프
      │
  tauri::AppHandle::emit("space:file-changed", payload)  // Tauri v2 API
      │
  Frontend (React)
```

`storage/`는 `tauri::AppHandle`을 직접 참조하지 않는다. 채널 분리로 테스트 용이성을 확보한다.

### 3.5 충돌 처리 정책

외부 수정 감지 후 앱 내부에 미저장 변경이 함께 있는 경우:

- **`archive/`**: 앱은 절대 자동 병합하지 않는다. 프론트엔드에 "외부 변경 감지" 배너를 표시하고 사용자가 선택하도록 한다.
- **`wiki/`**: LLM이 쓰는 계층이므로, 외부 수정이 감지된 파일에 LLM 결과를 바로 덮어쓰지 않는다. `import/` 계층이 충돌 여부를 먼저 확인하도록 `storage/`가 `last_known_mtime`을 노출한다.

---

## 4. 오류 처리

- 모든 함수는 `Result<T, AppError>`를 반환한다. `unwrap()`/`panic!()`은 금지한다.
- 파일 I/O 실패는 읽기/쓰기 기준으로 `kind`를 구분한다: 읽기 실패는 `io_read`, 쓰기 실패(디스크/권한)는 `io_write`. `io_write`는 atomic write 롤백 대상이다.
- 파일을 찾지 못한 경우(`NotFound`)와 권한 오류(`PermissionDenied`)는 `io_read`/`io_write`와 별개로 세분해 프론트엔드가 적합한 UI 메시지를 표시할 수 있도록 한다.
- watcher 초기화 실패는 치명적 오류가 아니다. mtime 폴링 폴백으로 전환하고 warn 로그를 남긴다.

---

## 5. 테스트 가이드

- `write_atomic` 도중 프로세스 종료를 시뮬레이션하려면 `.tmp` 파일을 남긴 채 재시작 후 정리 로직이 동작하는지 확인한다.
- Path Traversal 테스트: `"../.config/workspace.json"`, `"/etc/passwd"` 등을 `safe_join`에 넣어 `AppError` 반환을 검증한다.
- fs watch 테스트: 실제 tmpdir에 파일을 생성/수정해 이벤트가 mpsc 채널로 도착하는지 확인한다. `tauri::AppHandle` 없이 채널만으로 검증 가능하다.
