# CLAUDE.md

Guidelines and commands for PiecePool Backend (Tauri + Rust) development.

---

## 🛠️ Build, Development, and Test Commands

- **Install dependencies**: `npm install` (frontend); `cargo fetch` inside `src-tauri/`
- **Run development app**: `npm run tauri dev` (launches Tauri + Vite dev server together)
- **Build project**: `npm run tauri build`
- **Check Rust syntax**: `cargo check` inside `src-tauri/`
- **Run Rust tests**: `cargo test` inside `src-tauri/`
- **Lint Rust**: `cargo clippy -- -D warnings` inside `src-tauri/`
- **Format Rust**: `cargo fmt` inside `src-tauri/`

---

## 📌 Strict SSOT (Single Source of Truth) Constraints

`docs/10-contracts/` is the **single source of truth** for all shared contracts. Breaking any rule below will be caught by CI (`docs-check.yml`).

### Entities (`docs/10-contracts/entities.md`)

- All TypeScript entity types (`Workspace`, `KnowledgeSpace`, `Subject`, `Source`, `ArchiveNote`, `Concept`, `WikiPage`, `SourceRef`, `Evidence`, `Question`, `ImportJob`) are defined **only** in `entities.md`.
- All Rust structs and enums needed when writing backend code are already defined in `src-tauri/src/models/mod.rs`. Always import from there — never redefine them elsewhere.
- When writing Rust structs in `src-tauri/src/models/`, translate each TS type field-for-field. Apply:
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  ```
  to guarantee camelCase JSON compatibility with the frontend IPC layer.
- **Never** redefine or duplicate entity types elsewhere in the codebase. Reference via comment link instead.
- `id` fields use **ULID**. All timestamps use **ISO 8601** string format (e.g., `"2026-05-28T12:00:00+09:00"`).

### Workspace Layout (`docs/10-contracts/workspace-layout.md`)

- The local directory structure is canonical. Every file path the backend reads or writes must conform exactly:
  ```
  <workspaceRoot>/config/workspace.json
  <workspaceRoot>/config/spaces.json
  <space>/inbox/
  <space>/archive/         ← raw user text; NEVER overwrite with LLM output
  <space>/wiki/            ← LLM-generated WikiPage .md files
  <space>/relations/relations.json
  <space>/sources/original-files/
  <space>/config/subjects.json
  ```
- **`archive/` is read-only from the LLM's perspective.** The backend must never let LLM output overwrite an existing ArchiveNote.
- File naming conventions are strict:
  - Knowledge space slug: `kebab-case`, ASCII lowercase (e.g., `operating-systems`)
  - Archive files: `YYYY-MM-DD-slug.md`
  - Wiki files: `concept-slug.md` (lowercase, alphanumeric, hyphens only)
  - `relations.json`: UTF-8, LF line endings, 2-space indent

### RelationType (`docs/10-contracts/relation-types.md`)

- Only the 12 defined enum values are valid:
  `extracted_from`, `explained_by`, `prerequisite`, `part_of`, `used_in`,
  `causes`, `solves`, `contrasts`, `confused_with`, `related_to`, `tested_in`, `review_needed`
- `related_to` is a **last resort**. If `related_to` exceeds 30% of stored relations, flag it in review.
- `review_needed` must **never** be assigned by the LLM or backend automatically — it is a user-only action.
- Respect the node compatibility matrix: e.g., `extracted_from` source must be `Concept` or `WikiPage`, target must be `Source`. Reject invalid combinations at schema validation.

### Markdown Frontmatter (`docs/10-contracts/markdown-frontmatter.md`)

- Every `.md` file written to `archive/` or `wiki/` must include a valid YAML frontmatter block (`---` delimiters, YAML 1.2, UTF-8, LF).
- **Before saving**, the backend must validate:
  1. `type` is `"archive"` or `"wiki"`
  2. `id` is non-empty
  3. Each `subjectIds` entry corresponds to a real `Subject`
  4. `originalFilePath` is present when `sourceType` is `"pdf"` or `"image"`
  5. `sourceRefs[].sourceId` corresponds to a real `Source`
  6. `createdAt` / `updatedAt` parse as valid ISO 8601

### Wikilink & Embed (`docs/10-contracts/wikilink-embed.md`)

- `[[filename]]` and `![[filename]]` resolve relative to `<space>/sources/original-files/`. The backend must use this root for all link resolution.
- PDF page syntax: `[[file.pdf#page=N]]` — N is 1-indexed integer only.
- If a page number exceeds the PDF's total pages, render the first page and surface an error message; do not crash.
- **Conflict handling**: if `sourceRefs` (frontmatter) and body embeds are out of sync, surface a warning to the user — never auto-delete or auto-rewrite either side.

### LLM Output Schema (`docs/10-contracts/llm-output-schema.md`)

- All LLM responses (from any provider) must be normalized to `LlmWikiResult` before touching any other layer:
  ```
  LlmWikiResult { concepts: LlmConcept[], relations: LlmRelation[] }
  ```
- Before persisting, validate:
  1. JSON Schema draft 2020-12 passes
  2. `relations[].sourceConceptTitle` / `targetConceptTitle` match a known `Concept.title`
  3. `relationType` passes the node compatibility matrix
  4. `sourceRefs[].sourceId` is one of the Source IDs provided as LLM input
  5. If `related_to` ratio > 50%, emit a warning log (save is still allowed)
- Conversion pipeline: `LlmConcept → Concept + WikiPage + SourceRef[]`, `LlmRelation → Relation`, `LlmEvidence → Evidence`.
- Deduplication: if `Concept.normalizedTitle` (lowercase, whitespace-normalized) already exists, **merge** into the existing WikiPage rather than creating a duplicate.

---

## 🤖 ImportJob State Machine

The TS service layer (`useImportStore`) owns the `ImportJob` state-machine sequencing; the Rust `import/` module executes each step and records state, but does not own the sequencing trigger (ADR-0007). Never skip or reorder states.

```
idle → parsing → archiving → llm_processing → writing → completed
                                    │
                          (clarify enabled)
                                    ↓
                             clarify_pending  ← waiting for user response
                                    │
                          user responds ──► llm_processing (2nd call) → writing → completed
                          user ignores ──► writing (save 1st-call result) → completed
```

- On any unrecoverable error, transition to `failed` and populate `errorMessage`.

---

## 🦀 Backend Architecture Rules

The actual module layout under `src-tauri/src/` is as follows. Respect each module's boundary — no module may reach into another's responsibility.

```
src-tauri/src/
  main.rs      ← Binary entry point only. Calls lib.rs::run(). Do not add logic here.
  lib.rs       ← Wires all modules together; registers Tauri commands; owns app startup.
  error.rs     ← Single AppError enum (kind + message). All modules propagate this type.
  models/      ← Rust structs that mirror docs/10-contracts/entities.md 1-to-1.
                  Uses ts-rs to auto-generate TS types (`npm run gen:types`). Never edit generated files manually.
  commands/    ← Tauri IPC surface only. Functions must be thin — no business logic.
                  Every command returns Result<T, String> so the frontend can handle failures.
  storage/     ← All filesystem I/O (read/write workspace directories). No business logic.
                  Use tokio::fs for async ops; std::fs only in sync contexts.
  import/      ← Executes each import step (file I/O for parsing/archiving/writing) and records
                  ImportJob state. State-machine sequencing is owned by the TS service layer (ADR-0007), not Rust.
  pdf/         ← PDF-to-text extraction only. Page indexing lives here.
  seed/        ← First-run demo data generation. Writes to archive/, wiki/, relations/.
                  Never hard-code demo content in the UI layer.
```

- **Never use `unwrap()` or `panic!()` in production code.** Always propagate errors via `AppError` with `?`.
- `models/` structs use `#[serde(rename_all = "camelCase")]` — Rust identifiers stay `snake_case`, JSON output is `camelCase`.
- `ImportJobStatus::ClarifyPending` is **not yet in the code** (only in `entities.md`). Add it before implementing the clarify flow.
- LLM orchestration is handled by the TypeScript layer (`src/llm/`), not Rust. The `import/` module coordinates with it but does not own LLM logic.

---

## 🌐 LLM Provider Rules

Google Gemini is the only LLM provider (ADR-0009 supersedes ADR-0001). Liner is an additional source-search API used by feature 3 (label ↔ user gap filling).

| Provider | Env var          | Role                                                |
| -------- | ---------------- | --------------------------------------------------- |
| Gemini   | `GEMINI_API_KEY` | Wiki 생성 · 파인만식 되묻기 · 타입 Graph · 임베딩    |
| Liner    | `LINER_API_KEY`  | 정보 간극 메우기(label↔user) 출처 검색 · fact-check  |

- Gemini is called through its **OpenAI-compatible** endpoint (`generativelanguage.googleapis.com/v1beta/openai`), so `openai` appearing in `src/llm/*.ts` refers to the wire format, not the vendor. Default models: `gemini-2.5-flash`, `gemini-embedding-001`.
- **키는 두 곳에서 읽힌다.** 앱은 설정 모달 → `localStorage["gemini-key"]`이고 **`.env`를 읽지 않는다.** CLI 스크립트(`npm run eval:feynman`, `chunk` …)는 `.env`/환경변수의 `GEMINI_API_KEY`를 읽는다. 둘을 혼동하지 말 것.
- The Gemini provider must produce output conforming to `LlmWikiResult` (see above).
- 정보 간극 메우기(feature 3)의 주 해결책은 Liner API — 권위 있는 출처를 검색해 정답 기준(label)을 세우고 사용자 필기의 간극을 검증·보강한다. Liner 미가용 시 Gemini가 보조로 소크라테스식 되묻기 질문을 생성한다.
- 파인만식 되묻기(`src/llm/feynman.ts`)와 clarify는 Gemini, fact-check · web-search compare(출처 provenance)는 Liner API를 TypeScript adapter (`src/llm/`)로 호출한다.

---

## 🌿 Git & Collaboration Rules

- **Never push directly to `main`.** Always: feature branch → PR → review → merge.
- General changes: minimum **1 reviewer** before merge.
- Any change to `docs/10-contracts/`: requires **all 4 role owners** (Backend + Frontend + LLM + Design) to approve. Add the `contracts-change` PR label.
- If CI (`docs-check`) is red, **do not merge**.
- Delete the feature branch after merge.
- Do not copy-paste TS types or JSON Schema into backend source files — CI's `ssot-check` job will reject the PR.
- **Journey log (여정 기록)**: before creating a PR that contains `feat` commits, add ONE row to the timeline table in `docs/00-overview/journey.md` — 사건 요약과 "의미"(PPT 슬라이드에 그대로 쓸 한 문장). This is the raw material for reports/business decks. A shared PreToolUse hook (`scripts/hooks/journey-guard.sh`) blocks `gh pr create` if a feat branch lacks the journey entry — add the row, commit, then retry. Trivial changes (docs/fix/chore/deps) are exempt.
- **UI/UX 변경 PR에는 비포·애프터 스크린샷 필수.** When creating a PR that changes UI/UX, add a "Before / After" section to the PR body and tell the user to attach before/after screenshots (agents cannot capture app screenshots themselves — remind the user to add them before requesting review).

---

## 📝 Code Style Notes

- Rust identifiers follow Rust conventions (`snake_case`). JSON serialization uses `camelCase` via `#[serde(rename_all = "camelCase")]`.
- Comments in source files: Korean for user-facing descriptions, English for code-level docs — match the project convention (body text Korean, identifiers/types English).
- Keep each source file focused on a single responsibility; mirror the three-layer boundary in file organization.
