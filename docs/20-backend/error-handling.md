# Error Handling

백엔드 오류를 **어떻게 분류(`kind`)하고 · 위로 전달하고 · 사용자에게 표시**하는지 정의한다.
모든 Rust 모듈이 본 문서의 `kind` 레지스트리를 공유한다.

> SSOT 경계:
> - `AppError` **타입 골격**은 코드 `src-tauri/src/error.rs`.
> - **`kind` 분류 + 처리 정책**은 본 문서가 단일 출처.
> - LLM 어댑터 **내부 재시도/검증**은 [`../30-llm/output-validation.md`](../30-llm/output-validation.md) (본 문서가 그 분류를 백엔드 전체로 흡수).
> - frontmatter 검증 규칙 = [`../10-contracts/markdown-frontmatter.md §4`](../10-contracts/markdown-frontmatter.md), embed 충돌 = [`../10-contracts/wikilink-embed.md`](../10-contracts/wikilink-embed.md), 노드 호환성 = [`../10-contracts/relation-types.md`](../10-contracts/relation-types.md). **본 문서에 규칙 복붙 금지 — 링크만.**

---

## 1. 책임 범위

| 다루는 것 | 다루지 않는 것 |
|---|---|
| `AppError.kind` 분류 체계 (백엔드 전 영역) | LLM 어댑터 내부 재시도 매트릭스 → `output-validation §4` |
| 오류 전파 규칙 (`?` → command 경계 변환) | frontmatter **검증 항목** 정의 → `markdown-frontmatter §4` |
| 치명적 오류 vs 경고 구분 | TS/프론트 표시 UI → `40-frontend/` (작성 예정) |
| 영역별(저장/PDF/embed/relation) 처리 정책 | 노드 호환성 **매트릭스** → `relation-types §6` |

---

## 2. AppError 구조 & 전파 규칙

```rust
// src-tauri/src/error.rs — 골격은 코드가 SSOT, 본 문서는 kind 값만 규정
pub struct AppError {
    pub kind: String,    // 본 문서 §3 레지스트리의 값만 허용
    pub message: String, // 로그/디버그용 상세 (사용자 메시지는 §6에서 kind→문구 매핑)
}
```

### 전파 흐름

```
내부 모듈 함수: Result<T, AppError>  ──(?로 전파)──►
  storage/ · pdf/ · import/ ...
      └─► commands/ 경계에서 AppError → String 변환 (§7)
              └─► Frontend invoke() reject (JS Error)
```

규칙:
- **fatal 오류만** `AppError`로 만들어 `?`로 전파한다(= 함수 즉시 중단). 분류는 §4.
- **warn / partial은 오류가 아니다.** `AppError`로 만들지 않으며 `?`로 전파하지 않는다 — 성공 값에 **동봉**해 반환한다. `?`로 던지면 "계속 진행/저장 허용" 정책을 위반한다(예: `watcher` 실패로 앱이 멈춤, `embed_unresolved`로 저장 전체가 막힘).
  - 운반 형태: `Outcome<T> { value: T, warnings: Vec<Warning> }` — warn·partial을 성공 결과에 실어 나른다.
- `unwrap()` · `expect()` · `panic!()` 은 **프로덕션 코드 금지**. (CLAUDE.md §Backend Architecture Rules)
- `commands/` 함수만 `Result<T, String>` 반환 — 그 외 계층은 끝까지 `AppError`(fatal) / `Outcome`(warn·partial) 유지.
- `kind`는 §3 레지스트리에 **없는 값을 새로 만들지 않는다**. 새 분류가 필요하면 본 문서에 먼저 추가.

---

## 3. `kind` 레지스트리 (SSOT)

`AppError.kind`에 허용되는 값의 **전체 목록**. 영역별로 그룹.

### 3.1 저장 / 파일 (`storage/`)

| kind | 의미 | 처리 |
|---|---|---|
| `io_read` | 파일 읽기 실패 | 중단 — 사용자 알림 |
| `io_write` | 파일 쓰기 실패 (디스크/권한) | 중단 — atomic write 롤백(§5.1) |
| `not_found` | 요청한 경로/ID 없음 | 중단 — 사용자 알림 |
| `path_invalid` | 절대경로 / null byte / 잘못된 slug 등 형식 오류 | 중단 — 보안상 거부 (`safe_join`) |
| `path_traversal` | `..` 등으로 workspace 루트 탈출 시도 | 중단 — 보안상 거부 (`safe_join`) |
| `archive_conflict` | 기존 ArchiveNote 덮어쓰기 시도 | 중단 — 원문 보호(§5.2), 절대 덮어쓰지 않음 |
| `watcher` | 파일 변경 감시(`notify`) 초기화 실패 | **경고** — mtime 폴링 폴백(§5.6), warn 로그 |

### 3.2 PDF (`pdf/`)

| kind | 의미 | 처리 |
|---|---|---|
| `pdf_extract` | PDF 파싱/텍스트 추출 불가 | 중단 — 사용자 알림 |
| `pdf_encrypted` | 암호화/열람 제한으로 파싱 불가 | 중단 — 해제 후 재업로드 유도(§6) |
| `pdf_page_range` | 요청 page가 총 page 초과 | **경고** — 첫 page 렌더 + 메시지(§5.3), crash 금지 |

### 3.3 검증 (`import/` · `storage/` 저장 직전)

| kind | 의미 | 처리 |
|---|---|---|
| `frontmatter_invalid` | frontmatter 검증 실패 (`markdown-frontmatter §4`) | 중단 — 저장 거부 |
| `relation_invalid` | 노드 호환성 매트릭스 위반 (`relation-types §6`) | **부분** — 해당 relation만 drop(§5.4) |
| `sourceref_invalid` | SourceRef의 page가 PDF 범위 밖 등 무효 (`output-validation §3.4`) | **부분** — 해당 SourceRef만 drop, Concept은 저장(§5.7) |
| `embed_unresolved` | `![[...]]` 대상 파일 없음 | **경고** — 깨진 링크 표시, 저장 허용(§5.5) |

### 3.4 LLM (어댑터 origin — `output-validation §7` 흡수)

| kind | 의미 | 사용자 메시지 출처 |
|---|---|---|
| `auth` | 401 / 403 (API 키) | → `output-validation §7` |
| `network` | timeout / DNS / llama-server 연결 실패 | → `output-validation §7` |
| `rate_limit` | 429 | → `output-validation §7` |
| `schema` | JSON Schema 위반 (재시도 후) | → `output-validation §7` |
| `empty` | 추출 concept 0개 | → `output-validation §7` |
| `partial` | 부분 실패 (일부만 저장) | → `output-validation §7` |

### 3.5 기타

| kind | 의미 | 처리 |
|---|---|---|
| `internal` | 분류 불가한 내부 오류 | 중단 — 로그 + 일반 메시지 |

> ⚠️ 리뷰 메모: `architecture.md §4`의 예시 kind(`io`/`pdf`/`schema`/`llm_timeout`)는 본 표로 대체된다.
> (`io`→`io_read`/`io_write` 분리, `llm_timeout`→`network`로 통합 — `output-validation §7`과 정렬)

---

## 4. 치명적 오류 vs 경고

저장 자체를 **막느냐**로 구분한다. 이 구분이 사용자 경험의 핵심.

| 분류 | 동작 | 해당 kind |
|---|---|---|
| **중단(fatal)** | 작업 실패, `ImportJob.status=failed` + `errorMessage`. **`?`로 전파** | `io_*`, `not_found`, `path_invalid`, `path_traversal`, `archive_conflict`, `pdf_extract`, `pdf_encrypted`, `frontmatter_invalid`, `auth`, `network`, `rate_limit`, `schema`, `empty`†, `internal` |
| **부분(partial)** | 유효 부분만 저장, `status=completed` + 경고 배지. **`Outcome`에 동봉** | `relation_invalid`, `sourceref_invalid` |
| **경고(warn)** | 저장 허용, 사용자에게 표시만. **`Outcome`에 동봉** | `pdf_page_range`, `embed_unresolved`, `watcher` |

> **경고는 절대 자동 삭제·자동 수정하지 않는다.** 사용자에게 상태만 표시. (`wikilink-embed §충돌 처리`)
>
> † `empty` 종결 분류는 **미확정(B2)** — `output-validation §3.6`은 비실패 종료(`completed_empty`)로 보나 entities.md `ImportJobStatus` enum엔 해당 값이 없음. `contracts-change` 논의 후 확정 (이번 PR 범위 밖).
>
> 참고: 위 "해당 kind"에서 `partial`은 제외했다 — `partial`은 **등급(분류) 이름**이지 멤버 kind가 아니다(자기 분류 순환 방지). 부분 저장의 실제 원인 kind는 `relation_invalid`·`sourceref_invalid`다.

---

## 5. 영역별 처리 정책

### 5.1 저장 실패 — atomic write 롤백
`io_write` 발생 시 임시 파일을 정리하고 기존 파일은 손상 없이 유지한다. (절차 상세: `storage-io.md` 작성 예정 @ChangSik88)

### 5.2 archive 덮어쓰기 보호
`archive/`의 기존 ArchiveNote는 LLM 결과로도 **절대 덮어쓰지 않는다**. 충돌 시 `archive_conflict`로 중단. (`workspace-layout §3.4`)

### 5.3 PDF page 초과
`[[file.pdf#page=N]]`의 N이 총 page를 넘으면 crash 없이 **첫 page를 렌더**하고 `pdf_page_range` 경고를 표시한다. (`wikilink-embed.md`)

### 5.4 relation 부분 실패
노드 호환성 위반 relation은 해당 항목만 drop하고 나머지는 저장한다. drop 내역은 `ImportJob.errorMessage`에 기록. (형식: `output-validation §5.2`)

### 5.5 embed 깨진 링크
`![[...]]` 대상이 `sources/original-files/` 아래 없으면 `embed_unresolved` 경고만 표시. 저장은 허용, frontmatter `sourceRefs`와 본문 불일치도 자동 수정 금지. (`wikilink-embed §충돌 처리`)

### 5.6 파일 감시 초기화 실패
`notify` watcher 초기화가 실패해도 **앱은 중단하지 않는다**. `watcher` 경고를 남기고 mtime 폴링으로 폴백한다. (`storage-io.md §3.2~3.3` @ChangSik88)

### 5.7 SourceRef 무효 (부분)
`SourceRef.page`가 PDF 총 page를 벗어나는 등 무효이면 **해당 SourceRef만 drop**하고 Concept은 정상 저장한다. drop 사실은 에러가 아니라 `Outcome.warnings`로 전달한다. (`output-validation §3.4`)

---

## 6. 사용자 메시지 규약

- 전 메시지 **한국어**, 사용자가 다음 행동을 알 수 있게 작성.
- LLM origin(§3.4) 문구는 `output-validation §7` 사용 (중복 정의 금지).
- 백엔드 origin 문구 예시:

| kind | 사용자 메시지(예시) |
|---|---|
| `io_write` | "파일을 저장하지 못했습니다. 디스크 공간/권한을 확인하세요." |
| `not_found` | "대상을 찾을 수 없습니다." |
| `archive_conflict` | "원문 노트는 덮어쓸 수 없습니다." |
| `path_traversal` | "허용되지 않는 경로 접근이 차단되었습니다." |
| `watcher` | "파일 변경 감지를 시작하지 못했습니다. 외부 편집이 자동 반영되지 않을 수 있습니다." |
| `pdf_extract` | "PDF에서 텍스트를 추출하지 못했습니다. 파일을 확인하세요." |
| `pdf_encrypted` | "암호화된 PDF입니다. 잠금을 해제한 뒤 다시 업로드해주세요." |
| `pdf_page_range` | "요청한 page가 문서 범위를 벗어나 첫 page를 표시합니다." |
| `sourceref_invalid` | "일부 근거 참조(page)가 유효 범위를 벗어나 제외됐습니다." |
| `frontmatter_invalid` | "문서 메타데이터 형식이 올바르지 않아 저장하지 못했습니다." |
| `embed_unresolved` | "연결된 원본 파일을 찾을 수 없습니다. (링크 깨짐)" |
| `internal` | "알 수 없는 오류가 발생했습니다. 다시 시도하세요." |

---

## 7. command 경계 변환

`commands/` 함수는 `AppError`를 `String`으로 변환해 반환한다.

```rust
// 권장: AppError → String (commands 계층에서만)
inner_call().map_err(|e| e.to_string())?  // "[kind] message" 형식 (error.rs Display)
```

프론트는 reject된 문자열에서 `kind`를 파싱하거나, 후속 개선으로 `{ kind, message }` 객체 직렬화를 검토한다(post-MVP, `ipc-api.md` 오류 규약과 조율).

---

## 8. 변경 이력 노트

- 신규 작성 (@O6west). `AppError` 골격 = `src-tauri/src/error.rs`, LLM 분류 = `output-validation §7` 흡수.
- §3 레지스트리는 다른 백엔드 문서(`architecture.md §4` 등)의 kind 예시를 대체하는 SSOT다.
- 향후 `AppError`를 enum으로 강타입화할지 여부는 `architecture.md` 리뷰와 함께 결정(현재 `kind: String`).
- 후속 수정(@ChangSik88 리뷰 반영): warn·partial은 `?` 전파 대신 `Outcome<T>` 동봉으로 모델 정정(B1), §4 "해당 kind"에서 `partial` 이중사용 제거(보완2), `sourceref_invalid`(보완1)·`pdf_encrypted` 추가. `empty` 종결 분류(B2)는 `contracts-change` 논의 대기.
