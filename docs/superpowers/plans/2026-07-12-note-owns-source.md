# 원본은 노트에 종속된다 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원본 PDF 가 노트를 따라 공간을 옮기고, 참조하는 노트가 사라지면 함께 삭제되도록 만든다.

**Architecture:** 백엔드에 `move_source` 원자적 커맨드 하나를 추가하고, 나머지는 프론트에서 조율한다(ADR-0007 — TS 서비스층이 시퀀싱 소유). Inbox 초안의 "저장 대상 공간"을 `useState` 에서 persist 되는 draft 필드로 끌어올려, 공간·원본·노트가 항상 같은 곳을 가리키게 한다.

**Tech Stack:** Rust(Tauri 2 commands, `storage/` 헬퍼) · TypeScript(React, zustand persist) · vitest · `cargo test`

**설계 문서:** `docs/superpowers/specs/2026-07-12-note-owns-source-design.md`

**브랜치:** `feat/note-owns-source` (이미 존재 — 선행 커밋 `5cf9b00` 이 "노트 하나 = PDF 하나" UI 를 끝냈다)

## Global Constraints

- **Rust 에서 `unwrap()` / `panic!()` 금지.** 모든 실패는 `AppError` 로 `?` 전파, command 는 `Result<T, String>` 반환 (CLAUDE.md §Backend).
- **`commands/` 는 얇게.** 파일 I/O 는 `storage/` 헬퍼(`read_bytes`·`write_bytes`·`remove_file`·`safe_join`·`space_subdir`·`exists`)만 쓴다. 새 I/O 헬퍼를 만들지 않는다.
- **경로는 반드시 `storage::safe_join`** 으로 만든다(`..`·절대경로·null-byte 거부).
- **계약 변경 0.** `docs/10-contracts/` 를 건드리지 않는다. 새 엔티티·새 디렉터리 없음.
- **주석은 한국어 본문 + 영문 식별자** (기존 파일 스타일 그대로).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 를 붙인다.
- **`main` 에 직접 push 금지.** 모든 작업은 `feat/note-owns-source` 위에서.

---

### Task 1: `move_source` 커맨드 (백엔드 + IPC 래퍼)

원본 파일을 다른 공간의 `sources/original-files/` 로 옮긴다. `move_note`(`src-tauri/src/commands/notes.rs:189-193`)의 read→write→remove 패턴을 그대로 쓴다. 프론트에서 `read_file_bytes` + `save_source_file` + `delete_source` 로 조합하면 최대 50MB 가 base64 로 JS 를 왕복하므로 백엔드에서 옮긴다.

**Files:**
- Modify: `src-tauri/src/commands/workspace.rs` (`save_source_file` 바로 아래, 파일 끝)
- Modify: `src-tauri/src/lib.rs` (`generate_handler!` 목록 + 통합 테스트에 섹션 18 추가)
- Modify: `src/lib/ipc.ts` (`real` 객체 + export)
- Modify: `src/lib/mockIpc.ts` (`mock` 객체)

**Interfaces:**
- Consumes: `storage::{safe_join, space_subdir, read_bytes, write_bytes, remove_file, exists}`, `crate::commands::{space_by_slug, unique_file_name}`
- Produces:
  - Rust: `pub fn move_source(from_space: String, to_space: String, file: String) -> Result<String, String>` — 반환값은 **대상 공간에서의 최종 파일명**(충돌 시 `-2` 접미사가 붙어 입력과 다를 수 있다)
  - TS: `ipc.moveSource(fromSpace: string, toSpace: string, file: string): Promise<string>`

- [ ] **Step 1: Rust 통합 테스트에 섹션 18 추가 (실패하는 테스트)**

`src-tauri/src/lib.rs` 의 `seed_and_read_back` 테스트 안, 섹션 17(`delete_source`) 블록 **바로 뒤**에 이어 붙인다. 이 테스트는 단일 `#[test]` 안에서 번호 붙은 섹션으로 이어지는 기존 스타일을 따른다(임시 `HOME` 격리는 테스트 맨 앞에서 이미 되어 있다).

```rust
        // 18) move_source: 공간 간 이동 + 충돌 접미사 + no-op + 없는 파일 거부
        let b64_m = storage::to_base64(&[1u8, 2, 3]);
        let src = commands::workspace::save_source_file(
            "operating-systems".into(),
            "lecture.pdf".into(),
            b64_m.clone(),
        )
        .expect("save for move");
        assert_eq!(src, "lecture.pdf");

        // 18-1) 이동: from 에서 사라지고 to 에 생긴다
        let moved = commands::workspace::move_source(
            "operating-systems".into(),
            "statistics".into(),
            src.clone(),
        )
        .expect("move");
        assert_eq!(moved, "lecture.pdf", "충돌 없으면 이름 유지");
        assert!(!storage::exists(
            &storage::space_subdir("operating-systems", "sources/original-files").join("lecture.pdf")
        ));
        let back = commands::workspace::read_file_bytes("statistics".into(), moved.clone())
            .expect("read moved");
        assert_eq!(back, b64_m, "이동 후 내용 동일");

        // 18-2) 대상에 동명 파일이 있으면 접미사가 붙고 그 이름이 반환된다
        let src2 = commands::workspace::save_source_file(
            "operating-systems".into(),
            "lecture.pdf".into(),
            b64_m.clone(),
        )
        .expect("save for move 2");
        let moved2 = commands::workspace::move_source(
            "operating-systems".into(),
            "statistics".into(),
            src2,
        )
        .expect("move 2");
        assert_eq!(moved2, "lecture-2.pdf", "대상 충돌 접미사");

        // 18-3) from == to 는 no-op — 파일명 그대로, 파일도 그대로
        let same = commands::workspace::move_source(
            "statistics".into(),
            "statistics".into(),
            "lecture.pdf".into(),
        )
        .expect("no-op move");
        assert_eq!(same, "lecture.pdf");
        assert!(storage::exists(
            &storage::space_subdir("statistics", "sources/original-files").join("lecture.pdf")
        ));

        // 18-4) 없는 파일 → 오류
        assert!(
            commands::workspace::move_source(
                "operating-systems".into(),
                "statistics".into(),
                "nope.pdf".into()
            )
            .is_err(),
            "없는 원본 거부"
        );

        // 18-5) 없는 공간 → 오류
        assert!(
            commands::workspace::move_source(
                "statistics".into(),
                "no-such-space".into(),
                "lecture.pdf".into()
            )
            .is_err(),
            "없는 대상 공간 거부"
        );
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd src-tauri && cargo test seed_and_read_back`
Expected: 컴파일 실패 — ``error[E0425]: cannot find function `move_source` in module `commands::workspace` ``

- [ ] **Step 3: `move_source` 구현**

`src-tauri/src/commands/workspace.rs` 의 `save_source_file` 함수 **바로 아래**에 추가:

```rust
/// 원본 파일을 다른 공간의 sources/original-files/ 로 옮기고 최종 파일명을 반환.
/// 대상에 동명 파일이 있으면 base-2.ext 접미사가 붙으므로 호출부는 반환된 이름을 써야 한다.
/// from == to 는 no-op. 부분 실패 안전 순서: 복사 → 원본 삭제(move_note 와 동일).
#[tauri::command]
pub fn move_source(
    from_space: String,
    to_space: String,
    file: String,
) -> Result<String, String> {
    crate::commands::space_by_slug(&from_space)?;
    crate::commands::space_by_slug(&to_space)?;
    if from_space == to_space {
        return Ok(file);
    }
    let from = storage::safe_join(
        &storage::space_subdir(&from_space, "sources/original-files"),
        &file,
    )
    .map_err(|e| e.to_string())?;
    if !storage::exists(&from) {
        return Err(format!("원본 없음: {file}"));
    }
    storage::ensure_space_tree(&to_space).map_err(|e| e.to_string())?;
    let to_dir = storage::space_subdir(&to_space, "sources/original-files");
    let final_name = crate::commands::unique_file_name(&to_dir, &file);
    let to = storage::safe_join(&to_dir, &final_name).map_err(|e| e.to_string())?;

    let bytes = storage::read_bytes(&from).map_err(|e| e.to_string())?;
    storage::write_bytes(&to, &bytes).map_err(|e| e.to_string())?;
    // 대상 기록은 끝났다 — 소스 정리 실패(잠금 등)는 무해한 복사본만 남기므로 오류로 만들지 않는다.
    let _ = storage::remove_file(&from);
    Ok(final_name)
}
```

- [ ] **Step 4: `generate_handler!` 에 등록**

`src-tauri/src/lib.rs`, `commands::workspace::save_source_file,` 줄 바로 뒤에 추가:

```rust
            commands::workspace::move_source,
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd src-tauri && cargo test seed_and_read_back`
Expected: PASS (`test result: ok`)

Run: `cd src-tauri && cargo clippy -- -D warnings && cargo fmt --check`
Expected: 경고 0, 포맷 차이 없음

- [ ] **Step 6: IPC 래퍼 추가 (TS)**

`src/lib/ipc.ts` — `real` 객체의 `deleteSource` 줄 바로 뒤:

```ts
  moveSource: (fromSpace: string, toSpace: string, file: string) =>
    invoke<string>("move_source", { fromSpace, toSpace, file }),
```

같은 파일 하단 export 목록의 `export const deleteSource = api.deleteSource;` 바로 뒤:

```ts
export const moveSource = api.moveSource;
```

`src/lib/mockIpc.ts` — `mock` 객체의 `deleteSource` 줄 바로 뒤 (브라우저 mock 은 이동을 흉내만 낸다 — 파일이 없다):

```ts
  moveSource: (_fromSpace: string, _toSpace: string, file: string) => delay(file),
```

- [ ] **Step 7: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 오류 0, 기존 테스트 전부 통과

- [ ] **Step 8: 커밋**

```bash
git add src-tauri/src/commands/workspace.rs src-tauri/src/lib.rs src/lib/ipc.ts src/lib/mockIpc.ts
git commit -m "feat(storage): move_source — 원본 파일 공간 간 이동 커맨드

노트가 다른 공간으로 저장될 때 원본 PDF 도 따라가야 한다. 프론트에서
read_file_bytes + save_source_file 로 조합하면 최대 50MB 가 base64 로
JS 를 왕복하므로 백엔드에서 옮긴다. move_note 의 복사→삭제 순서를 재사용.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `firstEmbedFile` 순수 헬퍼

본문에서 첫 pdf/image 임베드의 파일명을 뽑는다. `llmApply.ts` 의 `embedSourceFiles` 가 이미 같은 순회를 하고 있으므로, 그 로직을 이 헬퍼로 끌어내고 `embedSourceFiles` 가 재사용하게 한다(DRY). 정리 핸들러(Task 5)와 LLM 입력 구성이 같은 규칙("노트당 대표 파일 1개")을 쓰게 된다.

**Files:**
- Modify: `src/lib/wikilink.ts` (파일 끝에 추가)
- Modify: `src/lib/llmApply.ts:48-59` (`embedSourceFiles` 를 헬퍼 위에 다시 세운다)
- Test: `src/lib/wikilink.test.ts` (기존 파일 — 없으면 생성)

**Interfaces:**
- Consumes: `parseWikilinks`, `parseEmbedTarget` (둘 다 `src/lib/wikilink.ts` 에 이미 존재)
- Produces: `firstEmbedFile(markdown: string): { file: string; type: "pdf" | "image" } | null`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/wikilink.test.ts` 에 추가 (파일이 없으면 `import { describe, it, expect } from "vitest";` 로 시작하는 새 파일 생성):

```ts
import { firstEmbedFile } from "./wikilink";

describe("firstEmbedFile — 노트당 대표 원본 1개", () => {
  it("첫 pdf 임베드를 찾는다", () => {
    expect(firstEmbedFile("![[lecture.pdf]]\n\n필기")).toEqual({ file: "lecture.pdf", type: "pdf" });
  });

  it("이미지 임베드도 찾는다", () => {
    expect(firstEmbedFile("![[shot.png]]")).toEqual({ file: "shot.png", type: "image" });
  });

  it("#page=N 조각을 떼고 파일명만 준다", () => {
    expect(firstEmbedFile("![[lecture.pdf#page=3]]")).toEqual({ file: "lecture.pdf", type: "pdf" });
  });

  it("임베드가 아닌 위키링크는 무시한다", () => {
    expect(firstEmbedFile("[[lecture.pdf]] 는 링크일 뿐")).toBeNull();
  });

  it("원본이 없으면 null", () => {
    expect(firstEmbedFile("그냥 필기")).toBeNull();
  });

  it("여럿이면 첫 번째만", () => {
    expect(firstEmbedFile("![[a.pdf]]\n![[b.pdf]]")).toEqual({ file: "a.pdf", type: "pdf" });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/wikilink.test.ts`
Expected: FAIL — `does not provide an export named 'firstEmbedFile'`

- [ ] **Step 3: 헬퍼 구현**

`src/lib/wikilink.ts` 파일 끝에 추가:

```ts
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/** 본문의 첫 pdf/image 임베드 → 그 노트의 대표 원본. 없으면 null.
 *  노트↔원본은 1:1 이다(sanitizeSourceRefs 의 sourceId→file 맵이 1:1). */
export function firstEmbedFile(markdown: string): { file: string; type: "pdf" | "image" } | null {
  for (const t of parseWikilinks(markdown)) {
    if (t.kind !== "embed") continue;
    const { file } = parseEmbedTarget(t.value);
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "pdf") return { file, type: "pdf" };
    if (IMAGE_EXTS.has(ext)) return { file, type: "image" };
  }
  return null;
}
```

- [ ] **Step 4: `embedSourceFiles` 를 헬퍼 위에 다시 세운다**

`src/lib/llmApply.ts` — 기존 `IMAGE_EXTS` 상수(48행)와 `embedSourceFiles` 본문(50-59행)을 아래로 교체한다. import 에 `firstEmbedFile` 을 추가하고, 이 파일에서만 쓰이던 `parseWikilinks`·`parseEmbedTarget` import 가 다른 곳에서 안 쓰이면 지운다(다른 함수가 쓰고 있으면 남긴다 — 확인 후 판단).

```ts
export function embedSourceFiles(sourceId: string, markdown: string): NonNullable<LlmWikiInput["sourceFiles"]> {
  const e = firstEmbedFile(markdown);
  return e ? [{ id: sourceId, file: e.file, type: e.type }] : [];
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 새 테스트 6개 통과, 기존 테스트 전부 통과(특히 `llmApply` 관련), 타입 오류 0

- [ ] **Step 6: 커밋**

```bash
git add src/lib/wikilink.ts src/lib/wikilink.test.ts src/lib/llmApply.ts
git commit -m "refactor(wikilink): firstEmbedFile — 노트의 대표 원본 추출을 한 곳으로

embedSourceFiles 가 하던 순회를 순수 헬퍼로 끌어냈다. 고아 원본 정리
핸들러도 같은 규칙(노트당 대표 파일 1개)을 써야 하므로 두 곳이 규칙을
공유하게 만든다.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `InboxDraft.targetSpace` — 저장 대상 공간을 persist

지금 `targetSpace` 는 `InboxSection` 의 `useState`(`InboxSection.tsx:104`)다. 탭을 전환하면 컴포넌트가 언마운트되고, 돌아오면 `space` 로 리셋된다. Task 4 에서 원본을 대상 공간으로 옮기고 나면, 대상이 리셋되는 순간 노트와 원본이 다시 어긋난다. 그래서 draft 로 끌어올린다.

**Files:**
- Modify: `src/store/inboxDraftStore.ts:23-43` (`InboxDraft` 인터페이스 + `EMPTY_DRAFT`)
- Test: `src/store/inboxDraftStore.test.ts` (기존 파일)

**Interfaces:**
- Produces: `InboxDraft.targetSpace: string` — 이 노트가 저장될 공간. 빈 문자열이면 "아직 안 정함" → 소비자가 탭의 `space` 로 폴백한다. `EMPTY_DRAFT.targetSpace = ""`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/store/inboxDraftStore.test.ts` 에 추가:

```ts
it("targetSpace — 새 초안은 빈 문자열(호출부가 탭의 space 로 폴백)", () => {
  const s = useInboxDraftStore.getState();
  s.write("inbox:os:t1", { title: "제목" });
  expect(useInboxDraftStore.getState().drafts["inbox:os:t1"].targetSpace).toBe("");
});

it("targetSpace — write 로 바꾸면 보존된다", () => {
  const s = useInboxDraftStore.getState();
  s.write("inbox:os:t2", { targetSpace: "statistics" });
  expect(useInboxDraftStore.getState().drafts["inbox:os:t2"].targetSpace).toBe("statistics");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/store/inboxDraftStore.test.ts`
Expected: FAIL — 타입 오류(`targetSpace` 가 `InboxDraft` 에 없음) 또는 `expected undefined to be ""`

- [ ] **Step 3: 필드 추가**

`src/store/inboxDraftStore.ts` — `InboxDraft` 인터페이스의 `refWikiPath` 줄 뒤에 추가:

```ts
  targetSpace: string; // 저장될 공간(원본도 여기 산다). "" 면 아직 안 정함 → 호출부가 탭의 space 로 폴백
```

`EMPTY_DRAFT` 의 `refWikiPath: "",` 줄 뒤에 추가:

```ts
  targetSpace: "",
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/store/inboxDraftStore.test.ts && npx tsc --noEmit`
Expected: PASS. 기존 draft(필드 없음)는 `InboxSection` 의 `{ ...EMPTY_DRAFT, ...draft }` 병합(`InboxSection.tsx:105`)이 `""` 로 채우므로 마이그레이션이 필요 없다.

- [ ] **Step 5: 커밋**

```bash
git add src/store/inboxDraftStore.ts src/store/inboxDraftStore.test.ts
git commit -m "feat(inbox): 저장 대상 공간을 draft 로 — 탭 전환에도 살아남게

useState 는 탭 전환(언마운트)에 리셋된다. 원본이 대상 공간으로 따라가는
이상, 대상 공간도 초안과 같은 수명을 가져야 한다.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 대상 공간을 바꾸면 원본도 따라간다

`InboxSection` 이 쓰는 공간을 `space`(탭의 공간) → `targetSpace`(노트가 속할 공간)로 통일하고, `SpacePicker` 전환 시 원본을 옮긴다.

**Files:**
- Modify: `src/app/panes/InboxSection.tsx` (`targetSpace` 정의 104-105행 · `deleteSource` · `importPdf` · `SpacePicker` 379-387행 · PDF 패널의 `PdfViewer`/`FilePreview`)

**Interfaces:**
- Consumes: `ipc.moveSource(fromSpace, toSpace, file) → Promise<string>` (Task 1), `InboxDraft.targetSpace` (Task 3)
- Produces: 없음 (컴포넌트 내부 배선)

- [ ] **Step 1: `targetSpace` 를 draft 에서 읽는다**

`src/app/panes/InboxSection.tsx` — 104-105행의 두 줄:

```ts
  const [targetSpace, setTargetSpace] = useState(space);
  useEffect(() => setTargetSpace(space), [space]);
```

을 아래로 교체한다. `noteDraft` 는 105행에서 이미 `{ ...EMPTY_DRAFT, ...draft }` 로 만들어져 있으므로 `noteDraft.targetSpace` 는 항상 문자열이다(옛 draft 면 `""`).

```ts
  // 저장 대상 공간 = 이 노트가 속할 공간. 원본 PDF 도 여기 산다(노트↔원본은 같은 공간).
  // draft 에 persist — useState 면 탭 전환 언마운트에 리셋돼 원본과 노트가 어긋난다.
  const targetSpace = noteDraft.targetSpace || space;
```

주의: 이 줄은 `noteDraft` 선언(105행) **뒤에** 와야 한다. 기존 104-105행은 `noteDraft` 앞에 있으므로, 두 줄을 지우고 위 한 줄을 `noteDraft` 구조분해(107행) 아래로 옮긴다. `useState` import 가 다른 곳에서 계속 쓰이므로 import 는 그대로 둔다.

- [ ] **Step 2: 공간 전환 핸들러 작성**

`setTargetSpace` 를 쓰던 자리를 대체할 핸들러를 추가한다. `write`·`setBody`·`onNotice`·`pdfJobs` 선언 아래(예: `deleteSource` 정의 바로 뒤)에 둔다:

```ts
  // 대상 공간을 바꾸면 원본도 따라 옮긴다 — 노트는 B 에, PDF 는 A 에 남으면 임베드가 깨진다.
  // 실패하면 공간 변경을 되돌린다(절반만 옮겨진 상태를 만들지 않는다).
  const changeTargetSpace = async (slug: string) => {
    if (slug === targetSpace) return;
    const src = ds.getState().drafts[draftKey]?.refSource ?? "";
    if (!src) {
      write({ targetSpace: slug });
      return;
    }
    setPdfJobs((n) => n + 1); // 이동 중 저장 잠금 — 어느 공간에도 파일이 없는 순간이 있다
    try {
      const moved = await ipc.moveSource(targetSpace, slug, src);
      const b = ds.getState().drafts[draftKey]?.body ?? "";
      // 대상 충돌로 이름이 바뀔 수 있다 — 반환된 이름으로 본문 임베드를 교체한다.
      write({
        targetSpace: slug,
        refSource: moved,
        body: moved === src ? b : b.split(`![[${src}]]`).join(`![[${moved}]]`),
      });
    } catch (e) {
      onNotice?.(`원본을 옮기지 못했어요 — 폴더를 그대로 둡니다 (${String(e)})`);
    } finally {
      setPdfJobs((n) => n - 1);
    }
  };
```

- [ ] **Step 3: `SpacePicker` 를 새 핸들러에 연결**

379-387행:

```tsx
            <SpacePicker
              spaces={spaces}
              value={targetSpace}
              onChange={setTargetSpace}
              onCreate={async (name) => {
                const slug = await onCreateSpace(name);
                if (slug) setTargetSpace(slug);
              }}
            />
```

을 아래로 교체:

```tsx
            <SpacePicker
              spaces={spaces}
              value={targetSpace}
              onChange={(slug) => void changeTargetSpace(slug)}
              onCreate={async (name) => {
                const slug = await onCreateSpace(name);
                if (slug) await changeTargetSpace(slug);
              }}
            />
```

- [ ] **Step 4: 원본을 다루는 나머지 호출을 `targetSpace` 로 통일**

같은 파일에서 `space` 를 쓰는 **원본 관련** 호출을 전부 `targetSpace` 로 바꾼다. 정확히 다음 6곳이다(위키·파인만·에디터 쪽 `space` 는 건드리지 않는다):

1. `deleteSource` 안: `await ipc.deleteSource(space, refSource)` → `await ipc.deleteSource(targetSpace, refSource)`
2. `importPdf` 안: `await ipc.saveSourceFile(space, f.name, await fileToBase64(f))` → `ipc.saveSourceFile(targetSpace, ...)`
3. `importPdf` 안: `await ipc.extractPdfText(space, stored)` → `ipc.extractPdfText(targetSpace, stored)`
4. `addFile` 의 이미지 분기: `await ipc.saveSourceFile(space, f.name, dataUrl.split(",")[1] ?? "")` → `ipc.saveSourceFile(targetSpace, ...)`
5. PDF 패널: `<PdfViewer space={space} file={refSource} />` → `space={targetSpace}`
6. PDF 패널: `<FilePreview space={space} target={refSource} />` → `space={targetSpace}`

`changeTargetSpace` 가 `targetSpace` 를 클로저로 잡으므로, 이 함수들은 렌더마다 새로 만들어지는 현재 구조 그대로 두면 항상 최신 값을 본다.

- [ ] **Step 5: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 오류 0, 기존 테스트 전부 통과

- [ ] **Step 6: 수동 확인 (Tauri 필요)**

Run: `npm run tauri dev`

1. A 공간 Inbox 탭 → PDF 업로드 → 요약이 끝날 때까지 대기
2. 노트 헤더의 폴더 드롭다운에서 B 공간 선택
3. 확인: PDF 패널이 계속 그 PDF 를 보여준다
4. 확인: `~/PiecePool/B/sources/original-files/` 에 파일이 있고 `~/PiecePool/A/sources/original-files/` 에는 없다
5. 저장 → B 의 archive `.md` 를 archive 탭으로 열면 임베드된 PDF 가 렌더된다

- [ ] **Step 7: 커밋**

```bash
git add src/app/panes/InboxSection.tsx
git commit -m "fix(inbox): 대상 폴더를 바꾸면 원본 PDF 도 함께 옮긴다

PDF 는 탭의 공간에 저장되는데 노트는 드롭다운으로 고른 공간에 저장됐다.
둘이 다르면 노트는 B 에, PDF 는 A 에 남아 ![[...]] 임베드가 깨진 채
저장됐다. 원본 관련 호출을 전부 targetSpace 로 통일하고, 공간 전환 시
move_source 로 원본을 옮긴다(실패하면 폴더 변경을 되돌린다).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 고아 원본 정리 — 탭 닫기 · 노트 삭제

원본이 노트와 함께 죽게 만든다. 확인 UX 는 두지 않는다 — `sources/` 는 사용자에게 보이지 않는 첨부 저장소이고, 노트마다 새로 업로드하므로 잃을 것이 없다.

**Files:**
- Modify: `src/app/PiecePoolApp.tsx:334-337` (`closeTabClean`), `:586-607` (`applyDelete`)

**Interfaces:**
- Consumes: `firstEmbedFile` (Task 2), `ipc.deleteSource`, `useInboxDraftStore.getState().drafts`, `InboxDraft.targetSpace` (Task 3)

- [ ] **Step 1: 탭 닫기 정리**

`src/app/PiecePoolApp.tsx` — 333-337행:

```ts
  // 노트 탭을 닫으면 그 초안도 스토어에서 지운다(닫기 = 명시적 폐기, 진행 중 요약도 중단). 저장된 archive 파일은 남는다.
  const closeTabClean = (id: string) => {
    if (id.startsWith("inbox:")) useInboxDraftStore.getState().clear(id);
    closeTab(id);
  };
```

을 아래로 교체:

```ts
  // 노트 탭을 닫으면 그 초안도 스토어에서 지운다(닫기 = 명시적 폐기, 진행 중 요약도 중단). 저장된 archive 파일은 남는다.
  // 한 번도 저장하지 않은 초안이 올린 원본은 아무 노트도 참조하지 않는다 — 함께 지운다.
  // savedFile 이 있으면 archive 노트가 그 원본을 ![[...]] 로 참조 중이다. 절대 건드리지 않는다.
  const closeTabClean = (id: string) => {
    if (id.startsWith("inbox:")) {
      const d = useInboxDraftStore.getState().drafts[id];
      if (d?.refSource && !d.savedFile) {
        const space = d.targetSpace || openTabs.find((t) => t.id === id)?.space || "";
        // 정리는 부수 작업 — 실패해도 탭 닫기를 막지 않는다.
        if (space) void ipc.deleteSource(space, d.refSource).catch(() => {});
      }
      useInboxDraftStore.getState().clear(id);
    }
    closeTab(id);
  };
```

- [ ] **Step 2: 노트 삭제 정리**

`src/app/PiecePoolApp.tsx` — `applyDelete` 의 `else` 분기(598-602행):

```ts
      } else {
        await ipc.deleteNote(d.space, d.file);
        closeTab(`archive:${d.space}:${d.file}`);
        setNotice(`"${d.title}" 삭제됨`);
      }
```

을 아래로 교체. `deleteNote` **전에** 본문을 읽어야 한다 — 삭제 후엔 `notesBySlug` 갱신으로 사라진다.

```ts
      } else {
        // 노트가 죽으면 그 원본도 죽는다 — 첨부 저장소이지 자료실이 아니다(노트마다 새로 업로드).
        const src = firstEmbedFile(notesBySlug[d.space]?.find((n) => n.path === d.file)?.markdown ?? "");
        await ipc.deleteNote(d.space, d.file);
        // 정리는 부수 작업 — 실패해도 삭제 자체는 성공으로 알린다.
        if (src) await ipc.deleteSource(d.space, src.file).catch(() => {});
        closeTab(`archive:${d.space}:${d.file}`);
        setNotice(`"${d.title}" 삭제됨`);
      }
```

- [ ] **Step 3: import 추가**

`src/app/PiecePoolApp.tsx` 상단 import 에 추가(`src/lib/wikilink` 에서 이미 다른 것을 import 하고 있으면 그 줄에 합친다):

```ts
import { firstEmbedFile } from "../lib/wikilink";
```

- [ ] **Step 4: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 오류 0, 기존 테스트 전부 통과

- [ ] **Step 5: 수동 확인 (Tauri 필요)**

Run: `npm run tauri dev`

1. **미저장 탭 닫기**: Inbox 탭 → PDF 업로드 → 저장하지 않고 탭 닫기(확인 다이얼로그에서 "닫기") → `~/PiecePool/<space>/sources/original-files/` 에 그 파일이 **없다**
2. **저장된 노트는 보존**: Inbox 탭 → PDF 업로드 → 저장 → 탭 닫기 → 파일이 **남아 있다**, archive 탭으로 노트를 열면 PDF 가 렌더된다
3. **노트 삭제**: 위에서 저장한 노트를 사이드바 컨텍스트 메뉴로 삭제 → `.md` 와 PDF 가 **함께** 사라진다

- [ ] **Step 6: 커밋**

```bash
git add src/app/PiecePoolApp.tsx
git commit -m "fix(inbox): 고아 원본 정리 — 노트가 죽으면 원본도 죽는다

원본은 드롭 즉시 디스크에 박히지만 archive 노트는 저장을 눌러야 생긴다.
저장 없이 탭을 닫거나 노트를 삭제하면 아무도 참조하지 않는 PDF 가 쌓였다.
sources/ 는 사용자에게 보이지 않는 첨부 저장소이고 노트마다 새로 업로드하므로
확인 UX 없이 지운다. savedFile 이 있는 초안의 원본은 절대 지우지 않는다.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 여정 기록 + PR

`feat` 커밋이 있는 브랜치는 PR 전에 `docs/00-overview/journey.md` 타임라인에 한 줄을 추가해야 한다. PreToolUse 훅(`scripts/hooks/journey-guard.sh`)이 없으면 `gh pr create` 를 막는다.

**Files:**
- Modify: `docs/00-overview/journey.md` (타임라인 표에 행 1개)

- [ ] **Step 1: 행 추가**

`docs/00-overview/journey.md` §2 마일스톤 타임라인 표의 **맨 아래 행**(`07-11 | **워크스페이스 크롬 정리…`) 바로 뒤에 아래 한 줄을 붙인다. 열은 `| 날짜 | 사건 | 의미 |` 3개다.

```markdown
| 07-12 | **원본은 노트에 종속된다** — 강의자료를 "공간의 자료실에서 골라 쓰는" 모델을 버리고 노트의 첨부물로 재정의. 노트 하나 = PDF 하나(고르기 UI 제거, 노트마다 업로드), 저장 폴더를 바꾸면 원본도 함께 이동(`move_source`), 저장 없이 탭을 닫거나 노트를 지우면 원본도 함께 사라진다 ([spec](../superpowers/specs/2026-07-12-note-owns-source-design.md)) | 학생은 파일을 관리하지 않는다 — 자료는 노트에 매달려 함께 움직이고 함께 사라진다. "그 PDF 어느 폴더에 있더라"를 물을 일이 없고, 노트를 다른 과목으로 옮겨도 옆에 띄운 강의자료가 따라온다 |
```

- [ ] **Step 2: 커밋**

```bash
git add docs/00-overview/journey.md
git commit -m "docs(journey): 원본은 노트에 종속된다

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 오류 0, 테스트 전부 통과

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: 테스트 통과, 경고 0, 포맷 차이 없음

- [ ] **Step 4: PR 생성**

이 변경은 UI/UX 를 바꾼다(PDF 패널에서 "원본 고르기" 드롭다운이 사라졌다). CLAUDE.md 규칙에 따라 PR 본문에 **Before / After** 섹션을 넣고, **사용자에게 비포·애프터 스크린샷을 직접 첨부해 달라고 알린다** — 에이전트는 앱 스크린샷을 찍을 수 없다.

```bash
git push -u origin feat/note-owns-source
gh pr create --title "feat(inbox): 원본은 노트에 종속된다 — 노트당 PDF 1개 · 공간 이동 · 고아 정리" --body "$(cat <<'EOF'
## 배경

`sources/original-files/` 는 "공간 단위 원본 풀"로 설계됐지만 나머지 코드와 어긋나 있었다. `embedSourceFiles` 는 이미 노트당 대표 파일 1개만 쓴다(`sanitizeSourceRefs` 의 `sourceId→file` 1:1 맵). 그 위에 얹힌 "골라 쓰기" UI 가 세 가지 버그를 낳았다.

## 무엇이 고쳐졌나

1. **깨진 임베드** — PDF 는 탭의 공간에, 노트는 드롭다운으로 고른 공간에 저장됐다. 둘이 다르면 `![[x.pdf]]` 가 없는 파일을 가리켰다. 이제 원본이 노트를 따라 공간을 옮긴다(새 `move_source` 커맨드).
2. **고아 원본** — 저장 없이 탭을 닫거나 노트를 삭제하면 아무도 참조하지 않는 PDF 가 쌓였다. 이제 노트와 함께 사라진다.
3. **선택 UI** — 노트당 PDF 1개로 고정하고 "원본 고르기" 드롭다운을 제거했다. 노트를 만들 때마다 업로드한다.

동일 PDF 를 여러 노트에 올리면 백엔드가 `-2` 접미사로 별개 파일을 만든다. 의도된 중복이다 — 파일을 노트끼리 공유하면 한쪽 삭제·이동이 다른 노트의 임베드를 깬다.

## 설계 / 계획

- 설계: `docs/superpowers/specs/2026-07-12-note-owns-source-design.md`
- 계획: `docs/superpowers/plans/2026-07-12-note-owns-source.md`

## 계약 변경

없음. `docs/10-contracts/` 무수정, 새 엔티티·새 디렉터리 없음.

## 테스트

- Rust: `move_source` 통합 테스트(이동 · 충돌 접미사 · no-op · 없는 파일 · 없는 공간)
- TS: `firstEmbedFile` 유닛 6개, `InboxDraft.targetSpace` 유닛 2개
- 수동: 공간 전환 후 임베드 렌더 / 미저장 탭 닫기 후 파일 없음 / 저장된 노트의 원본 보존 / 노트 삭제 시 동반 삭제

## Before / After

<!-- 스크린샷을 여기 첨부해주세요 -->

| | Before | After |
|---|---|---|
| PDF 패널 헤더 | "원본 고르기…" 드롭다운 + 공간의 원본 N개 | 이 노트의 파일명 하나 |
| 폴더 변경 | PDF 는 원래 공간에 남음(임베드 깨짐) | PDF 도 함께 이동 |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: 사용자에게 스크린샷 요청**

PR 생성 후 사용자에게 알린다: PDF 패널 헤더의 비포/애프터 스크린샷을 PR 본문의 "Before / After" 섹션에 첨부해야 리뷰를 요청할 수 있다.

---

## 완료 조건

- [ ] `cargo test` · `cargo clippy -- -D warnings` · `cargo fmt --check` 전부 통과
- [ ] `npx tsc --noEmit` · `npx vitest run` 전부 통과
- [ ] 수동 확인 5개(Task 4 Step 6, Task 5 Step 5) 전부 통과
- [ ] `docs/00-overview/journey.md` 에 행 1개 추가됨
- [ ] PR 생성됨, 비포·애프터 스크린샷 첨부 요청 전달됨
