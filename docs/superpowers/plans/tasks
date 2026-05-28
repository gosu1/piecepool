# PiecePool MVP 구현 계획

> **agentic worker용:** 이 계획을 작업 단위로 구현할 때는 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용한다. 진행 상태는 체크박스(`- [ ]`) 문법으로 추적한다.

**목표:** 첫 번째로 실제 동작하는 PiecePool 데스크톱 MVP를 만든다. 범위는 단일 로컬 Markdown Workspace, 실제 파일 저장, PDF 텍스트 추출, LLM 생성 wiki page, 상호작용형 타입 지식 그래프다.

**아키텍처:** Tauri Rust 쪽이 로컬 파일 시스템 접근, PDF 추출, LLM 호출을 담당한다. 비밀값과 파일 권한이 webview에 들어가지 않게 하기 위해서다. React/TypeScript 쪽은 앱 상태, Markdown 편집, source 가져오기 UI, Wiki 탐색, Graph View를 담당한다. 공유 도메인 계약은 TypeScript schema에 두고, Tauri command 경계를 넘는 부분만 Rust serde struct로 맞춘다.

**기술 스택:** Tauri, React, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright, Rust, serde, reqwest, pdf-extract, CodeMirror, React Markdown, react-force-graph-2d, zod, gray-matter.

---

## 범위 확인

PRD는 로컬 파일 저장, Markdown 편집, source 가져오기, PDF 파싱, LLM 처리, graph 시각화 등 여러 하위 시스템을 다룬다. 각 작업이 같은 수직 workflow로 이어지므로 이 계획에서는 하나의 MVP 계획으로 묶는다:

```text
source input -> archive/*.md -> LLM -> wiki/*.md + relations.json -> Wiki/Graph UI
```

일정이 빡빡하면 작업 10 이후에서 멈춘다. 그 지점이면 workspace 파일, text/PDF 가져오기, LLM output, 저장된 wiki/relation data까지 최소 유용한 수직 기능 단면이 나온다. 작업 11-13은 제품을 탐색 가능하고 데모 가능한 상태로 만든다.

## 파일 구조

root에 `PRD.md`와 계획 문서를 둘 수 있도록 앱은 `app/` 아래에 만든다.

```text
app/
  package.json
  index.html
  vite.config.ts
  vitest.config.ts
  tsconfig.json
  tailwind.config.js
  postcss.config.js
  src/
    main.tsx
    App.tsx
    styles.css
    domain/
      types.ts
      schemas.ts
      seed.ts
      slug.ts
    workspace/
      api.ts
      markdown.ts
      repository.ts
      importPipeline.ts
    llm/
      prompt.ts
      resultMapper.ts
    components/
      AppShell.tsx
      WorkspaceHome.tsx
      SourceImport.tsx
      MarkdownEditor.tsx
      WikiView.tsx
      GraphView.tsx
      RelationPanel.tsx
      StatusBanner.tsx
    state/
      workspaceStore.tsx
    test/
      setup.ts
      fixtures.ts
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/
      main.rs
      workspace.rs
      pdf.rs
      llm.rs
      models.rs
  tests/
    e2e/
      piecepool.spec.ts
```

파일 책임:

- `src/domain/*`: 순수 type, zod 검증, seed 정의, slug helper를 둔다.
- `src/workspace/*`: Tauri command 위에서 동작하는 frontend repository와 import orchestration을 둔다.
- `src/llm/*`: prompt text와 LLM 결과를 파일로 매핑하는 로직을 둔다.
- `src/components/*`: UI만 둔다. 직접 파일 시스템 로직은 넣지 않는다.
- `src/state/workspaceStore.tsx`: app state와 비동기 action 연결을 둔다.
- `src-tauri/src/workspace.rs`: 안전한 workspace 파일 시스템 command를 둔다.
- `src-tauri/src/pdf.rs`: PDF 텍스트 추출 command를 둔다.
- `src-tauri/src/llm.rs`: LLM 호출 command와 structured output parsing을 둔다.
- `src-tauri/src/models.rs`: Rust command DTO를 둔다.

## 참고 자료

- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs

작업 9 구현 시 이 문서를 참고한다. 구현은 느슨한 JSON prompting이 아니라 JSON schema 기반 structured outputs를 사용해야 한다.

---

### 작업 1: 프로젝트 스캐폴드

**파일:**
- 생성: `app/package.json`
- 생성: `app/src/main.tsx`
- 생성: `app/src/App.tsx`
- 생성: `app/src/styles.css`
- 생성: `app/src-tauri/src/main.rs`
- 생성: `app/vitest.config.ts`
- 생성: `app/src/test/setup.ts`

- [ ] **단계 1: git과 앱 기본 구조 초기화**

실행:

```bash
git init
npm create vite@latest app -- --template react-ts
cd app
npm install
npm install -D @tauri-apps/cli vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event playwright tailwindcss postcss autoprefixer
npm install @tauri-apps/api zod gray-matter uuid react-markdown @uiw/react-codemirror @codemirror/lang-markdown react-force-graph-2d
npx tailwindcss init -p
npx tauri init --ci --app-name PiecePool --window-title PiecePool --frontend-dist ../dist --dev-url http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build"
```

예상 결과:

```text
Initialized empty Git repository
added packages
created app/src-tauri
```

- [ ] **단계 2: package script 교체**

수정: `app/package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri",
    "e2e": "playwright test"
  }
}
```

- [ ] **단계 3: Vitest 설정**

생성: `app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

생성: `app/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **단계 4: Tailwind 설정**

수정: `app/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

수정: `app/src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: #f7f7f4;
  color: #1d1d1f;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

- [ ] **단계 5: smoke test 추가**

생성: `app/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders PiecePool shell", () => {
  render(<App />);
  expect(screen.getByText("PiecePool")).toBeInTheDocument();
});
```

수정: `app/src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="flex h-full items-center justify-center">
      <h1 className="text-2xl font-semibold">PiecePool</h1>
    </main>
  );
}
```

- [ ] **단계 6: 검증**

실행:

```bash
npm test
npm run build
```

예상 결과:

```text
1 passed
✓ built
```

- [ ] **단계 7: 커밋**

```bash
git add app package-lock.json PRD.md docs/superpowers/plans/2026-05-28-piecepool-mvp.md
git commit -m "chore: scaffold PiecePool app"
```

---

### 작업 2: 도메인 타입과 검증

**파일:**
- 생성: `app/src/domain/types.ts`
- 생성: `app/src/domain/schemas.ts`
- 생성: `app/src/domain/slug.ts`
- 생성: `app/src/domain/types.test.ts`

- [ ] **단계 1: 실패하는 schema test 작성**

생성: `app/src/domain/types.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createSlug } from "./slug";
import { llmWikiResultSchema, relationSchema } from "./schemas";

describe("domain schemas", () => {
  test("accepts a valid relation with evidence", () => {
    const parsed = relationSchema.parse({
      id: "relation-self-attention-transformer",
      sourceNodeId: "concept-self-attention",
      targetNodeId: "concept-transformer",
      relationType: "part_of",
      strength: 0.88,
      confidence: 0.91,
      explanation: "Self-Attention is a core mechanism inside Transformer blocks.",
      evidence: [
        {
          sourceId: "source-transformer-week3",
          archivePath: "archive/2026-05-28-transformer-week3.md",
          quote: "Transformer layers use self-attention.",
          location: "page 4",
          reason: "The source directly links Transformer layers and self-attention.",
        },
      ],
      createdAt: "2026-05-28T12:00:00+09:00",
      updatedAt: "2026-05-28T12:00:00+09:00",
    });

    expect(parsed.relationType).toBe("part_of");
  });

  test("rejects relation strength above one", () => {
    expect(() =>
      relationSchema.parse({
        id: "bad",
        sourceNodeId: "a",
        targetNodeId: "b",
        relationType: "related_to",
        strength: 1.2,
        confidence: 0.8,
        explanation: "invalid",
        evidence: [],
        createdAt: "2026-05-28T12:00:00+09:00",
        updatedAt: "2026-05-28T12:00:00+09:00",
      }),
    ).toThrow();
  });

  test("validates LLM wiki result", () => {
    const parsed = llmWikiResultSchema.parse({
      concepts: [
        {
          title: "Self-Attention",
          aliases: ["self attention"],
          summary: "Token-to-token context mechanism.",
          explanation: "Each token computes relationships with other tokens.",
          examples: ["Pronoun resolution in a sentence."],
          confusingConcepts: ["Attention"],
          relatedQuestions: ["Why does self-attention scale quadratically?"],
        },
      ],
      relations: [
        {
          sourceConceptTitle: "Self-Attention",
          targetConceptTitle: "Transformer",
          relationType: "part_of",
          strength: 0.88,
          confidence: 0.91,
          explanation: "Self-attention is used inside Transformer blocks.",
          evidence: [{ sourceId: "source-1", reason: "Source text states the relation." }],
        },
      ],
    });

    expect(parsed.concepts).toHaveLength(1);
  });
});

describe("createSlug", () => {
  test("normalizes mixed concept titles", () => {
    expect(createSlug("Self Attention / Transformer!")).toBe("self-attention-transformer");
  });
});
```

- [ ] **단계 2: 실패 확인용 test 실행**

실행:

```bash
cd app
npm test -- src/domain/types.test.ts
```

예상 결과:

```text
FAIL src/domain/types.test.ts
Cannot find module './schemas'
```

- [ ] **단계 3: domain type 추가**

생성: `app/src/domain/types.ts`:

```ts
export type SourceType = "text" | "pdf" | "summary_text" | "image";

export type RelationType =
  | "extracted_from"
  | "explained_by"
  | "prerequisite"
  | "part_of"
  | "used_in"
  | "causes"
  | "solves"
  | "contrasts"
  | "confused_with"
  | "related_to"
  | "tested_in"
  | "review_needed";

export type Workspace = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export type Subject = {
  id: string;
  name: string;
  semester?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
};

export type Source = {
  id: string;
  type: SourceType;
  title: string;
  subjectIds: string[];
  archivePath: string;
  originalFilePath?: string;
  createdAt: string;
  updatedAt: string;
};

export type ArchiveNote = {
  id: string;
  sourceId: string;
  path: string;
  title: string;
  markdown: string;
  subjectIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type Concept = {
  id: string;
  title: string;
  normalizedTitle: string;
  subjectIds: string[];
  wikiPageId?: string;
  aliases?: string[];
  createdAt: string;
  updatedAt: string;
};

export type WikiPage = {
  id: string;
  conceptId: string;
  title: string;
  path: string;
  subjectIds: string[];
  sourceIds: string[];
  markdown: string;
  createdAt: string;
  updatedAt: string;
};

export type Evidence = {
  sourceId: string;
  archivePath?: string;
  quote?: string;
  location?: string;
  reason: string;
};

export type Relation = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: RelationType;
  strength: number;
  confidence: number;
  explanation: string;
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
};

export type Question = {
  id: string;
  text: string;
  conceptIds: string[];
  sourceIds: string[];
  createdAt: string;
};

export type ImportJobStatus =
  | "idle"
  | "parsing"
  | "archiving"
  | "llm_processing"
  | "writing"
  | "completed"
  | "failed";

export type ImportJob = {
  id: string;
  sourceId?: string;
  status: ImportJobStatus;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type LlmWikiResult = {
  concepts: Array<{
    title: string;
    aliases?: string[];
    summary: string;
    explanation: string;
    examples: string[];
    confusingConcepts?: string[];
    relatedQuestions?: string[];
  }>;
  relations: Array<{
    sourceConceptTitle: string;
    targetConceptTitle: string;
    relationType: RelationType;
    strength: number;
    confidence: number;
    explanation: string;
    evidence: Evidence[];
  }>;
};
```

- [ ] **단계 4: slug helper 추가**

생성: `app/src/domain/slug.ts`:

```ts
export function createSlug(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
```

- [ ] **단계 5: zod schema 추가**

생성: `app/src/domain/schemas.ts`:

```ts
import { z } from "zod";

export const relationTypeSchema = z.enum([
  "extracted_from",
  "explained_by",
  "prerequisite",
  "part_of",
  "used_in",
  "causes",
  "solves",
  "contrasts",
  "confused_with",
  "related_to",
  "tested_in",
  "review_needed",
]);

export const evidenceSchema = z.object({
  sourceId: z.string().min(1),
  archivePath: z.string().min(1).optional(),
  quote: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  reason: z.string().min(1),
});

export const relationSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  relationType: relationTypeSchema,
  strength: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1),
  evidence: z.array(evidenceSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const llmWikiResultSchema = z.object({
  concepts: z
    .array(
      z.object({
        title: z.string().min(1),
        aliases: z.array(z.string().min(1)).optional(),
        summary: z.string().min(1),
        explanation: z.string().min(1),
        examples: z.array(z.string().min(1)),
        confusingConcepts: z.array(z.string().min(1)).optional(),
        relatedQuestions: z.array(z.string().min(1)).optional(),
      }),
    )
    .min(1),
  relations: z.array(
    z.object({
      sourceConceptTitle: z.string().min(1),
      targetConceptTitle: z.string().min(1),
      relationType: relationTypeSchema,
      strength: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1),
      explanation: z.string().min(1),
      evidence: z.array(evidenceSchema),
    }),
  ),
});
```

- [ ] **단계 6: 검증**

실행:

```bash
npm test -- src/domain/types.test.ts
```

예상 결과:

```text
PASS src/domain/types.test.ts
```

- [ ] **단계 7: 커밋**

```bash
git add app/src/domain app/src/test app/vitest.config.ts app/package.json app/package-lock.json
git commit -m "feat: add PiecePool domain contracts"
```

---

### 작업 3: Tauri Workspace 파일 시스템 명령

**파일:**
- 생성: `app/src-tauri/src/models.rs`
- 생성: `app/src-tauri/src/workspace.rs`
- 수정: `app/src-tauri/src/main.rs`
- 수정: `app/src-tauri/Cargo.toml`
- 생성: `app/src/workspace/api.ts`

- [ ] **단계 1: Rust dependency 추가**

수정: `app/src-tauri/Cargo.toml` dependencies:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
chrono = { version = "0.4", features = ["serde"] }
```

- [ ] **단계 2: Rust test 먼저 작성**

생성: `app/src-tauri/src/workspace.rs` 테스트와 빈 command body 포함:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub contents: String,
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.contains("..") || relative.starts_with('/') {
        return Err("invalid relative path".to_string());
    }
    Ok(root.join(relative))
}

#[tauri::command]
pub fn create_workspace(root_path: String) -> Result<(), String> {
    let root = PathBuf::from(root_path);
    for dir in ["archive", "wiki", "relations", "sources/original-files", "config", "seed"] {
        fs::create_dir_all(root.join(dir)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn write_text_file(root_path: String, relative_path: String, contents: String) -> Result<(), String> {
    let root = PathBuf::from(root_path);
    let full_path = safe_join(&root, &relative_path)?;
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(full_path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_text_file(root_path: String, relative_path: String) -> Result<String, String> {
    let root = PathBuf::from(root_path);
    let full_path = safe_join(&root, &relative_path)?;
    fs::read_to_string(full_path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_directory_escape() {
        let root = PathBuf::from("/tmp/piecepool");
        assert!(safe_join(&root, "../secret.txt").is_err());
    }

    #[test]
    fn accepts_nested_workspace_path() {
        let root = PathBuf::from("/tmp/piecepool");
        let path = safe_join(&root, "archive/note.md").unwrap();
        assert_eq!(path, PathBuf::from("/tmp/piecepool/archive/note.md"));
    }
}
```

- [ ] **단계 3: command 등록**

수정: `app/src-tauri/src/main.rs`:

```rust
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            workspace::create_workspace,
            workspace::write_text_file,
            workspace::read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **단계 4: frontend API wrapper 추가**

생성: `app/src/workspace/api.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export async function createWorkspace(rootPath: string): Promise<void> {
  await invoke("create_workspace", { rootPath });
}

export async function writeTextFile(rootPath: string, relativePath: string, contents: string): Promise<void> {
  await invoke("write_text_file", { rootPath, relativePath, contents });
}

export async function readTextFile(rootPath: string, relativePath: string): Promise<string> {
  return invoke<string>("read_text_file", { rootPath, relativePath });
}
```

- [ ] **단계 5: 검증**

실행:

```bash
cd app/src-tauri
cargo test workspace
```

예상 결과:

```text
test result: ok. 2 passed
```

- [ ] **단계 6: 커밋**

```bash
git add app/src-tauri app/src/workspace/api.ts
git commit -m "feat: add workspace filesystem commands"
```

---

### 작업 4: Markdown frontmatter 저장소

**파일:**
- 생성: `app/src/workspace/markdown.ts`
- 생성: `app/src/workspace/markdown.test.ts`
- 생성: `app/src/workspace/repository.ts`
- 생성: `app/src/workspace/repository.test.ts`

- [ ] **단계 1: markdown test 작성**

생성: `app/src/workspace/markdown.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildArchiveMarkdown, buildWikiMarkdown, parseMarkdownDocument } from "./markdown";

describe("markdown helpers", () => {
  test("builds archive markdown with frontmatter", () => {
    const markdown = buildArchiveMarkdown({
      id: "source-transformer-week3",
      sourceType: "pdf",
      title: "Transformer Week 3",
      subjectIds: ["subject-ai"],
      createdAt: "2026-05-28T12:00:00+09:00",
      body: "Transformer lecture text",
    });

    expect(markdown).toContain("type: archive");
    expect(markdown).toContain("# Transformer Week 3");
    expect(markdown).toContain("Transformer lecture text");
  });

  test("parses frontmatter and content", () => {
    const parsed = parseMarkdownDocument(`---
id: wiki-self-attention
type: wiki
title: Self-Attention
---

# Self-Attention
Body`);

    expect(parsed.data.id).toBe("wiki-self-attention");
    expect(parsed.content).toContain("Body");
  });

  test("builds wiki markdown with required sections", () => {
    const markdown = buildWikiMarkdown({
      id: "wiki-self-attention",
      conceptId: "concept-self-attention",
      title: "Self-Attention",
      subjectIds: ["subject-ai"],
      sourceIds: ["source-transformer-week3"],
      updatedAt: "2026-05-28T12:30:00+09:00",
      summary: "Token-to-token context mechanism.",
      explanation: "Each token attends to other tokens.",
      examples: ["Pronoun resolution."],
      confusingConcepts: ["Attention"],
      relatedQuestions: ["Why is it quadratic?"],
    });

    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Explanation");
    expect(markdown).toContain("## Examples");
    expect(markdown).toContain("## Confusing Concepts");
    expect(markdown).toContain("## Related Questions");
  });
});
```

- [ ] **단계 2: 실패 확인용 test 실행**

실행:

```bash
cd app
npm test -- src/workspace/markdown.test.ts
```

예상 결과:

```text
FAIL src/workspace/markdown.test.ts
Cannot find module './markdown'
```

- [ ] **단계 3: markdown helper 구현**

생성: `app/src/workspace/markdown.ts`:

```ts
import matter from "gray-matter";
import type { SourceType } from "../domain/types";

export function parseMarkdownDocument(markdown: string) {
  return matter(markdown);
}

export function buildArchiveMarkdown(input: {
  id: string;
  sourceType: SourceType;
  title: string;
  subjectIds: string[];
  createdAt: string;
  body: string;
}): string {
  return matter.stringify(`# ${input.title}\n\n${input.body.trim()}\n`, {
    id: input.id,
    type: "archive",
    sourceType: input.sourceType,
    title: input.title,
    subjectIds: input.subjectIds,
    createdAt: input.createdAt,
  });
}

export function buildWikiMarkdown(input: {
  id: string;
  conceptId: string;
  title: string;
  subjectIds: string[];
  sourceIds: string[];
  updatedAt: string;
  summary: string;
  explanation: string;
  examples: string[];
  confusingConcepts?: string[];
  relatedQuestions?: string[];
}): string {
  const examples = input.examples.map((item) => `- ${item}`).join("\n");
  const confusing = (input.confusingConcepts ?? []).map((item) => `- ${item}`).join("\n") || "- 없음";
  const questions = (input.relatedQuestions ?? []).map((item) => `- ${item}`).join("\n") || "- 없음";

  const body = `# ${input.title}

## Summary

${input.summary}

## Explanation

${input.explanation}

## Examples

${examples}

## Confusing Concepts

${confusing}

## Related Questions

${questions}
`;

  return matter.stringify(body, {
    id: input.id,
    type: "wiki",
    conceptId: input.conceptId,
    title: input.title,
    subjectIds: input.subjectIds,
    sourceIds: input.sourceIds,
    updatedAt: input.updatedAt,
  });
}
```

- [ ] **단계 4: 검증**

실행:

```bash
npm test -- src/workspace/markdown.test.ts
```

예상 결과:

```text
PASS src/workspace/markdown.test.ts
```

- [ ] **단계 5: 커밋**

```bash
git add app/src/workspace/markdown.ts app/src/workspace/markdown.test.ts
git commit -m "feat: add markdown frontmatter helpers"
```

---

### 작업 5: Seed workspace 데이터

**파일:**
- 생성: `app/src/domain/seed.ts`
- 생성: `app/src/domain/seed.test.ts`
- 수정: `app/src/workspace/repository.ts`

- [ ] **단계 1: seed test 작성**

생성: `app/src/domain/seed.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createSeedWorkspaceFiles } from "./seed";

describe("seed workspace", () => {
  test("creates real archive, wiki, config, and relation files", () => {
    const files = createSeedWorkspaceFiles("2026-05-28T12:00:00+09:00");
    const paths = files.map((file) => file.relativePath);

    expect(paths).toContain("config/subjects.json");
    expect(paths).toContain("relations/relations.json");
    expect(paths).toContain("wiki/self-attention.md");
    expect(paths).toContain("archive/2026-05-28-transformer-week3.md");
  });

  test("seed relation has evidence", () => {
    const files = createSeedWorkspaceFiles("2026-05-28T12:00:00+09:00");
    const relationFile = files.find((file) => file.relativePath === "relations/relations.json");
    expect(relationFile?.contents).toContain("Self-Attention is a core mechanism");
    expect(relationFile?.contents).toContain("source-transformer-week3");
  });
});
```

- [ ] **단계 2: seed generator 구현**

생성: `app/src/domain/seed.ts`:

```ts
import { buildArchiveMarkdown, buildWikiMarkdown } from "../workspace/markdown";

export type SeedFile = {
  relativePath: string;
  contents: string;
};

export function createSeedWorkspaceFiles(now: string): SeedFile[] {
  const subjects = [
    { id: "subject-ai", name: "AI", color: "#2563eb", createdAt: now, updatedAt: now },
    { id: "subject-os", name: "운영체제", color: "#16a34a", createdAt: now, updatedAt: now },
    { id: "subject-ds", name: "자료구조", color: "#dc2626", createdAt: now, updatedAt: now },
  ];

  const archive = buildArchiveMarkdown({
    id: "source-transformer-week3",
    sourceType: "pdf",
    title: "Transformer Week 3",
    subjectIds: ["subject-ai"],
    createdAt: now,
    body: "Transformer layers use self-attention. Multi-head attention uses multiple attention heads to learn different token relationships.",
  });

  const wiki = buildWikiMarkdown({
    id: "wiki-self-attention",
    conceptId: "concept-self-attention",
    title: "Self-Attention",
    subjectIds: ["subject-ai"],
    sourceIds: ["source-transformer-week3"],
    updatedAt: now,
    summary: "각 token이 같은 sequence의 다른 token들과 관계를 계산하는 attention mechanism.",
    explanation: "Transformer block에서 Self-Attention은 token 간 의존성을 계산해 문맥 표현을 만든다.",
    examples: ["문장 안에서 대명사가 어떤 명사를 가리키는지 판단할 때 token 간 관계를 계산한다."],
    confusingConcepts: ["Attention", "Multi-Head Attention"],
    relatedQuestions: ["Self-Attention의 계산량은 왜 sequence length에 대해 quadratic인가?"],
  });

  const relations = [
    {
      id: "relation-self-attention-transformer",
      sourceNodeId: "concept-self-attention",
      targetNodeId: "concept-transformer",
      relationType: "part_of",
      strength: 0.9,
      confidence: 0.92,
      explanation: "Self-Attention is a core mechanism inside Transformer blocks.",
      evidence: [
        {
          sourceId: "source-transformer-week3",
          archivePath: "archive/2026-05-28-transformer-week3.md",
          quote: "Transformer layers use self-attention.",
          location: "seed archive",
          reason: "The source directly states that Transformer layers use self-attention.",
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  return [
    { relativePath: "config/subjects.json", contents: JSON.stringify(subjects, null, 2) },
    { relativePath: "archive/2026-05-28-transformer-week3.md", contents: archive },
    { relativePath: "wiki/self-attention.md", contents: wiki },
    { relativePath: "relations/relations.json", contents: JSON.stringify(relations, null, 2) },
  ];
}
```

- [ ] **단계 3: 검증**

실행:

```bash
cd app
npm test -- src/domain/seed.test.ts
```

예상 결과:

```text
PASS src/domain/seed.test.ts
```

- [ ] **단계 4: 커밋**

```bash
git add app/src/domain/seed.ts app/src/domain/seed.test.ts
git commit -m "feat: add seed workspace files"
```

---

### 작업 6: Workspace store와 app shell

**파일:**
- 생성: `app/src/state/workspaceStore.tsx`
- 생성: `app/src/components/AppShell.tsx`
- 생성: `app/src/components/WorkspaceHome.tsx`
- 생성: `app/src/components/StatusBanner.tsx`
- 수정: `app/src/App.tsx`
- 생성: `app/src/state/workspaceStore.test.tsx`

- [ ] **단계 1: store/UI test 작성**

생성: `app/src/state/workspaceStore.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { WorkspaceProvider, useWorkspaceStore } from "./workspaceStore";

function Probe() {
  const { workspace, activeView, setActiveView } = useWorkspaceStore();
  return (
    <div>
      <p>{workspace.name}</p>
      <button onClick={() => setActiveView("graph")}>Graph</button>
      <p>{activeView}</p>
    </div>
  );
}

describe("WorkspaceProvider", () => {
  test("provides default workspace and active view", async () => {
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );

    expect(screen.getByText("PiecePool Workspace")).toBeInTheDocument();
    screen.getByText("Graph").click();
    expect(await screen.findByText("graph")).toBeInTheDocument();
  });
});
```

- [ ] **단계 2: store 구현**

생성: `app/src/state/workspaceStore.tsx`:

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ImportJob, Relation, Subject, Workspace } from "../domain/types";

export type ActiveView = "workspace" | "import" | "editor" | "wiki" | "graph";

type WorkspaceState = {
  workspace: Workspace;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  subjects: Subject[];
  relations: Relation[];
  importJob: ImportJob;
};

const now = "2026-05-28T12:00:00+09:00";

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveView>("workspace");

  const value = useMemo<WorkspaceState>(
    () => ({
      workspace: {
        id: "workspace-local",
        name: "PiecePool Workspace",
        rootPath: "",
        createdAt: now,
        updatedAt: now,
      },
      activeView,
      setActiveView,
      subjects: [
        { id: "subject-ai", name: "AI", color: "#2563eb", createdAt: now, updatedAt: now },
        { id: "subject-os", name: "운영체제", color: "#16a34a", createdAt: now, updatedAt: now },
        { id: "subject-ds", name: "자료구조", color: "#dc2626", createdAt: now, updatedAt: now },
      ],
      relations: [],
      importJob: { id: "import-idle", status: "idle", createdAt: now, updatedAt: now },
    }),
    [activeView],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceStore() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspaceStore must be used inside WorkspaceProvider");
  }
  return value;
}
```

- [ ] **단계 3: shell component 구현**

생성: `app/src/components/AppShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { useWorkspaceStore, type ActiveView } from "../state/workspaceStore";

const navItems: Array<{ view: ActiveView; label: string }> = [
  { view: "workspace", label: "Workspace" },
  { view: "import", label: "Import" },
  { view: "editor", label: "Editor" },
  { view: "wiki", label: "Wiki" },
  { view: "graph", label: "Graph" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { activeView, setActiveView } = useWorkspaceStore();

  return (
    <div className="grid h-full grid-cols-[240px_1fr] bg-[#f7f7f4]">
      <aside className="border-r border-neutral-200 bg-white p-4">
        <h1 className="mb-6 text-xl font-semibold">PiecePool</h1>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.view}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                activeView === item.view ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
              }`}
              onClick={() => setActiveView(item.view)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="min-w-0 overflow-auto">{children}</section>
    </div>
  );
}
```

생성: `app/src/components/WorkspaceHome.tsx`:

```tsx
import { useWorkspaceStore } from "../state/workspaceStore";

export function WorkspaceHome() {
  const { workspace, subjects } = useWorkspaceStore();

  return (
    <div className="p-8">
      <h2 className="text-2xl font-semibold">{workspace.name}</h2>
      <p className="mt-2 text-sm text-neutral-600">시간이 지날수록 Wiki/Graph가 개인 전공 지식 지도처럼 성장한다.</p>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {subjects.map((subject) => (
          <article key={subject.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-3 h-2 w-8 rounded-full" style={{ background: subject.color }} />
            <h3 className="font-medium">{subject.name}</h3>
            <p className="mt-2 text-sm text-neutral-500">Seed subject</p>
          </article>
        ))}
      </div>
    </div>
  );
}
```

생성: `app/src/components/StatusBanner.tsx`:

```tsx
export function StatusBanner({ message }: { message: string }) {
  return <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">{message}</div>;
}
```

- [ ] **단계 4: App 연결**

수정: `app/src/App.tsx`:

```tsx
import { AppShell } from "./components/AppShell";
import { WorkspaceHome } from "./components/WorkspaceHome";
import { WorkspaceProvider, useWorkspaceStore } from "./state/workspaceStore";

function ActiveView() {
  const { activeView } = useWorkspaceStore();
  if (activeView === "workspace") return <WorkspaceHome />;
  return <div className="p-8 text-neutral-600">{activeView}</div>;
}

export default function App() {
  return (
    <WorkspaceProvider>
      <AppShell>
        <ActiveView />
      </AppShell>
    </WorkspaceProvider>
  );
}
```

- [ ] **단계 5: 검증**

실행:

```bash
cd app
npm test -- src/state/workspaceStore.test.tsx src/App.test.tsx
npm run build
```

예상 결과:

```text
PASS src/state/workspaceStore.test.tsx
PASS src/App.test.tsx
✓ built
```

- [ ] **단계 6: 커밋**

```bash
git add app/src/state app/src/components app/src/App.tsx
git commit -m "feat: add workspace shell"
```

---

### 작업 7: Markdown editor

**파일:**
- 생성: `app/src/components/MarkdownEditor.tsx`
- 생성: `app/src/components/MarkdownEditor.test.tsx`
- 수정: `app/src/App.tsx`

- [ ] **단계 1: editor test 작성**

생성: `app/src/components/MarkdownEditor.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor";

describe("MarkdownEditor", () => {
  test("edits and saves markdown", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <MarkdownEditor
        title="Self-Attention"
        markdown="# Self-Attention"
        metadata={{ type: "wiki", path: "wiki/self-attention.md" }}
        onSave={onSave}
      />,
    );

    await user.clear(screen.getByLabelText("Markdown content"));
    await user.type(screen.getByLabelText("Markdown content"), "# Updated");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("# Updated");
  });
});
```

- [ ] **단계 2: editor 구현**

생성: `app/src/components/MarkdownEditor.tsx`:

```tsx
import { useState } from "react";
import ReactMarkdown from "react-markdown";

type MarkdownEditorProps = {
  title: string;
  markdown: string;
  metadata: Record<string, string>;
  onSave: (markdown: string) => void | Promise<void>;
};

export function MarkdownEditor({ title, markdown, metadata, onSave }: MarkdownEditorProps) {
  const [draft, setDraft] = useState(markdown);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-[1fr_1fr]">
      <section className="border-r border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-neutral-500">{metadata.path}</p>
          </div>
          <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white" onClick={handleSave}>
            {saving ? "Saving" : "Save"}
          </button>
        </div>
        <textarea
          aria-label="Markdown content"
          className="h-[calc(100%-72px)] w-full resize-none rounded-md border border-neutral-200 p-3 font-mono text-sm"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </section>
      <section className="prose max-w-none overflow-auto p-6">
        <ReactMarkdown>{draft}</ReactMarkdown>
      </section>
    </div>
  );
}
```

- [ ] **단계 3: seed editor view 연결**

수정: `app/src/App.tsx` active view 분기:

```tsx
import { MarkdownEditor } from "./components/MarkdownEditor";

// inside ActiveView
if (activeView === "editor") {
  return (
    <MarkdownEditor
      title="Self-Attention"
      markdown="# Self-Attention\n\nSeed wiki page."
      metadata={{ type: "wiki", path: "wiki/self-attention.md" }}
      onSave={() => undefined}
    />
  );
}
```

- [ ] **단계 4: 검증**

실행:

```bash
cd app
npm test -- src/components/MarkdownEditor.test.tsx
npm run build
```

예상 결과:

```text
PASS src/components/MarkdownEditor.test.tsx
✓ built
```

- [ ] **단계 5: 커밋**

```bash
git add app/src/components/MarkdownEditor.tsx app/src/components/MarkdownEditor.test.tsx app/src/App.tsx
git commit -m "feat: add markdown editor"
```

---

### 작업 8: 텍스트와 수업 정리 source 가져오기

**파일:**
- 생성: `app/src/components/SourceImport.tsx`
- 생성: `app/src/components/SourceImport.test.tsx`
- 생성: `app/src/workspace/importPipeline.ts`
- 생성: `app/src/workspace/importPipeline.test.ts`
- 수정: `app/src/App.tsx`

- [ ] **단계 1: import pipeline test 작성**

생성: `app/src/workspace/importPipeline.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { importTextSource } from "./importPipeline";

describe("importTextSource", () => {
  test("writes archive markdown before LLM processing", async () => {
    const writeTextFile = vi.fn().mockResolvedValue(undefined);
    const runLlm = vi.fn().mockResolvedValue({ concepts: [], relations: [] });

    await importTextSource({
      rootPath: "/tmp/piecepool",
      title: "Transformer notes",
      body: "Self-attention is used in Transformers.",
      subjectIds: ["subject-ai"],
      sourceType: "text",
      now: "2026-05-28T12:00:00+09:00",
      writeTextFile,
      runLlm,
    });

    expect(writeTextFile).toHaveBeenCalledWith(
      "/tmp/piecepool",
      "archive/2026-05-28-transformer-notes.md",
      expect.stringContaining("Self-attention is used in Transformers."),
    );
    expect(runLlm).toHaveBeenCalled();
  });
});
```

- [ ] **단계 2: text import pipeline 기본 구조 구현**

생성: `app/src/workspace/importPipeline.ts`:

```ts
import type { LlmWikiResult, SourceType } from "../domain/types";
import { createSlug } from "../domain/slug";
import { buildArchiveMarkdown } from "./markdown";

type ImportTextSourceInput = {
  rootPath: string;
  title: string;
  body: string;
  subjectIds: string[];
  sourceType: Extract<SourceType, "text" | "summary_text">;
  now: string;
  writeTextFile: (rootPath: string, relativePath: string, contents: string) => Promise<void>;
  runLlm: (sourceTitle: string, sourceText: string, subjectIds: string[]) => Promise<LlmWikiResult>;
};

export async function importTextSource(input: ImportTextSourceInput): Promise<LlmWikiResult> {
  if (!input.title.trim()) throw new Error("title is required");
  if (!input.body.trim()) throw new Error("body is required");
  if (input.subjectIds.length === 0) throw new Error("subject is required");

  const date = input.now.slice(0, 10);
  const sourceId = `source-${createSlug(input.title)}`;
  const relativePath = `archive/${date}-${createSlug(input.title)}.md`;
  const markdown = buildArchiveMarkdown({
    id: sourceId,
    sourceType: input.sourceType,
    title: input.title,
    subjectIds: input.subjectIds,
    createdAt: input.now,
    body: input.body,
  });

  await input.writeTextFile(input.rootPath, relativePath, markdown);
  return input.runLlm(input.title, input.body, input.subjectIds);
}
```

- [ ] **단계 3: SourceImport UI test 작성**

생성: `app/src/components/SourceImport.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { SourceImport } from "./SourceImport";

describe("SourceImport", () => {
  test("requires title, subject, and text", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();

    render(<SourceImport subjects={[{ id: "subject-ai", name: "AI" }]} onImport={onImport} />);

    expect(screen.getByRole("button", { name: "Import Source" })).toBeDisabled();
    await user.type(screen.getByLabelText("Title"), "Transformer notes");
    await user.selectOptions(screen.getByLabelText("Subject"), "subject-ai");
    await user.type(screen.getByLabelText("Source text"), "Self-attention is used in Transformers.");

    expect(screen.getByRole("button", { name: "Import Source" })).toBeEnabled();
  });
});
```

- [ ] **단계 4: SourceImport UI 구현**

생성: `app/src/components/SourceImport.tsx`:

```tsx
import { useState } from "react";

type SubjectOption = {
  id: string;
  name: string;
};

type SourceImportProps = {
  subjects: SubjectOption[];
  onImport: (input: { title: string; subjectId: string; sourceType: "text" | "summary_text"; body: string }) => void;
};

export function SourceImport({ subjects, onImport }: SourceImportProps) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [sourceType, setSourceType] = useState<"text" | "summary_text">("text");
  const [body, setBody] = useState("");
  const disabled = !title.trim() || !subjectId || !body.trim();

  return (
    <form
      className="mx-auto max-w-3xl space-y-4 p-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onImport({ title, subjectId, sourceType, body });
      }}
    >
      <div>
        <h2 className="text-2xl font-semibold">Source Import</h2>
        <p className="mt-1 text-sm text-neutral-600">원문은 archive에 저장되고, LLM 정리 결과는 wiki로 저장된다.</p>
      </div>
      <label className="block text-sm font-medium">
        Title
        <input className="mt-1 w-full rounded-md border border-neutral-300 p-2" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        Subject
        <select className="mt-1 w-full rounded-md border border-neutral-300 p-2" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">Select subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Source type
        <select className="mt-1 w-full rounded-md border border-neutral-300 p-2" value={sourceType} onChange={(event) => setSourceType(event.target.value as "text" | "summary_text")}>
          <option value="text">Text</option>
          <option value="summary_text">Class summary text</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Source text
        <textarea className="mt-1 h-52 w-full rounded-md border border-neutral-300 p-2" value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-neutral-300" disabled={disabled}>
        Import Source
      </button>
    </form>
  );
}
```

- [ ] **단계 5: import view 연결**

수정: `app/src/App.tsx`:

```tsx
import { SourceImport } from "./components/SourceImport";

// inside ActiveView
if (activeView === "import") {
  return <SourceImport subjects={subjects} onImport={() => undefined} />;
}
```

- [ ] **단계 6: 검증**

실행:

```bash
cd app
npm test -- src/workspace/importPipeline.test.ts src/components/SourceImport.test.tsx
npm run build
```

예상 결과:

```text
PASS src/workspace/importPipeline.test.ts
PASS src/components/SourceImport.test.tsx
✓ built
```

- [ ] **단계 7: 커밋**

```bash
git add app/src/workspace/importPipeline.ts app/src/workspace/importPipeline.test.ts app/src/components/SourceImport.tsx app/src/components/SourceImport.test.tsx app/src/App.tsx
git commit -m "feat: add text source import flow"
```

---

### 작업 9: PDF 텍스트 추출

**파일:**
- 생성: `app/src-tauri/src/pdf.rs`
- 수정: `app/src-tauri/src/main.rs`
- 수정: `app/src-tauri/Cargo.toml`
- 수정: `app/src/workspace/api.ts`

- [ ] **단계 1: PDF dependency 추가**

수정: `app/src-tauri/Cargo.toml`:

```toml
pdf-extract = "0.7"
```

- [ ] **단계 2: PDF command 구현**

생성: `app/src-tauri/src/pdf.rs`:

```rust
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn extract_pdf_text(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err("PDF file does not exist".to_string());
    }

    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    pdf_extract::extract_text_from_mem(&bytes).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_pdf_returns_error() {
        let result = extract_pdf_text("/tmp/piecepool-missing.pdf".to_string());
        assert!(result.is_err());
    }
}
```

- [ ] **단계 3: command 등록**

수정: `app/src-tauri/src/main.rs`:

```rust
mod pdf;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            workspace::create_workspace,
            workspace::write_text_file,
            workspace::read_text_file,
            pdf::extract_pdf_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **단계 4: frontend wrapper 추가**

수정: `app/src/workspace/api.ts`:

```ts
export async function extractPdfText(filePath: string): Promise<string> {
  return invoke<string>("extract_pdf_text", { filePath });
}
```

- [ ] **단계 5: 검증**

실행:

```bash
cd app/src-tauri
cargo test pdf
```

예상 결과:

```text
test result: ok. 1 passed
```

- [ ] **단계 6: 커밋**

```bash
git add app/src-tauri app/src/workspace/api.ts
git commit -m "feat: add PDF text extraction command"
```

---

### 작업 10: LLM 구조화 출력 명령

**파일:**
- 생성: `app/src-tauri/src/llm.rs`
- 생성: `app/src-tauri/src/models.rs`
- 수정: `app/src-tauri/src/main.rs`
- 수정: `app/src-tauri/Cargo.toml`
- 생성: `app/src/llm/prompt.ts`
- 생성: `app/src/llm/resultMapper.ts`
- 생성: `app/src/llm/resultMapper.test.ts`
- 수정: `app/src/workspace/api.ts`

- [ ] **단계 1: Rust dependency 추가**

수정: `app/src-tauri/Cargo.toml`:

```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

- [ ] **단계 2: model DTO 추가**

생성: `app/src-tauri/src/models.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmRequest {
    pub source_title: String,
    pub source_text: String,
    pub subject_names: Vec<String>,
    pub existing_concept_titles: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceDto {
    pub source_id: String,
    pub archive_path: Option<String>,
    pub quote: Option<String>,
    pub location: Option<String>,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmConceptDto {
    pub title: String,
    pub aliases: Option<Vec<String>>,
    pub summary: String,
    pub explanation: String,
    pub examples: Vec<String>,
    pub confusing_concepts: Option<Vec<String>>,
    pub related_questions: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmRelationDto {
    pub source_concept_title: String,
    pub target_concept_title: String,
    pub relation_type: String,
    pub strength: f64,
    pub confidence: f64,
    pub explanation: String,
    pub evidence: Vec<EvidenceDto>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmWikiResultDto {
    pub concepts: Vec<LlmConceptDto>,
    pub relations: Vec<LlmRelationDto>,
}
```

- [ ] **단계 3: LLM command 구현**

생성: `app/src-tauri/src/llm.rs`:

```rust
use crate::models::{LlmRequest, LlmWikiResultDto};
use reqwest::Client;
use serde_json::json;

fn build_prompt(input: &LlmRequest) -> String {
    format!(
        "You are PiecePool's LLM-Wiki engine. Extract concepts and typed relations from this learning source.\n\nSource title: {}\nSubjects: {}\nExisting concepts: {}\n\nSource text:\n{}",
        input.source_title,
        input.subject_names.join(", "),
        input.existing_concept_titles.join(", "),
        input.source_text
    )
}

#[tauri::command]
pub async fn generate_wiki_result(input: LlmRequest) -> Result<LlmWikiResultDto, String> {
    let api_key = std::env::var("OPENAI_API_KEY").map_err(|_| "OPENAI_API_KEY is not set".to_string())?;
    let model = std::env::var("PIECEPOOL_LLM_MODEL").unwrap_or_else(|_| "gpt-5-mini".to_string());

    let schema = json!({
      "type": "object",
      "additionalProperties": false,
      "required": ["concepts", "relations"],
      "properties": {
        "concepts": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["title", "aliases", "summary", "explanation", "examples", "confusingConcepts", "relatedQuestions"],
            "properties": {
              "title": { "type": "string" },
              "aliases": { "type": "array", "items": { "type": "string" } },
              "summary": { "type": "string" },
              "explanation": { "type": "string" },
              "examples": { "type": "array", "items": { "type": "string" } },
              "confusingConcepts": { "type": "array", "items": { "type": "string" } },
              "relatedQuestions": { "type": "array", "items": { "type": "string" } }
            }
          }
        },
        "relations": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["sourceConceptTitle", "targetConceptTitle", "relationType", "strength", "confidence", "explanation", "evidence"],
            "properties": {
              "sourceConceptTitle": { "type": "string" },
              "targetConceptTitle": { "type": "string" },
              "relationType": {
                "type": "string",
                "enum": ["extracted_from", "explained_by", "prerequisite", "part_of", "used_in", "causes", "solves", "contrasts", "confused_with", "related_to", "tested_in", "review_needed"]
              },
              "strength": { "type": "number", "minimum": 0, "maximum": 1 },
              "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
              "explanation": { "type": "string" },
              "evidence": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["sourceId", "archivePath", "quote", "location", "reason"],
                  "properties": {
                    "sourceId": { "type": "string" },
                    "archivePath": { "type": "string" },
                    "quote": { "type": "string" },
                    "location": { "type": "string" },
                    "reason": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    });

    let body = json!({
      "model": model,
      "input": [
        {
          "role": "system",
          "content": "Return only data that matches the provided schema. Prefer specific relation types over related_to. Use empty arrays for missing concept lists and empty strings for missing evidence fields."
        },
        {
          "role": "user",
          "content": build_prompt(&input)
        }
      ],
      "text": {
        "format": {
          "type": "json_schema",
          "name": "piecepool_wiki_result",
          "strict": true,
          "schema": schema
        }
      }
    });

    let response: serde_json::Value = Client::new()
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let output_text = extract_output_text(&response)
        .ok_or_else(|| "LLM response did not include structured text output".to_string())?;

    serde_json::from_str::<LlmWikiResultDto>(output_text).map_err(|error| error.to_string())
}

fn extract_output_text(response: &serde_json::Value) -> Option<&str> {
    if let Some(text) = response.get("output_text").and_then(|value| value.as_str()) {
        return Some(text);
    }

    response
        .get("output")
        .and_then(|value| value.as_array())?
        .iter()
        .flat_map(|item| item.get("content").and_then(|value| value.as_array()).into_iter().flatten())
        .find_map(|content| content.get("text").and_then(|value| value.as_str()))
}
```

- [ ] **단계 4: command 등록**

수정: `app/src-tauri/src/main.rs`:

```rust
mod llm;
mod models;
mod pdf;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            workspace::create_workspace,
            workspace::write_text_file,
            workspace::read_text_file,
            pdf::extract_pdf_text,
            llm::generate_wiki_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **단계 5: frontend wrapper 추가**

수정: `app/src/workspace/api.ts`:

```ts
import type { LlmWikiResult } from "../domain/types";

export async function generateWikiResult(input: {
  sourceTitle: string;
  sourceText: string;
  subjectNames: string[];
  existingConceptTitles: string[];
}): Promise<LlmWikiResult> {
  return invoke<LlmWikiResult>("generate_wiki_result", { input });
}
```

- [ ] **단계 6: result mapper test 작성**

생성: `app/src/llm/resultMapper.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mapLlmResultToWorkspaceFiles } from "./resultMapper";

describe("mapLlmResultToWorkspaceFiles", () => {
  test("creates wiki markdown and relation metadata", () => {
    const files = mapLlmResultToWorkspaceFiles({
      sourceId: "source-transformer-week3",
      archivePath: "archive/2026-05-28-transformer-week3.md",
      subjectIds: ["subject-ai"],
      now: "2026-05-28T12:30:00+09:00",
      result: {
        concepts: [
          {
            title: "Self-Attention",
            summary: "Token-to-token context mechanism.",
            explanation: "Each token attends to other tokens.",
            examples: ["Pronoun resolution."],
          },
        ],
        relations: [],
      },
    });

    expect(files[0].relativePath).toBe("wiki/self-attention.md");
    expect(files[0].contents).toContain("# Self-Attention");
  });
});
```

- [ ] **단계 7: result mapper 구현**

생성: `app/src/llm/resultMapper.ts`:

```ts
import type { LlmWikiResult } from "../domain/types";
import { createSlug } from "../domain/slug";
import { buildWikiMarkdown } from "../workspace/markdown";

export type WorkspaceWrite = {
  relativePath: string;
  contents: string;
};

export function mapLlmResultToWorkspaceFiles(input: {
  sourceId: string;
  archivePath: string;
  subjectIds: string[];
  now: string;
  result: LlmWikiResult;
}): WorkspaceWrite[] {
  const wikiFiles = input.result.concepts.map((concept) => {
    const conceptSlug = createSlug(concept.title);
    return {
      relativePath: `wiki/${conceptSlug}.md`,
      contents: buildWikiMarkdown({
        id: `wiki-${conceptSlug}`,
        conceptId: `concept-${conceptSlug}`,
        title: concept.title,
        subjectIds: input.subjectIds,
        sourceIds: [input.sourceId],
        updatedAt: input.now,
        summary: concept.summary,
        explanation: concept.explanation,
        examples: concept.examples,
        confusingConcepts: concept.confusingConcepts,
        relatedQuestions: concept.relatedQuestions,
      }),
    };
  });

  const relationFile = {
    relativePath: "relations/relations.json",
    contents: JSON.stringify(
      input.result.relations.map((relation) => ({
        id: `relation-${createSlug(relation.sourceConceptTitle)}-${createSlug(relation.targetConceptTitle)}`,
        sourceNodeId: `concept-${createSlug(relation.sourceConceptTitle)}`,
        targetNodeId: `concept-${createSlug(relation.targetConceptTitle)}`,
        relationType: relation.relationType,
        strength: relation.strength,
        confidence: relation.confidence,
        explanation: relation.explanation,
        evidence: relation.evidence.map((evidence) => ({
          ...evidence,
          sourceId: evidence.sourceId || input.sourceId,
          archivePath: evidence.archivePath || input.archivePath,
        })),
        createdAt: input.now,
        updatedAt: input.now,
      })),
      null,
      2,
    ),
  };

  return [...wikiFiles, relationFile];
}
```

- [ ] **단계 8: 검증**

실행:

```bash
cd app
npm test -- src/llm/resultMapper.test.ts
cd src-tauri
cargo check
```

예상 결과:

```text
PASS src/llm/resultMapper.test.ts
Finished dev profile
```

- [ ] **단계 9: 커밋**

```bash
git add app/src-tauri app/src/workspace/api.ts app/src/llm
git commit -m "feat: add structured LLM wiki generation"
```

---

### 작업 11: 전체 import 흐름 연결

**파일:**
- 수정: `app/src/workspace/importPipeline.ts`
- 수정: `app/src/workspace/importPipeline.test.ts`
- 수정: `app/src/state/workspaceStore.tsx`
- 수정: `app/src/components/SourceImport.tsx`
- 수정: `app/src/App.tsx`

- [ ] **단계 1: import pipeline test 확장**

수정: `app/src/workspace/importPipeline.test.ts` wiki write를 검증하도록:

```ts
test("writes LLM wiki files after LLM processing", async () => {
  const writeTextFile = vi.fn().mockResolvedValue(undefined);
  const runLlm = vi.fn().mockResolvedValue({
    concepts: [
      {
        title: "Self-Attention",
        summary: "Token-to-token context mechanism.",
        explanation: "Each token attends to other tokens.",
        examples: ["Pronoun resolution."],
      },
    ],
    relations: [],
  });

  await importTextSource({
    rootPath: "/tmp/piecepool",
    title: "Transformer notes",
    body: "Self-attention is used in Transformers.",
    subjectIds: ["subject-ai"],
    sourceType: "text",
    now: "2026-05-28T12:00:00+09:00",
    writeTextFile,
    runLlm,
  });

  expect(writeTextFile).toHaveBeenCalledWith(
    "/tmp/piecepool",
    "wiki/self-attention.md",
    expect.stringContaining("# Self-Attention"),
  );
});
```

- [ ] **단계 2: pipeline 구현 갱신**

수정: `app/src/workspace/importPipeline.ts`:

```ts
import { mapLlmResultToWorkspaceFiles } from "../llm/resultMapper";

// inside importTextSource after runLlm
const result = await input.runLlm(input.title, input.body, input.subjectIds);
const generatedFiles = mapLlmResultToWorkspaceFiles({
  sourceId,
  archivePath: relativePath,
  subjectIds: input.subjectIds,
  now: input.now,
  result,
});
for (const file of generatedFiles) {
  await input.writeTextFile(input.rootPath, file.relativePath, file.contents);
}
return result;
```

- [ ] **단계 3: store action 추가**

수정: `app/src/state/workspaceStore.tsx`:

```tsx
type WorkspaceState = {
  // existing fields
  importSource: (input: { title: string; subjectId: string; sourceType: "text" | "summary_text"; body: string }) => Promise<void>;
};

// inside provider
async function importSource() {
  throw new Error("Workspace root path must be selected before importing sources");
}
```

이 첫 구현은 workspace 폴더 선택 기능이 추가되기 전까지 import를 의도적으로 막는다. UI는 조용히 성공 처리하지 말고 error를 보여줘야 한다.

- [ ] **단계 4: 검증**

실행:

```bash
cd app
npm test -- src/workspace/importPipeline.test.ts
npm run build
```

예상 결과:

```text
PASS src/workspace/importPipeline.test.ts
✓ built
```

- [ ] **단계 5: 커밋**

```bash
git add app/src/workspace/importPipeline.ts app/src/workspace/importPipeline.test.ts app/src/state/workspaceStore.tsx app/src/components/SourceImport.tsx app/src/App.tsx
git commit -m "feat: orchestrate archive to wiki import pipeline"
```

---

### 작업 12: Wiki View

**파일:**
- 생성: `app/src/components/WikiView.tsx`
- 생성: `app/src/components/WikiView.test.tsx`
- 수정: `app/src/App.tsx`

- [ ] **단계 1: WikiView test 작성**

생성: `app/src/components/WikiView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { WikiView } from "./WikiView";

describe("WikiView", () => {
  test("shows concept list and wiki sections", () => {
    render(
      <WikiView
        pages={[
          {
            id: "wiki-self-attention",
            title: "Self-Attention",
            path: "wiki/self-attention.md",
            summary: "Token-to-token context mechanism.",
            relatedSources: ["Transformer Week 3"],
            relatedRelations: ["part_of Transformer"],
            confusingConcepts: ["Attention"],
            relatedQuestions: ["Why is it quadratic?"],
          },
        ]}
      />,
    );

    expect(screen.getByText("Self-Attention")).toBeInTheDocument();
    expect(screen.getByText("Token-to-token context mechanism.")).toBeInTheDocument();
    expect(screen.getByText("part_of Transformer")).toBeInTheDocument();
  });
});
```

- [ ] **단계 2: WikiView 구현**

생성: `app/src/components/WikiView.tsx`:

```tsx
type WikiPageSummary = {
  id: string;
  title: string;
  path: string;
  summary: string;
  relatedSources: string[];
  relatedRelations: string[];
  confusingConcepts: string[];
  relatedQuestions: string[];
};

export function WikiView({ pages }: { pages: WikiPageSummary[] }) {
  const selected = pages[0];

  if (!selected) {
    return <div className="p-8 text-neutral-600">No wiki pages yet.</div>;
  }

  return (
    <div className="grid h-full grid-cols-[280px_1fr]">
      <aside className="border-r border-neutral-200 bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold">Wiki</h2>
        {pages.map((page) => (
          <button key={page.id} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100">
            {page.title}
          </button>
        ))}
      </aside>
      <main className="overflow-auto p-8">
        <p className="text-xs text-neutral-500">{selected.path}</p>
        <h1 className="mt-1 text-3xl font-semibold">{selected.title}</h1>
        <p className="mt-4 text-neutral-700">{selected.summary}</p>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <InfoBlock title="Related Sources" items={selected.relatedSources} />
          <InfoBlock title="Related Relations" items={selected.relatedRelations} />
          <InfoBlock title="Confusing Concepts" items={selected.confusingConcepts} />
          <InfoBlock title="Related Questions" items={selected.relatedQuestions} />
        </section>
      </main>
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-neutral-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **단계 3: Wiki view 연결**

수정: `app/src/App.tsx`:

```tsx
import { WikiView } from "./components/WikiView";

if (activeView === "wiki") {
  return (
    <WikiView
      pages={[
        {
          id: "wiki-self-attention",
          title: "Self-Attention",
          path: "wiki/self-attention.md",
          summary: "Token-to-token context mechanism.",
          relatedSources: ["Transformer Week 3"],
          relatedRelations: ["part_of Transformer"],
          confusingConcepts: ["Attention", "Multi-Head Attention"],
          relatedQuestions: ["Why is Self-Attention quadratic?"],
        },
      ]}
    />
  );
}
```

- [ ] **단계 4: 검증**

실행:

```bash
cd app
npm test -- src/components/WikiView.test.tsx
npm run build
```

예상 결과:

```text
PASS src/components/WikiView.test.tsx
✓ built
```

- [ ] **단계 5: 커밋**

```bash
git add app/src/components/WikiView.tsx app/src/components/WikiView.test.tsx app/src/App.tsx
git commit -m "feat: add wiki browser view"
```

---

### 작업 13: Graph View와 Relation Panel

**파일:**
- 생성: `app/src/components/GraphView.tsx`
- 생성: `app/src/components/RelationPanel.tsx`
- 생성: `app/src/components/GraphView.test.tsx`
- 수정: `app/src/App.tsx`

- [ ] **단계 1: graph interaction test 작성**

생성: `app/src/components/GraphView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { GraphView } from "./GraphView";

describe("GraphView", () => {
  test("shows relation detail when edge is selected from list", async () => {
    const user = userEvent.setup();
    render(
      <GraphView
        nodes={[
          { id: "concept-self-attention", label: "Self-Attention", type: "concept" },
          { id: "concept-transformer", label: "Transformer", type: "concept" },
        ]}
        relations={[
          {
            id: "relation-self-attention-transformer",
            sourceNodeId: "concept-self-attention",
            targetNodeId: "concept-transformer",
            relationType: "part_of",
            strength: 0.9,
            confidence: 0.92,
            explanation: "Self-Attention is a core mechanism inside Transformer blocks.",
            evidence: [{ sourceId: "source-transformer-week3", reason: "Source states the relation." }],
            createdAt: "2026-05-28T12:00:00+09:00",
            updatedAt: "2026-05-28T12:00:00+09:00",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Self-Attention part_of Transformer" }));
    expect(screen.getByText("Self-Attention is a core mechanism inside Transformer blocks.")).toBeInTheDocument();
  });
});
```

- [ ] **단계 2: relation panel 구현**

생성: `app/src/components/RelationPanel.tsx`:

```tsx
import type { Relation } from "../domain/types";

export function RelationPanel({ relation }: { relation: Relation | null }) {
  if (!relation) {
    return <aside className="border-l border-neutral-200 bg-white p-4 text-sm text-neutral-500">Select a relation.</aside>;
  }

  return (
    <aside className="border-l border-neutral-200 bg-white p-4">
      <h3 className="text-lg font-semibold">{relation.relationType}</h3>
      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="text-neutral-500">Strength</dt>
          <dd>{relation.strength}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Confidence</dt>
          <dd>{relation.confidence}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-neutral-700">{relation.explanation}</p>
      <h4 className="mt-6 font-medium">Evidence</h4>
      <ul className="mt-2 space-y-3 text-sm text-neutral-600">
        {relation.evidence.map((item) => (
          <li key={`${item.sourceId}-${item.reason}`} className="rounded-md bg-neutral-50 p-3">
            <p>{item.reason}</p>
            {item.quote ? <blockquote className="mt-2 border-l-2 border-neutral-300 pl-2">{item.quote}</blockquote> : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **단계 3: GraphView 구현**

생성: `app/src/components/GraphView.tsx`:

```tsx
import { useMemo, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Relation } from "../domain/types";
import { RelationPanel } from "./RelationPanel";

type GraphNode = {
  id: string;
  label: string;
  type: "concept" | "wiki" | "source";
};

type GraphViewProps = {
  nodes: GraphNode[];
  relations: Relation[];
};

const relationColors: Record<string, string> = {
  part_of: "#2563eb",
  used_in: "#16a34a",
  confused_with: "#dc2626",
  prerequisite: "#7c3aed",
  related_to: "#64748b",
};

export function getLinkDistance(strength: number): number {
  const minDistance = 80;
  const maxDistance = 320;
  return maxDistance - strength * (maxDistance - minDistance);
}

export function GraphView({ nodes, relations }: GraphViewProps) {
  const [selectedRelation, setSelectedRelation] = useState<Relation | null>(null);
  const [query, setQuery] = useState("");

  const visibleNodes = useMemo(
    () => nodes.filter((node) => node.label.toLowerCase().includes(query.toLowerCase())),
    [nodes, query],
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleRelations = relations.filter((relation) => visibleNodeIds.has(relation.sourceNodeId) || visibleNodeIds.has(relation.targetNodeId));

  const graphData = {
    nodes: visibleNodes.map((node) => ({ id: node.id, name: node.label })),
    links: visibleRelations.map((relation) => ({
      source: relation.sourceNodeId,
      target: relation.targetNodeId,
      relation,
      color: relationColors[relation.relationType] ?? relationColors.related_to,
    })),
  };

  return (
    <div className="grid h-full grid-cols-[260px_1fr_320px]">
      <aside className="border-r border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Graph</h2>
        <label className="mt-4 block text-sm font-medium">
          Search
          <input className="mt-1 w-full rounded-md border border-neutral-300 p-2" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="mt-6 space-y-2">
          {visibleRelations.map((relation) => {
            const source = nodes.find((node) => node.id === relation.sourceNodeId)?.label ?? relation.sourceNodeId;
            const target = nodes.find((node) => node.id === relation.targetNodeId)?.label ?? relation.targetNodeId;
            return (
              <button
                key={relation.id}
                className="w-full rounded-md border border-neutral-200 p-2 text-left text-sm hover:bg-neutral-50"
                onClick={() => setSelectedRelation(relation)}
              >
                {source} {relation.relationType} {target}
              </button>
            );
          })}
        </div>
      </aside>
      <main className="min-w-0 bg-[#fbfbf8]">
        <ForceGraph2D
          graphData={graphData}
          nodeLabel="name"
          linkColor={(link) => String(link.color)}
          linkWidth={(link) => Math.max(1, Number(link.relation.strength) * 5)}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={(link) => Math.max(1, Number(link.relation.strength) * 3)}
          d3Force="link"
          onLinkClick={(link) => setSelectedRelation(link.relation)}
        />
      </main>
      <RelationPanel relation={selectedRelation} />
    </div>
  );
}
```

- [ ] **단계 4: Graph view 연결**

수정: `app/src/App.tsx`:

```tsx
import { GraphView } from "./components/GraphView";

if (activeView === "graph") {
  return (
    <GraphView
      nodes={[
        { id: "concept-self-attention", label: "Self-Attention", type: "concept" },
        { id: "concept-transformer", label: "Transformer", type: "concept" },
      ]}
      relations={[
        {
          id: "relation-self-attention-transformer",
          sourceNodeId: "concept-self-attention",
          targetNodeId: "concept-transformer",
          relationType: "part_of",
          strength: 0.9,
          confidence: 0.92,
          explanation: "Self-Attention is a core mechanism inside Transformer blocks.",
          evidence: [{ sourceId: "source-transformer-week3", reason: "Source text states the relation." }],
          createdAt: "2026-05-28T12:00:00+09:00",
          updatedAt: "2026-05-28T12:00:00+09:00",
        },
      ]}
    />
  );
}
```

- [ ] **단계 5: 검증**

실행:

```bash
cd app
npm test -- src/components/GraphView.test.tsx
npm run build
```

예상 결과:

```text
PASS src/components/GraphView.test.tsx
✓ built
```

- [ ] **단계 6: 커밋**

```bash
git add app/src/components/GraphView.tsx app/src/components/RelationPanel.tsx app/src/components/GraphView.test.tsx app/src/App.tsx
git commit -m "feat: add interactive graph view"
```

---

### 작업 14: Workspace 폴더 선택과 저장 유지

**파일:**
- 수정: `app/src-tauri/src/workspace.rs`
- 수정: `app/src/workspace/api.ts`
- 수정: `app/src/state/workspaceStore.tsx`
- 수정: `app/src/components/WorkspaceHome.tsx`

- [ ] **단계 1: directory picker dependency 추가**

수정: `app/src-tauri/Cargo.toml`:

```toml
tauri-plugin-dialog = "2"
```

수정: `app/src-tauri/src/main.rs` builder:

```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **단계 2: frontend directory selection 추가**

수정: `app/src/workspace/api.ts`:

```ts
import { open } from "@tauri-apps/plugin-dialog";

export async function pickWorkspaceFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}
```

- [ ] **단계 3: store root path action 갱신**

수정: `app/src/state/workspaceStore.tsx`:

```tsx
type WorkspaceState = {
  // existing fields
  setWorkspaceRoot: (rootPath: string) => void;
};

const [rootPath, setRootPath] = useState("");

const workspace = {
  id: "workspace-local",
  name: "PiecePool Workspace",
  rootPath,
  createdAt: now,
  updatedAt: now,
};
```

- [ ] **단계 4: WorkspaceHome 버튼 추가**

수정: `app/src/components/WorkspaceHome.tsx`:

```tsx
import { pickWorkspaceFolder } from "../workspace/api";

// inside component
async function handlePickWorkspace() {
  const selected = await pickWorkspaceFolder();
  if (selected) setWorkspaceRoot(selected);
}

<button className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white" onClick={handlePickWorkspace}>
  Open Workspace Folder
</button>
```

- [ ] **단계 5: 검증**

실행:

```bash
cd app
npm run build
cd src-tauri
cargo check
```

예상 결과:

```text
✓ built
Finished dev profile
```

- [ ] **단계 6: 커밋**

```bash
git add app/src-tauri app/src/workspace/api.ts app/src/state/workspaceStore.tsx app/src/components/WorkspaceHome.tsx
git commit -m "feat: add workspace folder selection"
```

---

### 작업 15: 인수 테스트와 수동 검증

**파일:**
- 생성: `app/tests/e2e/piecepool.spec.ts`
- 생성: `app/playwright.config.ts`
- 수정: `app/package.json`
- 생성: `docs/superpowers/plans/2026-05-28-piecepool-mvp-verification.md`

- [ ] **단계 1: Playwright config 추가**

생성: `app/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
```

- [ ] **단계 2: E2E smoke test 추가**

생성: `app/tests/e2e/piecepool.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("navigates core MVP screens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PiecePool")).toBeVisible();
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Source Import")).toBeVisible();
  await page.getByRole("button", { name: "Wiki" }).click();
  await expect(page.getByText("Self-Attention")).toBeVisible();
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByText("Self-Attention part_of Transformer")).toBeVisible();
});
```

- [ ] **단계 3: 검증 노트 생성**

생성: `docs/superpowers/plans/2026-05-28-piecepool-mvp-verification.md`:

````md
# PiecePool MVP 검증

MVP 완료를 말하기 전에 아래 명령을 실행한다.

```bash
cd app
npm test
npm run build
npm run e2e
cd src-tauri
cargo test
cargo check
```

수동 확인:

- Workspace 폴더를 연다.
- Seed 데이터가 보인다.
- text source 가져오기가 archive Markdown을 만든다.
- PDF 가져오기가 텍스트를 추출해 archive Markdown에 넣는다.
- LLM 호출이 wiki Markdown과 relation 메타데이터를 만든다.
- Wiki page 수정 내용이 디스크에 저장된다.
- Graph node가 연결 문서를 연다.
- Graph edge가 근거 패널을 연다.
````

- [ ] **단계 4: 검증**

실행:

```bash
cd app
npm test
npm run build
npm run e2e
cd src-tauri
cargo test
cargo check
```

예상 결과:

```text
PASS
✓ built
1 passed
test result: ok
Finished dev profile
```

- [ ] **단계 5: 커밋**

```bash
git add app/playwright.config.ts app/tests/e2e app/package.json docs/superpowers/plans/2026-05-28-piecepool-mvp-verification.md
git commit -m "test: add MVP acceptance verification"
```

---

## 최종 검증

실행:

```bash
cd app
npm test
npm run build
npm run e2e
cd src-tauri
cargo test
cargo check
```

예상 결과:

```text
모든 test가 통과한다.
frontend build가 성공한다.
Playwright smoke test가 통과한다.
Rust test가 통과한다.
Tauri Rust code check가 통과한다.
```

## PRD 반영 범위

- 단일 로컬 Workspace: 작업 3, 6, 14
- Markdown 편집기: 작업 7
- 실제 `.md` archive/wiki 파일: 작업 3, 4, 8, 10, 11
- PDF 파싱: 작업 9
- 실제 LLM 호출: 작업 10
- Graph View: 작업 13
- 근거 패널: 작업 13
- Seed 데이터: 작업 5
- 기본 오류 처리: 작업 8, 9, 10, 11
- app 재시작 저장 유지 기반: 작업 3, 14
- `SourceType: "image"`로 OCR MVP+1 범위 보존: 작업 2
