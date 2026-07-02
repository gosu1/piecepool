# Markdown Frontmatter (SSOT)

`<space>/archive/*.md` 및 `<space>/wiki/*.md` 파일의 YAML frontmatter 스키마.

> **본 문서가 단일 출처**다. 다른 폴더에서 frontmatter 예시 추가 시 본 문서 link 의무.
> **계약 변경**: [README.md#변경-절차](README.md#변경-절차) 참조.

---

## 1. 공통 규약

- 파일 시작 라인 `---`, 종료 라인 `---`
- YAML 1.2 (UTF-8, LF)
- ISO 8601 시각 표기 (예: `"2026-05-28T12:30:00+09:00"`)
- 문자열은 큰따옴표 권장 (Obsidian 호환)
- `id`는 ULID 또는 안정 식별자
- frontmatter 외 본문은 GitHub Flavored Markdown + Obsidian wikilink/embed ([wikilink-embed.md](wikilink-embed.md))

---

## 2. ArchiveNote

### 2.1 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✅ | ArchiveNote 식별자 |
| `type` | `"archive"` | ✅ | 고정값 |
| `sourceType` | `"text" \| "pdf" \| "summary_text" \| "image"` | ✅ | Source 타입 |
| `title` | string | ✅ | 사용자 표시명 |
| `subjectIds` | string[] | ✅ | Subject 식별자 목록 |
| `tags` | string[] | ⛔ | project 경계와 무관한 자유 해시태그 (선택) |
| `sourceId` | string | ✅ | 대응 Source.id |
| `originalFilePath` | string | ⛔/✅ | `pdf`/`image` 타입일 때만 필수 |
| `createdAt` | ISO 8601 | ✅ | 생성 시각 |
| `updatedAt` | ISO 8601 | ⛔ | 수정 시각 (선택) |

### 2.2 예시

```md
---
id: source-transformer-week3
type: archive
sourceType: pdf
title: Transformer Week 3 Lecture
subjectIds:
  - subject-ai
tags:
  - 딥러닝
sourceId: source-transformer-week3
originalFilePath: deeplearning/sources/original-files/transformer-week3.pdf
createdAt: "2026-05-28T12:00:00+09:00"
---

# Transformer Week 3 Lecture

이 문서는 Transformer 3주차 강의 PDF에서 추출한 원문 텍스트다.
```

**엔티티 정의**: [entities.md#archivenote](entities.md#archivenote)

---

## 3. WikiPage

### 3.1 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✅ | WikiPage 식별자 |
| `type` | `"wiki"` | ✅ | 고정값 |
| `conceptId` | string | ✅ | 대응 Concept.id |
| `title` | string | ✅ | 사용자 표시명 |
| `subjectIds` | string[] | ✅ | Subject 식별자 목록 |
| `tags` | string[] | ⛔ | project 경계와 무관한 자유 해시태그 (선택) |
| `sourceIds` | string[] | ✅ | 근거 Source.id 목록 |
| `sourceRefs` | [SourceRef](#sourceref-frontmatter)[] | ✅ | 본문 embed/link에 대응되는 구조화 참조 |
| `createdAt` | ISO 8601 | ✅ | 생성 시각 |
| `updatedAt` | ISO 8601 | ✅ | 수정 시각 |

### 3.2 SourceRef frontmatter

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✅ | SourceRef 식별자 |
| `sourceId` | string | ✅ | Source.id |
| `file` | string | ✅ | 원본 파일명 (예: `"transformer-week3.pdf"`) |
| `page` | number | ⛔ | PDF page (1-indexed) |
| `embed` | boolean | ✅ | true=inline preview, false=link only |
| `label` | string | ⛔ | 사용자 친화 라벨 |
| `reason` | string | ⛔ | 왜 이 위치에 참조했는지 |

### 3.3 예시

```md
---
id: wiki-self-attention
type: wiki
conceptId: concept-self-attention
title: Self-Attention
subjectIds:
  - subject-ai
tags:
  - 딥러닝
sourceIds:
  - source-transformer-week3
sourceRefs:
  - id: source-ref-transformer-week3-page-12
    sourceId: source-transformer-week3
    file: transformer-week3.pdf
    page: 12
    embed: true
    reason: "Self-Attention 수식과 설명이 있는 핵심 근거 page"
createdAt: "2026-05-28T12:30:00+09:00"
updatedAt: "2026-05-28T12:30:00+09:00"
---

# Self-Attention

Self-Attention은 sequence 안의 token들이 서로의 관계를 계산해 문맥 표현을 만드는 mechanism이다.

## 근거 원본

![[transformer-week3.pdf#page=12]]

관련 원본: [[transformer-week3.pdf]]
```

**엔티티 정의**: [entities.md#wikipage](entities.md#wikipage), [entities.md#sourceref](entities.md#sourceref)
**wikilink/embed 문법**: [wikilink-embed.md](wikilink-embed.md)

---

## 4. 검증 규칙

저장 전에 다음을 검증한다 (Backend 책임).

1. `type` 값이 `"archive"` 또는 `"wiki"`
2. `id`가 비어있지 않음
3. `subjectIds`의 각 ID가 실제 Subject 존재
4. WikiPage의 `sourceRefs[].sourceId`가 실제 Source 존재
5. WikiPage의 `sourceRefs[].file`이 `<space>/sources/original-files/` 아래 존재 (없으면 깨진 링크 표시, 저장은 허용)
6. ArchiveNote의 `originalFilePath`가 `pdf`/`image` 타입에서 빠지지 않음
7. ISO 8601 시각 파싱 성공

실패 시 처리는 `docs/20-backend/error-handling.md` (작성 예정).

---

## 5. 충돌 처리

`sourceRefs` (frontmatter)와 본문 `[[...]]`/`![[...]]`가 불일치하면 **자동 삭제·덮어쓰기 금지**. 사용자에게 충돌 상태 표시.

자세한 규약: [wikilink-embed.md#충돌-처리](wikilink-embed.md)

---

## 6. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §11.2 (line 697-750)을 분리·정리한 SSOT다.
- ArchiveNote frontmatter는 PRD에 부분 예시만 있었던 것을 본 리팩토링에서 표 형식으로 명세화했다.
- 2026-06-25: ArchiveNote/WikiPage frontmatter에 `tags`(선택, string[]) 추가 — `entities.md`의 `Source.tags` 추가와 동일 발의. 추적 = [#64](https://github.com/gosu1/piecepool/issues/64). `contracts-change` → 4역할 review.
