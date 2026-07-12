# Workspace Layout (SSOT)

PiecePool Workspace 폴더 구조. 모든 역할이 본 문서를 단일 출처로 참조한다.

> **계약 변경 절차**: [README.md](README.md#변경-절차) 참조.

---

## 1. Workspace 정의

**Workspace**는 하나의 로컬 폴더다. 사용자는 하나의 Workspace만 운용한다.

- 과목, 학기, 시험, 프로젝트는 Workspace 분리 기준이 **아니다** → 메타데이터/필터로 표현
- Workspace 하위에 **지식 영역 폴더**(예: `deeplearning/`, `operating-systems/`)가 위치
- 1학년 1학기에 시작한 Workspace가 4학년까지 동일 폴더로 유지된다

---

## 2. 권장 폴더 트리

```text
PiecePool Workspace/
  config/
    workspace.json              # 전체 Workspace 설정
    spaces.json                 # 지식 영역 폴더 목록 + 표시 정보
  deeplearning/                 # 지식 영역 폴더 (KnowledgeSpace)
    inbox/                      # 처리 전 임시 입력
      transformer-week3.pdf
      user-pasted-note.md
    archive/                    # 사용자 원문 / 추출 텍스트 (.md)
      2026-05-28-transformer-lecture-summary.md
      2026-05-28-attention-paper-notes.md
    wiki/                       # LLM이 정리한 Concept 중심 WikiPage (.md)
      transformer.md
      self-attention.md
      embedding.md
    relations/                  # 관계 메타데이터
      relations.json
    sources/                    # 원본 파일 보존
      original-files/
        transformer-week3.pdf
        attention-diagram.png
    config/
      subjects.json             # 해당 지식 영역의 과목 목록
    seed/
      demo-data.json
  operating-systems/            # 다른 지식 영역 폴더
    inbox/
    archive/
    wiki/
    relations/
    sources/
    config/
  data-structures/
    ...
```

---

## 3. 디렉토리 책임

### 3.1 `config/` (Workspace 루트)

| 파일 | 내용 |
|---|---|
| `workspace.json` | Workspace 식별자, 이름, 생성/수정 시각 |
| `spaces.json` | 지식 영역 폴더 목록, slug, 표시 이름 |

### 3.2 지식 영역 폴더 (`<space>/`)

`deeplearning/`, `operating-systems/` 등. 본 폴더 자체는 **독립 Workspace가 아니다**. 앱은 하나의 Workspace를 열고 그 안의 여러 `<space>/`를 읽는다.

**엔티티 정의**: [entities.md#knowledgespace](entities.md#knowledgespace)

### 3.3 `<space>/inbox/`

사용자가 처음 자료를 넣는 입력 공간.

저장 대상:
- 사용자가 업로드한 PDF
- 사용자가 업로드한 이미지
- 사용자가 붙여넣은 임시 텍스트
- LLM 정리·archive 변환 전 자료

처리 완료 후 유지 여부는 앱 설정. **원본 보존 기준은 inbox가 아닌 `<space>/sources/original-files/`다**.

### 3.4 `<space>/archive/`

사용자가 제공한 원문 텍스트 보존소 (Markdown).

저장 대상:
- 직접 붙여넣은 텍스트
- PDF에서 추출한 텍스트
- 수업 정리 텍스트
- 사용자가 직접 작성한 노트

**LLM 결과로 archive 노트를 덮어쓰지 않는다**. 원본 맥락은 영구 보존.

**엔티티 정의**: [entities.md#archivenote](entities.md#archivenote)
**Frontmatter 스키마**: [markdown-frontmatter.md#archive-note](markdown-frontmatter.md)

### 3.5 `<space>/wiki/`

LLM이 개념 중심으로 정리한 WikiPage 저장소 (Markdown).

- 각 WikiPage = 하나의 `.md` 파일
- 사용자는 직접 열고 편집 가능
- 사용자 친화적 설명 + 앱/LLM 친화적 구조화 메타데이터 동시 보유
- 외부 마크다운 에디터 호환 `[[...]]` / `![[...]]` 문법 지원

**엔티티 정의**: [entities.md#wikipage](entities.md#wikipage)
**Frontmatter 스키마**: [markdown-frontmatter.md#wiki-page](markdown-frontmatter.md)
**Wikilink/embed 문법**: [wikilink-embed.md](wikilink-embed.md)

### 3.6 `<space>/relations/`

Concept 간 relation과 근거 메타데이터.

MVP: 지식 영역 폴더당 `relations.json` 하나. 데이터 증가 시 분할 검토.

**엔티티 정의**: [entities.md#relation](entities.md#relation)
**Relation 타입**: [relation-types.md](relation-types.md)

### 3.7 `<space>/sources/original-files/`

원본 파일 보존소. 추출 텍스트(archive)와 분리.

저장 대상:
- 업로드된 PDF 원본
- 이미지 원본
- 추후: 음성/웹 등

Wiki에서 `[[파일명]]` / `![[파일명]]` 문법으로 참조하는 대상은 본 디렉토리 기준으로 해석한다.

**참조 규약**: [wikilink-embed.md](wikilink-embed.md)

### 3.8 `<space>/config/`

| 파일 | 내용 |
|---|---|
| `subjects.json` | 해당 지식 영역의 과목 메타데이터 |

**엔티티 정의**: [entities.md#subject](entities.md#subject)

### 3.9 `<space>/seed/` (선택)

첫 실행 데모용 시드 데이터. Backend가 본 폴더의 정의를 읽어 실제 `archive/`, `wiki/`, `relations/`에 파일을 생성한다.

---

## 4. 명명 규약

| 대상 | 규약 | 예시 |
|---|---|---|
| 지식 영역 폴더 slug | kebab-case, ASCII 소문자 | `deeplearning`, `operating-systems` |
| archive 파일명 | `YYYY-MM-DD-slug.md` | `2026-05-28-transformer-lecture.md` |
| wiki 파일명 | concept slug `.md` (소문자 영문/숫자/하이픈) | `self-attention.md` |
| sources/original-files 파일명 | 원본 파일명 보존 (가능 시) | `transformer-week3.pdf` |
| `relations.json` 인코딩 | UTF-8, LF 줄바꿈, 2-space indent | — |

---

## 5. 외부 에디터 호환 가이드

추후 외부 마크다운 볼트로도 동작 가능하도록 다음을 유지한다.

- 모든 사람 읽기 대상 문서 = Markdown (`.md`)
- Frontmatter = YAML (`---` 구분자)
- Wikilink = `[[파일명]]`
- Embed = `![[파일명]]`
- 디렉토리 구조 = 사용자가 직접 탐색 가능한 평탄한 트리

외부 에디터 미지원 자산(예: `relations/relations.json`)은 별도 폴더에 격리해 본문 충돌을 피한다.

---

## 6. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §7 (line 95-268)을 분리·재구성한 SSOT다.
- 향후 변경은 [README.md#변경-절차](README.md#변경-절차)에 따른다.
