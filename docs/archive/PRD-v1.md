# PiecePool PRD

## 1. 문서 목적

이 문서는 PiecePool의 첫 구현을 위한 기술 중심 PRD다. 제품 소개서가 아니라, Codex와 개발자가 바로 구현 범위, 데이터 구조, 저장 방식, 화면 요구사항, 검증 기준을 이해하기 위한 기준 문서다.

PiecePool의 핵심 컨셉은 다음 문장으로 정의한다.

> 시간이 지날수록 Wiki/Graph가 개인 전공 지식 지도처럼 성장한다.

## 2. 제품 정의

PiecePool은 대학생을 위한 로컬 우선 AI 지식 Workspace다.

사용자는 강의 PDF, 직접 작성한 필기, 붙여넣은 수업 정리 텍스트, 질문 기록 같은 학습 자료를 하나의 로컬 Workspace에 넣는다. PiecePool은 사용자가 넣은 원문을 Workspace 안의 지식 영역별 `<space>/archive/`에 보존하고, 실제 LLM을 호출해 개념 중심 Wiki 문서와 타입이 있는 지식 그래프로 재구성한다.

제품 경험은 일반 웹 SaaS 대시보드보다 Obsidian 같은 로컬 Markdown 지식 작업 공간에 가깝다. 차이는 PiecePool이 자료를 단순 저장하지 않고 LLM-Wiki와 Graph View로 계속 재구성한다는 점이다.

## 3. 핵심 사용자와 장기 사용 시나리오

초기 타깃은 여러 전공 과목을 동시에 공부하는 대학생이다.

중요한 사용 시나리오는 단발성 요약이 아니라 장기 누적이다.

- 사용자는 하나의 Workspace를 계속 사용한다.
- 과목, 학기, 시험, 프로젝트는 Workspace를 나누는 기준이 아니라 메타데이터/필터다.
- 1학년 2학기에 시작한 학습 기록이 4학년까지 같은 Workspace 안에서 이어진다.
- 시간이 지날수록 개념, 원문, 질문, Wiki, Relation이 누적된다.
- 서로 다른 과목에서 배운 개념도 Graph 안에서 연결된다.

예시:

```text
자료구조: Graph
-> AI: Graph Neural Network
-> 운영체제: Resource Allocation Graph
```

## 4. MVP 목표

MVP는 실제로 동작하는 로컬 앱이어야 한다. 단순 가짜 화면이나 발표용 정적 데모가 아니다.

MVP 필수 목표:

- 단일 로컬 Workspace 제공
- Markdown 편집기 제공
- 사용자가 자료를 넣는 Inbox 흐름 제공
- 사용자가 입력한 원문을 실제 `.md` 파일로 지식 영역별 `<space>/archive/`에 저장
- PDF에서 텍스트를 실제 추출하고 archive 노트로 저장
- 실제 LLM 호출로 Concept, WikiPage, Relation, Evidence 생성
- LLM이 정리한 WikiPage를 실제 `.md` 파일로 지식 영역별 `<space>/wiki/`에 저장
- WikiPage 안에서 Obsidian식 `[[파일명]]` 링크와 `![[파일명]]` inline embed 지원
- PDF/이미지 원본은 `<space>/sources/original-files/`에 보존하고, Wiki에서는 embed로 읽을 수 있게 표시
- Relation 메타데이터를 지식 영역별 `<space>/relations/relations.json`에 저장
- Graph View를 로컬 `<space>/wiki/`와 `<space>/relations/` 데이터에서 렌더링
- Graph node 클릭 시 연결된 Markdown 문서 열기
- Graph edge 클릭 시 관계 타입, 설명, 근거 표시
- 첫 실행용 Seed 데이터 포함

## 5. MVP 제외 범위

다음 항목은 MVP 1차 범위에서 제외한다.

- 로그인/계정
- 클라우드 동기화
- 모바일 앱
- Today Task 화면
- Project Flow 화면
- 이미지 OCR 완성 구현
- 고급 관계 강도 자동 점수화
- 협업 기능

단, OCR은 제품 요구사항에 포함한다. MVP 1차에서는 데이터 모델과 UI 진입점만 준비하고, 실제 OCR 파이프라인은 MVP+1에서 구현한다.

## 6. 기술 방향

초기 구현 스택:

- Tauri
- React
- TypeScript
- Tailwind CSS
- 로컬 파일 시스템 저장
- Markdown 편집기/렌더러
- PDF 텍스트 추출
- LLM API 연동
- Graph 시각화 라이브러리

지원 목표:

- Mac 로컬 앱
- Apple Silicon Mac 우선
- 추후 Obsidian식 vault 구조와 호환 가능하도록 설계

## 7. 로컬 Workspace 구조

Workspace는 하나의 로컬 폴더다. Workspace 아래에는 `deeplearning/` 같은 지식 영역 폴더가 있고, 각 지식 영역 폴더 안에 사람이 읽을 수 있는 Markdown 파일과 앱이 읽는 메타데이터 파일을 함께 둔다.

Workspace는 여전히 하나다. `deeplearning/`, `operating-systems/`, `data-structures/` 같은 하위 폴더는 Workspace 분리가 아니라 지식 영역을 나누는 저장 단위다.

권장 구조:

```text
PiecePool Workspace/
  config/
    workspace.json
    spaces.json
  deeplearning/
    inbox/
      transformer-week3.pdf
      user-pasted-note.md
    archive/
      2026-05-28-transformer-lecture-summary.md
      2026-05-28-attention-paper-notes.md
    wiki/
      transformer.md
      self-attention.md
      embedding.md
    relations/
      relations.json
    sources/
      original-files/
        transformer-week3.pdf
        attention-diagram.png
    config/
      subjects.json
    seed/
      demo-data.json
```

### 7.1 지식 영역 폴더

지식 영역 폴더는 `Workspace/deeplearning/`처럼 Workspace 바로 아래에 위치한다.

예:

- `deeplearning/`
- `operating-systems/`
- `data-structures/`

지식 영역 폴더는 독립 Workspace가 아니다. 앱은 하나의 Workspace를 열고, 그 안의 여러 지식 영역 폴더를 읽는다.

### 7.2 `<space>/inbox/`

사용자가 처음 자료를 넣는 입력 공간이다.

저장 대상:

- 사용자가 업로드한 PDF
- 사용자가 업로드한 이미지
- 사용자가 붙여넣거나 작성한 임시 텍스트
- 아직 LLM 정리와 archive/wiki 변환이 끝나지 않은 자료

`<space>/inbox/`는 처리 전 임시 입력 공간이다. 앱은 Inbox 자료를 가져와 Source를 만들고, 원본 파일은 `<space>/sources/original-files/`에 보존하며, 추출 텍스트나 사용자가 입력한 원문은 `<space>/archive/`에 Markdown으로 저장한다.

처리가 끝난 뒤 Inbox 파일을 유지할지 정리할지는 앱 설정으로 둘 수 있다. 단, 원본 보존 기준은 Inbox가 아니라 `<space>/sources/original-files/`다.

### 7.3 `<space>/archive/`

사용자가 넣은 원문 또는 추출된 원문을 저장한다.

저장 대상:

- 직접 붙여넣은 텍스트
- PDF에서 추출한 텍스트
- 수업 정리 텍스트
- 사용자가 직접 작성한 노트

`<space>/archive/`는 사용자가 제공한 원본 맥락의 보존 공간이다. LLM이 만든 요약이나 정리 결과가 archive 노트를 덮어쓰면 안 된다.

### 7.4 `<space>/wiki/`

LLM이 개념 중심으로 정리한 WikiPage를 저장한다.

각 WikiPage는 하나의 Markdown 파일이다. 사용자는 이 파일을 직접 열고 수정할 수 있어야 한다. WikiPage는 사용자가 읽기 쉬운 설명 문서이면서, 앱과 LLM이 다시 이해하기 쉬운 구조화 Markdown이어야 한다.

WikiPage는 Obsidian식 파일 링크와 embed 문법을 지원한다.

- `[[transformer-week3.pdf]]`: 원본 파일 링크
- `[[transformer-week3.pdf#page=12]]`: 특정 PDF page 링크
- `![[transformer-week3.pdf]]`: Wiki 안에 PDF preview를 inline으로 표시
- `![[transformer-week3.pdf#page=12]]`: 특정 PDF page를 inline으로 표시
- `![[attention-diagram.png]]`: Wiki 안에 이미지 preview를 inline으로 표시

`[[...]]`는 클릭 가능한 원본 링크다. `![[...]]`는 Wiki 읽기 화면에서 PDF/이미지 preview가 그 자리에 보이는 inline embed다. 사용자가 embed 영역을 클릭하면 확대 보기 또는 원본 뷰어를 열 수 있어야 한다.

파일 링크와 embed는 `<space>/sources/original-files/` 안의 원본 파일을 가리킨다. PDF에서 추출한 텍스트는 `<space>/archive/`에 저장하지만, Wiki에서 시각적으로 보여주는 PDF/이미지 원본은 `<space>/sources/original-files/`를 기준으로 한다.

LLM은 WikiPage를 생성할 때 필요한 경우 `![[...]]` embed 문법을 만들 수 있다. 단, Wiki가 과도하게 원본 preview로 가득 차지 않도록 핵심 근거가 되는 PDF page나 이미지에만 embed를 사용한다.

예시:

```md
---
id: wiki-self-attention
type: wiki
conceptId: concept-self-attention
title: Self-Attention
subjectIds:
  - subject-ai
sourceIds:
  - source-transformer-week3
sourceRefs:
  - sourceId: source-transformer-week3
    file: transformer-week3.pdf
    page: 12
    embed: true
    reason: "Self-Attention 수식과 설명이 있는 핵심 근거 page"
updatedAt: "2026-05-28T12:30:00+09:00"
---

# Self-Attention

Self-Attention은 sequence 안의 각 token이 다른 token과의 관계를 계산해 문맥 표현을 만드는 attention mechanism이다.

## 요약

Transformer에서 각 token이 전체 sequence의 다른 token을 참고해 문맥 표현을 만드는 핵심 구조다.

## 예시

문장 "The animal didn't cross the street because it was tired"에서 `it`이 무엇을 가리키는지 판단할 때 주변 token들과의 관계를 계산한다.

## 근거 원본

![[transformer-week3.pdf#page=12]]

관련 원본: [[transformer-week3.pdf]]
```

### 7.5 `<space>/relations/`

Concept 간 relation과 근거 메타데이터를 저장한다.

MVP에서는 각 지식 영역 폴더마다 `relations.json` 하나로 시작한다. 예: `deeplearning/relations/relations.json`. 추후 데이터가 커지면 과목별 또는 wiki별 메타데이터로 분리할 수 있다.

### 7.6 `sources/`와 `<space>/sources/`

원본 파일을 보존한다.

예:

- 업로드된 PDF 원본
- 추후 이미지 원본

MVP에서는 원본 파일을 해당 지식 영역의 `<space>/sources/original-files/`에 저장한다. 예: `deeplearning/sources/original-files/transformer-week3.pdf`. 추출 텍스트는 같은 지식 영역의 `<space>/archive/`에 Markdown으로 저장한다.

`<space>/sources/original-files/`의 파일은 Wiki에서 `[[파일명]]` 또는 `![[파일명]]` 문법으로 참조할 수 있어야 한다.

예:

```md
[[transformer-week3.pdf]]
![[transformer-week3.pdf#page=12]]
![[attention-diagram.png]]
```

PDF page 단위 preview는 MVP 범위다. PDF page 안의 특정 좌표 highlight 또는 이미지 OCR 기반 영역 highlight는 MVP+1 이후로 둔다.

### 7.7 `config/`와 `<space>/config/`

Workspace 설정과 Subject 메타데이터를 저장한다.

Workspace root의 `config/workspace.json`은 전체 Workspace 설정을 저장한다. `config/spaces.json`은 `deeplearning/` 같은 지식 영역 폴더 목록과 표시 정보를 저장한다.

각 지식 영역의 `<space>/config/subjects.json`은 해당 지식 영역 안의 과목 메타데이터를 저장한다.

Subject는 Workspace가 아니다. 하나의 Workspace 안의 지식 영역과 과목을 구분하기 위한 메타데이터다.

## 8. 핵심 엔티티

### 8.1 Workspace

하나의 로컬 학습 공간이다.

```ts
type Workspace = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};
```

### 8.2 KnowledgeSpace

Workspace 안의 지식 영역 폴더다.

예: `deeplearning`, `operating-systems`, `data-structures`

```ts
type KnowledgeSpace = {
  id: string;
  name: string;
  slug: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};
```

### 8.3 Subject

Workspace 안의 과목 메타데이터다.

```ts
type Subject = {
  id: string;
  spaceId: string;
  name: string;
  semester?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
};
```

예:

- AI
- 운영체제
- 자료구조

### 8.4 Source

사용자가 추가한 자료 단위다.

```ts
type SourceType = "text" | "pdf" | "summary_text" | "image";

type Source = {
  id: string;
  spaceId: string;
  type: SourceType;
  title: string;
  subjectIds: string[];
  inboxPath?: string;
  archivePath: string;
  originalFilePath?: string;
  createdAt: string;
  updatedAt: string;
};
```

`inboxPath`는 사용자가 처음 넣은 입력 파일 또는 임시 텍스트 경로다. `originalFilePath`는 보존된 원본 파일 경로이며, PDF/이미지는 `<space>/sources/original-files/` 아래를 가리킨다.

### 8.5 ArchiveNote

`<space>/archive/`에 저장된 원문 Markdown 문서다.

```ts
type ArchiveNote = {
  id: string;
  spaceId: string;
  sourceId: string;
  path: string;
  title: string;
  markdown: string;
  subjectIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

### 8.6 Concept

Source에서 추출된 핵심 개념이다.

```ts
type Concept = {
  id: string;
  spaceId: string;
  title: string;
  normalizedTitle: string;
  subjectIds: string[];
  wikiPageId?: string;
  aliases?: string[];
  createdAt: string;
  updatedAt: string;
};
```

### 8.7 WikiPage

Concept 하나에 대응되는 Markdown Wiki 문서다.

```ts
type WikiPage = {
  id: string;
  spaceId: string;
  conceptId: string;
  title: string;
  path: string;
  subjectIds: string[];
  sourceIds: string[];
  sourceRefs: SourceRef[];
  markdown: string;
  createdAt: string;
  updatedAt: string;
};
```

### 8.7.1 SourceRef

WikiPage 안에서 원본 파일 링크/embed가 어떤 Source를 가리키는지 설명하는 구조화 메타데이터다.

```ts
type SourceRef = {
  id: string;
  sourceId: string;
  file: string;
  page?: number;
  embed: boolean;
  label?: string;
  reason?: string;
};
```

`SourceRef`는 사람이 읽는 Markdown 문법과 앱/LLM이 읽는 구조화 데이터를 연결한다.

예:

```md
---
sourceRefs:
  - id: source-ref-attention-page-12
    sourceId: source-transformer-week3
    file: transformer-week3.pdf
    page: 12
    embed: true
    reason: "Self-Attention 수식과 설명이 있는 page"
---

![[transformer-week3.pdf#page=12]]
```

앱은 `sourceRefs`와 Markdown 본문의 `[[...]]`, `![[...]]`를 함께 사용한다. `sourceRefs`는 LLM과 앱의 안정적인 파싱용이고, embed 문법은 사용자 친화적인 읽기/편집용이다.

WikiPage 구성:

- 개념명
- 짧은 요약
- 자세한 설명
- 예시
- 원본 PDF/이미지 embed
- 관련 Source
- 관련 Relation
- 헷갈리는 개념
- 관련 질문

### 8.8 Relation

개념, Source, WikiPage 사이의 의미 있는 연결이다.

```ts
type RelationType =
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

type Relation = {
  id: string;
  spaceId: string;
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
```

`related_to`는 남발하지 않는다. 가능한 경우 `part_of`, `used_in`, `confused_with`, `prerequisite`처럼 의미가 분명한 관계 타입을 사용한다.

### 8.9 Evidence

Relation이 왜 존재하는지 설명하는 근거다.

```ts
type Evidence = {
  sourceId: string;
  sourceRefId?: string;
  archivePath?: string;
  originalFilePath?: string;
  page?: number;
  quote?: string;
  location?: string;
  reason: string;
};
```

Graph View에서 edge를 클릭하면 근거를 볼 수 있어야 한다. Evidence는 archive의 추출 텍스트뿐 아니라 sources의 원본 PDF page나 이미지도 가리킬 수 있어야 한다.

### 8.10 Question

WikiPage와 연결되는 관련 질문이다.

```ts
type Question = {
  id: string;
  spaceId: string;
  text: string;
  conceptIds: string[];
  sourceIds: string[];
  createdAt: string;
};
```

MVP에서는 별도 질문 화면을 만들지 않고 WikiPage 안의 섹션으로 표현한다.

### 8.11 ImportJob

자료 가져오기와 LLM 처리 상태를 추적한다.

```ts
type ImportJobStatus =
  | "idle"
  | "parsing"
  | "archiving"
  | "llm_processing"
  | "writing"
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

## 9. Import 처리 흐름

모든 입력은 사용자가 Inbox에 자료를 넣는 경험에서 시작한다.

공통 흐름:

```text
사용자가 <space>/inbox/에 자료 입력
-> Source 생성
-> 원본 PDF/이미지는 <space>/sources/original-files/에 보존
-> 텍스트 또는 추출 텍스트는 <space>/archive/*.md 저장
-> LLM 호출
-> Concept, WikiPage, Relation, Evidence, SourceRef 생성
-> <space>/wiki/*.md 저장
-> <space>/relations/relations.json 저장
-> Wiki/Graph 갱신
```

LLM이 WikiPage를 만들 때 원본 PDF page나 이미지가 설명 이해에 중요하면 `![[...]]` embed 문법을 Wiki 본문에 포함한다. 동시에 같은 참조를 frontmatter의 `sourceRefs`에 구조화해서 저장한다.

### 9.1 텍스트 입력

```text
사용자가 Subject 선택
-> Inbox에 텍스트 입력
-> Source 생성
-> <space>/archive/*.md 저장
-> LLM 호출
-> Concept, WikiPage, Relation, Evidence 생성
-> <space>/wiki/*.md 저장
-> <space>/relations/relations.json 저장
-> Wiki/Graph 갱신
```

### 9.2 수업 정리 텍스트 입력

수업 정리 텍스트는 텍스트 source와 동일한 흐름으로 처리한다.

제품에서는 이를 `수업 정리 텍스트 가져오기`로 표현한다. MVP는 파일 자체보다 정리된 텍스트를 PiecePool에 넣는 흐름을 우선한다.

### 9.3 PDF 입력

```text
사용자가 Subject 선택
-> Inbox에 PDF 입력
-> 원본 PDF를 <space>/sources/original-files/에 저장
-> PDF 텍스트 추출 실행
-> 추출 텍스트를 <space>/archive/*.md 저장
-> LLM 호출
-> 필요한 경우 Wiki에 ![[파일명.pdf#page=N]] embed 생성
-> <space>/wiki/*.md 및 <space>/relations/relations.json 저장
-> Wiki/Graph 갱신
```

PDF 파싱 실패 시:

- 실패 메시지를 보여준다.
- 이미 저장한 원본 PDF는 유지한다.
- 사용자가 텍스트를 직접 붙여넣어 계속 진행할 수 있게 한다.

### 9.4 이미지 입력

이미지 입력과 OCR은 제품 요구사항에 포함한다. 단, MVP 1차에서는 실제 OCR 완성 구현을 제외한다.

MVP 1차:

- `SourceType: "image"` 유지
- UI에 이미지 가져오기 진입점은 둘 수 있음
- 실제 OCR 처리는 MVP+1로 분리

MVP+1 OCR 흐름:

```text
Inbox에 이미지 입력
-> 원본 이미지를 <space>/sources/original-files/에 저장
-> OCR text extraction
-> <space>/archive/*.md 저장
-> LLM 호출
-> 필요한 경우 Wiki에 ![[파일명.png]] embed 생성
-> <space>/wiki/*.md 및 <space>/relations/relations.json 저장
-> Wiki/Graph 갱신
```

## 10. LLM 요구사항

MVP는 실제 LLM을 호출해야 한다.

LLM 입력:

- Source 제목
- Source 텍스트
- Source 원본 파일 정보
- Subject 메타데이터
- 기존 Concept 제목 목록
- 필요 시 관련 WikiPage 요약

LLM 출력은 구조화된 JSON으로 받는다. 앱은 이 JSON을 검증한 뒤 Markdown 파일과 relation 메타데이터로 변환한다.

LLM 출력 WikiPage는 사람이 읽기 쉬워야 한다. 동시에 앱과 이후 LLM 호출이 다시 이해하기 쉽도록 sourceIds, sourceRefs, relation metadata를 유지해야 한다.

LLM은 PDF/이미지 원본이 개념 이해에 직접 도움이 되는 경우에만 Wiki 본문에 `![[...]]` embed를 넣는다. 단순 출처 표기는 `[[...]]` 링크로 충분하다.

기대 출력:

```ts
type LlmWikiResult = {
  concepts: Array<{
    title: string;
    aliases?: string[];
    summary: string;
    explanation: string;
    examples: string[];
    sourceRefs: SourceRef[];
    sourceEmbeds: string[];
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

LLM은 archive 노트를 덮어쓰면 안 된다. LLM의 역할은 wiki page 생성/업데이트와 relation 메타데이터 생성이다.

## 11. Markdown 요구사항

### 11.1 Markdown 편집기

MVP는 Markdown 편집기를 포함한다.

필수 기능:

- ArchiveNote 열기
- WikiPage 열기
- Markdown 편집
- 실제 `.md` 파일 저장
- 앱 재실행 후 저장 내용 복원
- 문서 메타데이터 표시

Markdown preview 또는 split view는 MVP에서 구현한다. 단, 편집 안정성이 preview보다 우선이다.

### 11.2 Frontmatter

Markdown 파일은 frontmatter를 사용한다.

Archive note 예시:

```md
---
id: source-transformer-week3
type: archive
sourceType: pdf
title: Transformer Week 3 Lecture
subjectIds:
  - subject-ai
createdAt: "2026-05-28T12:00:00+09:00"
---

# Transformer Week 3 Lecture

이 문서는 Transformer 3주차 강의 PDF에서 추출한 원문 텍스트다.
```

Wiki page 예시:

```md
---
id: wiki-self-attention
type: wiki
conceptId: concept-self-attention
title: Self-Attention
subjectIds:
  - subject-ai
sourceIds:
  - source-transformer-week3
sourceRefs:
  - id: source-ref-transformer-week3-page-12
    sourceId: source-transformer-week3
    file: transformer-week3.pdf
    page: 12
    embed: true
    reason: "Self-Attention 수식과 설명이 있는 핵심 근거 page"
updatedAt: "2026-05-28T12:30:00+09:00"
---

# Self-Attention

Self-Attention은 sequence 안의 token들이 서로의 관계를 계산해 문맥 표현을 만드는 mechanism이다.

## 근거 원본

![[transformer-week3.pdf#page=12]]

관련 원본: [[transformer-week3.pdf]]
```

### 11.3 Wiki 파일 링크와 embed 문법

Wiki는 Obsidian식 파일 링크와 embed 문법을 사용한다.

```md
[[transformer-week3.pdf]]
[[transformer-week3.pdf#page=12]]
![[transformer-week3.pdf]]
![[transformer-week3.pdf#page=12]]
![[attention-diagram.png]]
```

규칙:

- `[[...]]`는 원본 파일 링크다.
- `![[...]]`는 inline embed다.
- PDF embed는 Wiki 읽기 화면에서 PDF preview를 그 위치에 표시한다.
- `#page=N`이 있으면 해당 PDF page를 우선 표시한다.
- 이미지 embed는 Wiki 읽기 화면에서 이미지 preview를 그 위치에 표시한다.
- embed를 클릭하면 확대 보기 또는 원본 뷰어를 연다.
- 파일 탐색 기준은 해당 지식 영역의 `<space>/sources/original-files/`다.
- `sourceRefs` frontmatter는 앱/LLM용 구조화 메타데이터이고, `[[...]]`/`![[...]]`는 사용자가 직접 읽고 편집하는 Markdown 표현이다.
- `sourceRefs`와 본문 embed가 서로 충돌하면 앱은 사용자에게 충돌 상태를 보여주고 자동으로 삭제하거나 덮어쓰지 않는다.

## 12. Graph View 요구사항

Graph View는 MVP의 핵심 화면이다. 단순 마인드맵이나 정적 시각화가 아니라, 사용자의 학습 맥락이 누적되는 타입이 있는 지식 그래프여야 한다.

### 12.1 Node

Node 종류:

- Concept
- WikiPage
- Source

Node 클릭 동작:

- Concept/WikiPage node 클릭 시 해당 WikiPage를 Markdown 편집기에서 연다.
- Source node 클릭 시 해당 ArchiveNote를 Markdown 편집기에서 연다.

### 12.2 Edge

Edge는 타입이 있는 relation을 표현한다.

Edge 상세 패널 표시 정보:

- 관계 타입
- 강도
- 신뢰도
- 설명
- 근거

Edge 클릭 시 사용자는 “왜 이 둘이 연결됐는지” 이해할 수 있어야 한다.

### 12.3 시각 표현

Graph View는 relation 정보를 시각적으로 드러내야 한다.

필수 표현:

- 관계 타입별 색상
- 강도별 edge 두께
- 강도별 불투명도
- 강도별 node 거리
- 선택된 edge label 표시
- hover 시 relation label 표시

거리 계산 기준:

```ts
function getLinkDistance(strength: number): number {
  const minDistance = 80;
  const maxDistance = 320;
  return maxDistance - strength * (maxDistance - minDistance);
}
```

### 12.4 Graph 조작

필수 기능:

- Subject 필터
- 검색
- 관계 타입 필터
- 선택된 node 상세
- 선택된 edge 상세

Graph는 실제 클릭/검색/필터가 동작해야 한다. 정적 데모 이미지로 대체할 수 없다.

## 13. 화면 요구사항

### 13.1 Workspace

목적:

- 단일 로컬 Workspace 상태를 보여준다.

필수 요소:

- Workspace 이름
- Workspace 로컬 경로
- Subject 목록
- archive 노트 수
- wiki page 수
- concept 수
- relation 수
- Inbox 상태
- Source 가져오기 진입
- Markdown 편집기 진입
- Wiki View 진입
- Graph View 진입

### 13.2 Source 가져오기

목적:

- 사용자가 학습 자료를 Inbox를 통해 Workspace로 넣는다.

필수 요소:

- Subject 선택
- Subject 즉시 생성
- Inbox 입력 영역
- 텍스트 붙여넣기
- 수업 정리 텍스트 가져오기
- PDF 업로드
- PDF 텍스트 추출
- 이미지 가져오기 진입점
- 원본 파일 보존 상태 표시
- ImportJob 상태 표시
- 완료 후 생성된 WikiPage/Relation 요약 표시

### 13.3 Markdown 편집기

목적:

- archive 노트와 wiki page를 읽고 편집한다.

필수 요소:

- 문서 목록 또는 파일 트리
- Markdown 편집기
- Markdown preview 또는 split view
- `[[...]]` 링크 렌더링
- `![[...]]` PDF/이미지 inline embed 렌더링
- 저장 상태 표시
- 실제 `.md` 파일 저장
- 메타데이터 표시

### 13.4 Wiki View

목적:

- Concept 중심 WikiPage를 탐색한다.

필수 요소:

- Subject 필터
- Concept 목록
- Wiki 상세
- 관련 source
- PDF/이미지 inline embed
- 관련 relation
- 헷갈리는 concept
- 관련 질문
- Markdown 편집기로 열기

### 13.5 Graph View

목적:

- 사용자의 개인 전공 지식 지도를 보여준다.

필수 요소:

- `<space>/wiki/`와 `<space>/relations/` 메타데이터 기반 graph 렌더링
- Subject 필터
- 검색
- Node 클릭
- Edge 클릭
- 근거 패널
- 관계 타입 시각화
- 강도 시각화

## 14. Seed 데이터

첫 실행과 개발 테스트를 위해 Seed 데이터를 포함한다.

Seed 과목:

- AI
- 운영체제
- 자료구조

AI 대표 concept:

- Transformer
- Self-Attention
- Multi-Head Attention
- Attention Head
- Embedding
- Backpropagation

AI 대표 relation:

- Self-Attention `part_of` Transformer
- Attention Head `part_of` Multi-Head Attention
- Embedding `used_in` Transformer
- Backpropagation `used_in` Model Training
- Self-Attention `confused_with` Attention

Seed 데이터는 하드코딩된 UI 상태만으로 만들지 않는다. 실제 Markdown 파일과 메타데이터로 구성한다.

## 15. 오류 처리

### 15.1 빈 입력

필수 입력이 비어 있으면 submit을 비활성화한다.

### 15.2 PDF 파싱 실패

처리:

- 실패 메시지 표시
- 원본 PDF가 저장된 경우 유지
- 사용자가 텍스트를 직접 붙여넣어 이어갈 수 있게 함

### 15.3 LLM 실패

처리:

- archive 노트는 유지
- ImportJob을 `failed`로 표시
- 재시도 제공
- 유효하지 않은 부분 wiki/relation 파일은 저장하지 않음

### 15.4 파일 저장 실패

처리:

- 실패한 경로 표시
- 편집기의 저장되지 않은 내용은 메모리에 유지
- 사용자가 권한 또는 Workspace 위치를 확인한 뒤 재시도 가능

### 15.5 Relation 메타데이터 오류

처리:

- 잘못된 relation entry는 무시
- 유효한 relation은 유지
- 개발 로그에 warning 표시

### 15.6 Source embed 오류

처리:

- `[[...]]` 또는 `![[...]]`가 가리키는 원본 파일이 없으면 깨진 링크 상태를 표시한다.
- PDF page 번호가 범위를 벗어나면 PDF 첫 page와 오류 메시지를 표시한다.
- `sourceRefs`와 Markdown 본문 embed가 충돌하면 자동 삭제나 덮어쓰기를 하지 않고 충돌 상태를 표시한다.
- embed 렌더링 실패가 WikiPage 전체 렌더링 실패로 이어지면 안 된다.

## 16. 검증 기준

### 16.1 Workspace

- 앱이 하나의 로컬 Workspace를 생성하거나 열 수 있다.
- `<space>/inbox/`, `<space>/archive/`, `<space>/wiki/`, `<space>/relations/`, `<space>/sources/`, `<space>/config/`를 읽을 수 있다.
- 앱 재실행 후 이전 상태가 복원된다.

### 16.2 Markdown 파일

- 텍스트 입력 시 `<space>/archive/*.md` 파일이 생성된다.
- PDF 가져오기 시 추출 텍스트가 `<space>/archive/*.md`로 저장된다.
- LLM 결과가 `<space>/wiki/*.md` 파일을 생성하거나 업데이트한다.
- WikiPage frontmatter에 `sourceRefs`가 저장된다.
- WikiPage 본문에 `![[파일명.pdf#page=N]]` embed가 저장될 수 있다.
- 편집기에서 수정한 wiki page가 실제 파일에 저장된다.
- 앱 재실행 후 수정 내용이 유지된다.

### 16.3 LLM 처리

- 텍스트 source가 실제 LLM 호출을 발생시킨다.
- PDF 추출 텍스트가 실제 LLM 호출을 발생시킨다.
- LLM 출력은 저장 전에 schema 검증을 통과해야 한다.
- Concept, WikiPage, Relation, Evidence, SourceRef가 LLM 출력에서 생성된다.
- LLM이 생성한 WikiPage는 사용자 친화적인 설명과 앱/LLM 친화적인 구조화 메타데이터를 함께 가진다.

### 16.4 PDF 파싱

- PDF 파일을 선택할 수 있다.
- 원본 PDF가 `<space>/sources/original-files/`에 저장된다.
- PDF에서 텍스트가 추출된다.
- 추출 텍스트가 <space>/archive Markdown으로 저장된다.
- Wiki에서 `![[파일명.pdf#page=N]]`가 해당 page preview로 렌더링된다.
- 파싱 실패 시 복구 흐름이 제공된다.

### 16.5 Graph View

- Graph가 local <space>/wiki와 <space>/relations 메타데이터에서 렌더링된다.
- Node 클릭 시 연결된 <space>/wiki 또는 <space>/archive 문서가 열린다.
- Edge 클릭 시 relation 상세 패널이 열린다.
- 관계 타입, 강도, 신뢰도, 설명, 근거가 표시된다.
- Subject 필터가 node/edge 범위를 바꾼다.
- 검색이 graph 표시 범위를 좁힌다.

### 16.6 Seed 데이터

- 첫 실행 Workspace에 AI, 운영체제, 자료구조 예시가 들어 있다.
- Seed 데이터는 실제 Markdown 파일과 메타데이터로 존재한다.
- 사용자가 자료를 넣기 전에도 Graph View를 확인할 수 있다.

## 17. 후속 범위

### 17.1 OCR

이미지 기반 자료에서 실제 OCR을 수행한다.

대상:

- 칠판 사진
- 필기 사진
- 스크린샷
- 이미지 기반 강의 자료

흐름:

```text
image
-> OCR 텍스트 추출
-> archive 노트
-> LLM wiki 업데이트
-> graph 업데이트
```

### 17.2 장기 전공 지식 지도

PiecePool의 가장 중요한 장기 가치는 개인 전공 지식 지도의 성장이다.

강화할 메타데이터:

- 학기
- 과목
- 교수
- 시험
- 과제
- 프로젝트
- 읽은 자료

이 정보들은 별도 Workspace를 만드는 기준이 아니라 하나의 Workspace 안에서 필터와 relation으로 작동해야 한다.

### 17.3 Today Task

Graph와 Wiki를 기반으로 복습 행동을 생성한다.

예:

- 헷갈리는 개념 복습
- 최근 추가된 WikiPage 확인
- 시험 관련 Concept 우선 복습

### 17.4 Project Flow

개념과 자료를 팀플, 연구, 포트폴리오, 캡스톤 같은 장기 프로젝트에 연결한다.

### 17.5 저장 구조 확장

후속 확장:

- IndexedDB UI cache
- SQLite query layer
- File watcher
- 외부 Markdown 수정 감지
- 선택적 sync account
- Obsidian 호환 vault mode

### 17.6 Relation scoring

Relation strength는 후속 버전에서 여러 신호를 합산해 계산한다.

```text
strength =
0.30 * semanticSimilarity
+ 0.25 * coOccurrence
+ 0.25 * llmConfidence
+ 0.10 * userInteraction
+ 0.10 * goalRelevance
```

## 18. 구현 계획에서 결정할 항목

다음은 PRD에서 고정하지 않고 구현 계획 단계에서 결정한다.

- Markdown 편집기 라이브러리
- Graph 렌더링 라이브러리
- Tauri에서의 PDF 파싱 방식
- LLM provider
- LLM structured output schema 세부 구현
- Relation 메타데이터를 단일 JSON으로 둘지, wiki frontmatter와 병행할지

PRD가 고정하는 것은 특정 라이브러리가 아니라 제품 동작과 데이터 계약이다.
