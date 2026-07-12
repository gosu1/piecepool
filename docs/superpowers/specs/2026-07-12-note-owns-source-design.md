# 원본은 노트에 종속된다 — 설계

- 날짜: 2026-07-12
- 브랜치: `feat/note-owns-source`
- 대상: `src/app/panes/InboxSection.tsx`, `src/app/PiecePoolApp.tsx`, `src/store/inboxDraftStore.ts`, `src-tauri/src/commands/workspace.rs`
- 관련 계약: 없음 (계약 변경 0, 새 엔티티 0, 새 파일 레이아웃 0)

## 배경 / 문제

`<space>/sources/original-files/` 는 원래 **공간 단위 원본 풀**로 설계됐다. 노트를 쓸 때 그 공간의 원본 목록에서 하나를 골라 참조한다는 모델이다.

이 모델이 실제로는 서지 못했다. 세 군데서 어긋난다.

**(1) 파일이 노트를 따라가지 않는다.** Inbox 에서 PDF 는 항상 *현재 탭의 공간*(`space`)에 저장되는데, 저장 대상은 *드롭다운으로 고른 공간*(`targetSpace`)일 수 있다. 둘이 다르면 archive 노트는 B 공간에 생기고 PDF 는 A 공간에 남는다. B 의 노트 본문엔 `![[x.pdf]]` 가 있지만 B 의 `sources/` 엔 그 파일이 없다 — **임베드가 깨진 채 저장된다.** 코드 주석이 이 선택을 명시적으로 적어놨다(`InboxSection.tsx:102-103`): "PDF 패널은 원본 파일이 실제로 현재 공간의 sources/ 에 있으므로 따라가지 않는다."

**(2) 아무도 참조하지 않는 원본이 쌓인다.** 원본은 드롭하는 순간 디스크에 박히지만(`save_source_file`), archive 노트는 "저장" 을 눌러야 생긴다. 노트를 저장하지 않고 탭을 닫으면 PDF 만 남는다. 노트를 삭제해도(`delete_note`) `.md` 만 지워지고 원본은 남는다.

**(3) 풀 모델 자체가 나머지 코드와 어긋나 있었다.** `embedSourceFiles`(`llmApply.ts:47`)는 이미 **노트당 대표 파일 1개**만 쓴다 — `sanitizeSourceRefs` 가 `sourceId → file` 1:1 맵을 쓰기 때문이다. 즉 파이프라인은 처음부터 노트↔원본 1:1 을 전제하고 있었고, "공간의 원본 풀에서 골라 쓰기" UI 만 그 위에 얹혀 있었다.

## 결정 — 원본은 노트의 첨부물이다

`sources/original-files/` 를 **사용자가 탐색하는 자료실이 아니라 노트의 첨부 저장소**로 재정의한다.

- 노트 하나 = 원본 하나. 노트를 만들 때마다 업로드한다. (선행 작업에서 완료 — PDF 선택 UI 제거, 1개 게이트)
- 같은 PDF 를 여러 노트에 올리면 백엔드가 `-2` 접미사로 **별개 파일**을 만든다. 의도된 중복이다. 파일을 노트끼리 공유하면 한쪽에서 삭제·이동할 때 다른 노트의 임베드가 깨지고, 계약상 깨진 링크는 자동 재작성 금지라 사용자가 수습할 수 없다.
- **원본은 노트를 따라간다.** 노트의 공간이 바뀌면 원본도 그 공간으로 옮긴다.
- **원본은 노트와 함께 죽는다.** 노트가 사라지는 모든 경로에서 원본도 지운다. 확인 UX 는 두지 않는다 — 사용자에게 `sources/` 는 보이지 않는 구현 세부이고, 매 노트마다 다시 올리므로 잃을 것이 없다.

## 목표 (성공 기준)

- 대상 폴더를 바꿔 저장한 노트의 `![[x.pdf]]` 임베드가 **깨지지 않는다** — 그 공간의 `sources/` 에 파일이 있다.
- 저장하지 않고 탭을 닫으면 그 초안이 올린 원본이 **디스크에 남지 않는다.**
- 노트를 삭제하면 그 노트의 원본도 **함께 사라진다.**
- 저장된 노트가 참조 중인 원본은 **어떤 경우에도 지워지지 않는다.**

## 변경 1 — `move_source` 커맨드 (백엔드)

`src-tauri/src/commands/workspace.rs`

```rust
/// 원본 파일을 다른 공간의 sources/original-files/ 로 옮기고 최종 파일명을 반환.
/// 충돌 시 unique_file_name 접미사가 붙으므로 호출부는 반환된 이름을 써야 한다.
#[tauri::command]
pub fn move_source(from_space: String, to_space: String, file: String) -> Result<String, String>
```

`move_note`(`notes.rs:189-193`)가 이미 같은 일을 한다 — `read_bytes` → `write_bytes` → `remove_file`. 그 패턴을 그대로 쓴다. 프론트에서 `read_file_bytes` + `save_source_file` + `delete_source` 로 조합하면 최대 50MB 가 base64 로 JS 를 왕복한다.

- 두 공간 모두 `space_by_slug` 로 검증, 경로는 `safe_join`.
- `from == to` 면 no-op 으로 `file` 을 그대로 반환.
- 원본이 없으면 `not_found` 오류.
- `lib.rs` 의 `generate_handler!` 에 등록, `src/lib/ipc.ts` + `src/lib/mockIpc.ts` 에 래퍼 추가.

## 변경 2 — `targetSpace` 를 draft 로 (프론트)

지금 `targetSpace` 는 `useState`(`InboxSection.tsx:104`)다. 탭을 전환하면 InboxSection 이 언마운트되고, 돌아오면 `space` 로 리셋된다. 원본을 B 로 옮겨놨는데 대상이 A 로 되돌아가면 다시 어긋난다.

`InboxDraft`(`src/store/inboxDraftStore.ts`)에 `targetSpace: string` 필드를 추가하고 `EMPTY_DRAFT` 에 빈 문자열로 둔다. 읽을 때 `draft.targetSpace || space` 로 폴백하면 기존 draft(필드 없음)도 안 깨진다.

## 변경 3 — 공간 전환 시 원본 이동 (프론트)

`SpacePicker` 의 `onChange`(`InboxSection.tsx:382`):

1. 새 공간이 현재 대상과 같으면 아무것도 안 한다.
2. `refSource` 가 없으면 대상만 바꾸고 끝.
3. `refSource` 가 있으면 `move_source(이전대상, 새대상, refSource)` 호출.
   - 성공: 반환된 새 파일명으로 `refSource` 갱신 + **본문 임베드 문자열 교체**(`![[old]]` → `![[new]]`). 접미사 때문에 이름이 바뀔 수 있으므로 반드시 반환값을 쓴다.
   - 실패: **대상 공간 변경을 되돌리고** 안내(`onNotice`). 절반만 옮겨진 상태를 만들지 않는다.
4. 이동 중에는 `pdfBusy` 로 저장 버튼을 잠근다 — 이동 도중 저장하면 어느 쪽 공간에도 파일이 없는 순간이 있다.

이에 맞춰 `importPdf` · `PdfViewer` · `FilePreview` · `deleteSource` 가 쓰는 공간을 전부 `space`(탭의 공간) → `targetSpace`(노트가 속할 공간)로 통일한다.

## 변경 4 — 고아 정리 (프론트)

원본이 사라지는 두 경로.

**(a) 미저장 탭 닫기** — `closeTabClean`(`PiecePoolApp.tsx:334`). `useInboxDraftStore.clear(id)` 직전에 draft 를 읽어:

```
draft.refSource 가 있고 && draft.savedFile 이 없으면
  → deleteSource(draft.targetSpace ?? 탭의 space, draft.refSource)
```

`savedFile` 이 있으면 archive 노트가 그 원본을 참조 중이다 — **이것이 유일한 안전장치다.** 절대 지우지 않는다.

**(b) 노트 삭제** — `applyDelete`(`PiecePoolApp.tsx:599`). `deleteNote` 성공 직후, 그 노트 본문의 첫 pdf/image 임베드를 파싱해 같은 공간에서 `deleteSource`.

두 경로 모두 `delete_source` 실패는 **조용히 무시**한다(이미 없음 등). 탭 닫기·노트 삭제 자체를 막지 않는다 — 정리는 부수 작업이지 본 작업이 아니다.

## 컴포넌트 경계

| 단위 | 책임 | 의존 |
|---|---|---|
| `move_source` (Rust) | 원본 파일을 공간 간 이동, 충돌 시 접미사 | `storage/` 만 |
| `InboxDraft.targetSpace` | 이 노트가 속할 공간(persist) | — |
| `firstEmbedFile(markdown)` (TS, 순수) | 본문에서 첫 pdf/image 임베드 파일명 추출 | `parseWikilinks` |
| `InboxSection` 공간 전환 핸들러 | 대상 변경 + 원본 이동 + 임베드 교체, 실패 시 롤백 | `ipc.moveSource` |
| `PiecePoolApp` 정리 핸들러 | 탭 닫기·노트 삭제 시 원본 삭제 | `ipc.deleteSource`, `firstEmbedFile` |

## 테스트

**Rust** (`src-tauri/src/lib.rs` 통합 테스트, 기존 `save_source_file` 테스트 옆):
- `move_source` 왕복 — A 에서 사라지고 B 에 생긴다.
- 대상에 동명 파일이 있으면 `-2` 접미사가 붙고 그 이름이 반환된다.
- `from == to` 는 no-op, 파일명 그대로 반환.
- 없는 파일 → 오류, 원본 공간 상태 불변.

**TS 유닛** (vitest):
- `firstEmbedFile` — pdf 임베드 추출 / 이미지 임베드 / 임베드 없음 / 일반 위키링크(`[[x]]`)는 무시.
- `stripEmbed`(선행 작업에서 추가) — 이미 있음.
- `InboxDraft.targetSpace` 폴백 — 필드 없는 옛 draft 가 `space` 로 떨어진다.

**수동 확인** (배선은 유닛 테스트가 애매하다):
1. A 공간 Inbox → PDF 업로드 → 대상 폴더를 B 로 변경 → `~/PiecePool/B/sources/original-files/` 에 파일이 있고 A 엔 없다. PDF 패널이 계속 보인다.
2. 그 상태로 저장 → B 의 archive `.md` 임베드가 실제 파일을 가리킨다(archive 탭에서 열어 PDF 가 렌더된다).
3. PDF 업로드 후 저장 없이 탭 닫기 → `sources/` 에 파일이 남지 않는다.
4. PDF 업로드 → 저장 → 탭 닫기 → 파일이 **남아 있다**.
5. 저장된 노트를 사이드바에서 삭제 → `.md` 와 PDF 가 함께 사라진다.

## 범위 밖 (의도적)

- **`sourceType: text` 하드코딩** — `create_note` 가 항상 `SourceType::Text`, `original_file_path: None` 으로 쓴다(`notes.rs:82-89`). PDF↔노트 연결이 본문 `![[...]]` 문자열에만 존재하는 근본 원인이고, 이 때문에 `move_note` 의 원본 동반 이동 로직(`notes.rs:161`)이 죽어 있다. 계약 위반이지만 별도 작업이다. 본 설계는 임베드 파싱 전제 위에서 동작한다.
- **페이지 출처 소실** — `extract_pdf_text` 가 페이지별 텍스트를 주는데 프론트가 `join` 으로 뭉갠다. 별도 작업.
- **이미 쌓인 고아 파일 청소** — 본 설계는 앞으로 생기는 고아를 막을 뿐, 기존 `sources/` 의 잔재를 스캔해 지우지 않는다.
