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
- 모든 내부 함수는 `Result<T, AppError>` 반환, `?`로 전파한다.
- `unwrap()` · `expect()` · `panic!()` 은 **프로덕션 코드 금지**. (CLAUDE.md §Backend Architecture Rules)
- `commands/` 함수만 `Result<T, String>` 반환 — 그 외 계층은 끝까지 `AppError` 유지.
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
| `path_invalid` | workspace 경계 밖 경로 / 잘못된 slug | 중단 — 보안상 거부 |
| `archive_conflict` | 기존 ArchiveNote 덮어쓰기 시도 | 중단 — 원문 보호(§5.2), 절대 덮어쓰지 않음 |

### 3.2 PDF (`pdf/`)

| kind | 의미 | 처리 |
|---|---|---|
| `pdf_extract` | PDF 파싱/텍스트 추출 불가 | 중단 — 사용자 알림 |
| `pdf_page_range` | 요청 page가 총 page 초과 | **경고** — 첫 page 렌더 + 메시지(§5.3), crash 금지 |

### 3.3 검증 (`import/` · `storage/` 저장 직전)

| kind | 의미 | 처리 |
|---|---|---|
| `frontmatter_invalid` | frontmatter 검증 실패 (`markdown-frontmatter §4`) | 중단 — 저장 거부 |
| `relation_invalid` | 노드 호환성 매트릭스 위반 (`relation-types §6`) | **부분** — 해당 relation만 drop(§5.4) |
| `embed_unresolved` | `![[...]]` 대상 파일 없음 | **경고** — 깨진 링크 표시, 저장 허용(§5.5) |

### 3.4 LLM (어댑터 origin — `output-validation §7` 흡수)

| kind | 의미 | 사용자 메시지 출처 |
|---|---|---|
| `auth` | 401 / 403 (API 키) | → `output-validation §7` |
| `network` | timeout / DNS / Ollama 연결 실패 | → `output-validation §7` |
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
| **중단(fatal)** | 작업 실패, `ImportJob.status=failed` + `errorMessage` | `io_*`, `not_found`, `path_invalid`, `archive_conflict`, `pdf_extract`, `frontmatter_invalid`, `auth`, `network`, `rate_limit`, `schema`, `empty`, `internal` |
| **부분(partial)** | 유효 부분만 저장, `status=completed` + 경고 배지 | `relation_invalid`, `partial` |
| **경고(warn)** | 저장 허용, 사용자에게 표시만 | `pdf_page_range`, `embed_unresolved` |

> **경고는 절대 자동 삭제·자동 수정하지 않는다.** 사용자에게 상태만 표시. (`wikilink-embed §충돌 처리`)

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
| `pdf_extract` | "PDF에서 텍스트를 추출하지 못했습니다. 파일을 확인하세요." |
| `pdf_page_range` | "요청한 page가 문서 범위를 벗어나 첫 page를 표시합니다." |
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
