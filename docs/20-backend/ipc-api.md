# IPC API (Tauri command surface)

Frontend(`src/`)가 `invoke()`로 호출하는 Tauri command 목록. **Frontend ↔ Backend 계약**.

> SSOT: 페이로드 타입 = [`../10-contracts/entities.md`](../10-contracts/entities.md) +
> [`relation-types.md`](../10-contracts/relation-types.md) → `src-tauri/src/models/mod.rs` →
> (ts-rs) `src/lib/generated/*.ts`. TS 래퍼는 [`src/lib/ipc.ts`](../../src/lib/ipc.ts).

상태: ✅ 구현됨 · 🔜 MVP 예정 · ⏳ post-MVP

---

## 1. 규약

- **명명**: command = `snake_case`, 페이로드 필드 = `camelCase` (serde `rename_all="camelCase"`, ts-rs 미러).
- **인자**: `invoke("cmd", { argName })` — 단일 객체. 반환 = `src/lib/types.ts` 엔티티 타입.
- **오류**: Rust `Result<T, AppError>` → reject. 상세 `error-handling.md` (작성 예정).
- **LLM은 IPC 아님**: 요약/추출/관계 생성 = TS adapter(`src/llm/`)가 수행. Rust IPC는
  **파일 I/O · PDF 추출 · 영속화(persist) · 뷰 read**만. ([`scope-mvp.md`](../00-overview/scope-mvp.md) §2.5 결정)

---

## 2. Workspace / Space

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `get_workspace` | — | `Workspace` | ✅ |
| `list_spaces` | `workspaceId` | `KnowledgeSpace[]` | 🔜 |
| `create_space` | `name` | `KnowledgeSpace` | 🔜 |

## 3. Subject

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `list_subjects` | `spaceId` | `Subject[]` | 🔜 |
| `create_subject` | `spaceId, name, semester?, color?` | `Subject` | 🔜 |

## 4. Inbox / Source

원문 입력 → 원본 파일 + `archive/*.md` 저장. LLM 정리는 TS adapter가 별도 수행.

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `extract_pdf_text` | `path` | `string` | 🔜 |
| `ocr_image` | `path` | `string` | ⏳ |
| `save_source` | `spaceId, input` | `Source` | 🔜 |
| `list_sources` | `spaceId` | `Source[]` | 🔜 |

> `save_source` 가 `Source` + 연결된 `ArchiveNote`(`archive/*.md`) + 원본(`sources/original-files/`) 기록.
> Import 흐름/상태(`ImportJob`)는 TS 서비스층이 오케스트레이션 — `import-pipeline.md` (작성 예정).

## 5. Archive note

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `list_archive_notes` | `spaceId` | `ArchiveNote[]` | 🔜 |
| `read_note` | `path` | `string` | 🔜 |
| `write_note` | `path, markdown` | `void` | 🔜 |

## 6. Wiki

TS adapter 산출(Concept/WikiPage)을 persist + 편집기 read/write.

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `save_wiki_page` | `spaceId, page` | `WikiPage` | 🔜 |
| `list_wiki_pages` | `spaceId` | `WikiPage[]` | 🔜 |
| `read_wiki_page` | `path` | `string` | 🔜 |
| `write_wiki_page` | `path, markdown` | `void` | 🔜 |

## 7. Concept

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `list_concepts` | `spaceId` | `Concept[]` | 🔜 |

## 8. Relation / Graph

Graph View 데이터. RelationType/강도/신뢰도/Evidence = [`relation-types.md`](../10-contracts/relation-types.md).

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `list_relations` | `spaceId` | `Relation[]` | 🔜 |
| `save_relations` | `spaceId, relations` | `void` | 🔜 |

> `save_relations` = TS adapter 산출을 `relations/relations.json`에 기록.

## 9. Question

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `list_questions` | `spaceId` | `Question[]` | ⏳ |

## 10. Files / Embed

`![[file]]` inline embed(이미지/PDF page) 렌더용 바이트 read.

| command | 인자 | 반환 | 상태 |
|---|---|---|---|
| `read_file_bytes` | `path` | `string` (base64) | 🔜 |

---

## 11. 데모 핵심 경로 최소 set

[`competition-plan.md`](../00-overview/competition-plan.md) §3 데모에 필요한 최소 command:

`extract_pdf_text` → `save_source` → `save_wiki_page` + `save_relations` →
`list_wiki_pages` / `read_wiki_page` (Wiki View) → `list_relations` (Graph View).

나머지(`ocr_image`, `list_questions` 등)는 데모 컷 또는 post-MVP.
