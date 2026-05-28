# Entities (SSOT)

PiecePool 핵심 엔티티 TypeScript 타입 정의. **본 문서가 단일 출처**다.

> **금지**: 다른 폴더 문서에 `type X = {...}` 재정의. 참조 시 본 문서에 link.
> **계약 변경**: [README.md#변경-절차](README.md#변경-절차) 참조.

---

## 목차

- [Workspace](#workspace)
- [KnowledgeSpace](#knowledgespace)
- [Subject](#subject)
- [Source](#source)
- [ArchiveNote](#archivenote)
- [Concept](#concept)
- [WikiPage](#wikipage)
- [SourceRef](#sourceref)
- [Evidence](#evidence)
- [Question](#question)
- [ImportJob](#importjob)

**Relation 엔티티 및 RelationType**: [relation-types.md](relation-types.md)에서 정의.

---

## Workspace

하나의 로컬 학습 공간. 사용자는 정확히 1개를 운용한다.

```ts
type Workspace = {
  id: string;            // ULID 권장
  name: string;          // 사용자 표시명
  rootPath: string;      // 로컬 절대 경로
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
};
```

저장: `<workspaceRoot>/config/workspace.json`

---

## KnowledgeSpace

Workspace 안의 지식 영역 폴더. 예: `deeplearning`, `operating-systems`.

```ts
type KnowledgeSpace = {
  id: string;
  name: string;          // 사용자 표시명 (예: "딥러닝")
  slug: string;          // 폴더명 (kebab-case, 예: "deeplearning")
  rootPath: string;      // 절대 경로 (<workspaceRoot>/<slug>)
  createdAt: string;
  updatedAt: string;
};
```

저장: `<workspaceRoot>/config/spaces.json`

**폴더 구조**: [workspace-layout.md#지식-영역-폴더](workspace-layout.md)

---

## Subject

KnowledgeSpace 안의 과목 메타데이터. **Workspace 분리 기준이 아니다**.

```ts
type Subject = {
  id: string;
  spaceId: string;       // KnowledgeSpace.id
  name: string;          // 예: "AI", "운영체제", "자료구조"
  semester?: string;     // 예: "2026-1"
  color?: string;        // HEX, 시각화용
  createdAt: string;
  updatedAt: string;
};
```

저장: `<space>/config/subjects.json`

---

## Source

사용자가 추가한 자료 단위. Inbox에 들어온 모든 입력은 Source 1개를 생성한다.

```ts
type SourceType = "text" | "pdf" | "summary_text" | "image";

type Source = {
  id: string;
  spaceId: string;
  type: SourceType;
  title: string;
  subjectIds: string[];          // 다중 Subject 태깅 가능
  inboxPath?: string;            // 처음 들어온 위치 (선택)
  archivePath: string;           // <space>/archive/*.md (필수)
  originalFilePath?: string;     // <space>/sources/original-files/* (PDF/이미지)
  createdAt: string;
  updatedAt: string;
};
```

- `text` / `summary_text`: 사용자 텍스트. `originalFilePath` 없음
- `pdf` / `image`: 원본 보존. `originalFilePath`는 `<space>/sources/original-files/` 하위 경로

---

## ArchiveNote

`<space>/archive/`에 저장된 원문 Markdown 문서. **LLM이 덮어쓰지 않는다**.

```ts
type ArchiveNote = {
  id: string;
  spaceId: string;
  sourceId: string;      // Source.id (1:1)
  path: string;          // <space>/archive/*.md 절대 경로
  title: string;
  markdown: string;      // 파일 본문 (frontmatter 제외)
  subjectIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

**Frontmatter 스키마**: [markdown-frontmatter.md#archive-note](markdown-frontmatter.md)

---

## Concept

Source에서 추출된 핵심 개념. 1 Concept ↔ 1 WikiPage (1:1).

```ts
type Concept = {
  id: string;
  spaceId: string;
  title: string;             // 사용자 표시명 (예: "Self-Attention")
  normalizedTitle: string;   // 중복 판정용 (소문자, 공백 정규화)
  subjectIds: string[];
  wikiPageId?: string;       // 대응 WikiPage.id (생성 후)
  aliases?: string[];        // 동의어
  createdAt: string;
  updatedAt: string;
};
```

---

## WikiPage

Concept 하나에 대응하는 Markdown 문서. **사람·LLM 양쪽이 다시 이해할 수 있게 구조화 메타데이터를 유지한다**.

```ts
type WikiPage = {
  id: string;
  spaceId: string;
  conceptId: string;
  title: string;
  path: string;              // <space>/wiki/*.md 절대 경로
  subjectIds: string[];
  sourceIds: string[];       // 본 페이지가 근거로 삼은 Source들
  sourceRefs: SourceRef[];   // 본문 embed/링크에 대응되는 구조화 참조
  markdown: string;          // frontmatter 제외 본문
  createdAt: string;
  updatedAt: string;
};
```

WikiPage 본문 구성 (LLM 생성 가이드):

- 개념명
- 짧은 요약
- 자세한 설명
- 예시
- 원본 PDF/이미지 embed (필요 시)
- 관련 Source
- 관련 Relation
- 헷갈리는 개념
- 관련 질문

**Frontmatter 스키마**: [markdown-frontmatter.md#wiki-page](markdown-frontmatter.md)
**본문 embed/link 문법**: [wikilink-embed.md](wikilink-embed.md)

---

## SourceRef

WikiPage 안에서 원본 파일 링크/embed가 어떤 Source를 가리키는지 설명하는 **구조화 메타데이터**. 본문 `[[...]]` / `![[...]]`와 짝을 이룬다.

```ts
type SourceRef = {
  id: string;
  sourceId: string;          // Source.id
  file: string;              // 원본 파일명 (예: "transformer-week3.pdf")
  page?: number;             // PDF page (1-indexed)
  embed: boolean;            // true=inline preview, false=link only
  label?: string;            // 사용자 친화 라벨
  reason?: string;           // 왜 이 위치에 참조했는지
};
```

**충돌 처리**: `sourceRefs`와 본문 embed가 불일치하면 자동 수정·삭제 금지. 사용자에게 충돌 상태 표시. [wikilink-embed.md#충돌-처리](wikilink-embed.md) 참조.

---

## Evidence

Relation이 왜 존재하는지 설명하는 근거. archive 추출 텍스트뿐 아니라 원본 PDF page/이미지도 가리킨다.

```ts
type Evidence = {
  sourceId: string;
  sourceRefId?: string;          // WikiPage SourceRef와 연결 (선택)
  archivePath?: string;          // <space>/archive/*.md
  originalFilePath?: string;     // <space>/sources/original-files/*
  page?: number;                 // PDF page
  quote?: string;                // 발췌 텍스트
  location?: string;             // 자유 형식 위치 설명
  reason: string;                // 근거 요지 (필수)
};
```

---

## Question

WikiPage와 연결되는 관련 질문. MVP에서는 WikiPage 본문 섹션으로 노출, 별도 화면 없음.

```ts
type Question = {
  id: string;
  spaceId: string;
  text: string;
  conceptIds: string[];      // 다중 Concept 연결 가능
  sourceIds: string[];
  createdAt: string;
};
```

---

## ImportJob

자료 가져오기와 LLM 처리 상태 추적.

```ts
type ImportJobStatus =
  | "idle"
  | "parsing"          // PDF 텍스트 추출 등
  | "archiving"        // <space>/archive/*.md 저장
  | "llm_processing"   // LLM 호출 진행
  | "writing"          // <space>/wiki/*.md + relations.json 저장
  | "completed"
  | "failed";

type ImportJob = {
  id: string;
  spaceId?: string;
  sourceId?: string;
  status: ImportJobStatus;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};
```

**상태 전이 다이어그램**: `docs/20-backend/import-job-states.md` (작성 예정)

---

## 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §8 (line 270-547)을 분리·재구성한 SSOT다.
- Relation 엔티티와 RelationType enum은 [relation-types.md](relation-types.md)로 분리했다.
