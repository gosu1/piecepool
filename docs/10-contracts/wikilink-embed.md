# Wikilink & Embed (SSOT)

Wiki 문서 본문에서 사용하는 Obsidian 호환 `[[...]]` / `![[...]]` 문법 규약.

> **본 문서가 단일 출처**다. 다른 폴더 예시는 본 문서 link로 대체.
> **계약 변경**: [README.md#변경-절차](README.md#변경-절차) 참조.

---

## 1. 문법 요약

| 문법 | 의미 | 렌더링 |
|---|---|---|
| `[[파일명]]` | 원본 파일 링크 | 클릭 가능한 link |
| `[[파일명#page=N]]` | 특정 PDF page 링크 | 클릭 시 PDF page N 열림 |
| `![[파일명]]` | 파일 inline embed | preview 표시 |
| `![[파일명#page=N]]` | 특정 PDF page inline embed | 해당 page preview |
| `![[이미지.png]]` | 이미지 inline embed | 이미지 preview |

---

## 2. 파일 탐색 기준

`[[파일명]]` / `![[파일명]]`의 파일 탐색 root는 **현재 지식 영역의 `<space>/sources/original-files/`** 다.

예: 지식 영역 `deeplearning/` 안의 WikiPage가 `[[transformer-week3.pdf]]`를 쓰면, 실제 파일은 `deeplearning/sources/original-files/transformer-week3.pdf`로 해석된다.

**다른 지식 영역의 파일 참조는 MVP 범위 외**. 추후 cross-space link 검토.

**폴더 정의**: [workspace-layout.md#sources/original-files](workspace-layout.md)

---

## 3. PDF page 지정

### 3.1 문법

```md
[[transformer-week3.pdf#page=12]]
![[transformer-week3.pdf#page=12]]
```

- `#page=N`은 1-indexed
- 정수만 허용 (range/list MVP 외)

### 3.2 범위 초과 처리

PDF 총 page 수보다 큰 N이 지정되면:
- 첫 page를 표시
- 본문에 "page=N이 범위 초과 (총 M page)" 오류 메시지

### 3.3 page 안의 좌표/highlight

MVP 범위 외. 후속 작업: `docs/70-roadmap/post-mvp.md`.

---

## 4. 이미지 embed

```md
![[attention-diagram.png]]
```

- `<space>/sources/original-files/attention-diagram.png` 기준 해석
- 지원 포맷: PNG, JPG, JPEG, WebP, SVG (MVP)
- 이미지 OCR 결과 활용은 후속 (`docs/70-roadmap/post-mvp.md`)

---

## 5. embed vs link 선택 기준

LLM이 WikiPage 생성 시 다음 기준을 따른다.

| 상황 | 사용 |
|---|---|
| PDF page가 개념 이해의 **핵심 근거** | `![[...]]` (embed) |
| 시각 다이어그램이 설명 보완에 필수 | `![[...]]` (embed) |
| 단순 출처 표기 | `[[...]]` (link) |
| 이미 본문에서 설명한 내용의 보조 | `[[...]]` (link) |

**Wiki가 원본 preview로 가득 차지 않도록 핵심 근거에만 embed 사용**.

---

## 6. frontmatter `sourceRefs`와의 관계

WikiPage frontmatter의 `sourceRefs` 배열은 본문 `[[...]]`/`![[...]]`에 **대응되는 구조화 메타데이터**다.

- 본문 = 사람이 직접 읽고 편집
- `sourceRefs` = 앱/LLM이 안정적으로 파싱

LLM은 본문에 embed를 만들 때 동시에 `sourceRefs`에 대응 entry를 추가한다.

**SourceRef 스키마**: [markdown-frontmatter.md#sourceref-frontmatter](markdown-frontmatter.md#3.2-sourceref-frontmatter)
**SourceRef 엔티티**: [entities.md#sourceref](entities.md#sourceref)

---

## 7. 충돌 처리

### 7.1 본문 embed가 `sourceRefs`에 없음

- WikiPage 렌더링은 정상 수행 (link/embed 모두 표시)
- 편집기에서 "구조화 메타데이터 누락" 경고 표시
- **자동으로 `sourceRefs`에 추가하지 않는다** (LLM 책임 영역 침범 방지)
- 사용자가 명시적으로 "구조화" 버튼 클릭 시 보강

### 7.2 `sourceRefs`에 있으나 본문에 embed/link 없음

- WikiPage 렌더링은 정상
- 편집기에서 "본문에 미사용 참조" 경고 표시
- **자동으로 본문에 삽입하지 않는다**
- 사용자가 명시적으로 삭제 또는 본문 삽입 결정

### 7.3 본문 embed가 가리키는 파일 없음

- 깨진 링크 상태 표시 (시각적 표식 + tooltip)
- WikiPage 전체 렌더링은 정상 진행 (해당 embed만 에러 표시)
- 사용자에게 파일 재업로드 또는 링크 수정 제안

### 7.4 PDF page 번호 범위 초과

- 첫 page 표시 + 오류 메시지 (§3.2)

---

## 8. 검증 / 렌더링 책임 분리

| 책임 | 위치 |
|---|---|
| frontmatter 스키마 검증 | Backend (저장 전) |
| 본문 link/embed 파싱 | Frontend (편집기/뷰어 컴포넌트) |
| PDF page preview 렌더링 | Frontend (PDF.js 등) |
| 충돌 감지 UI | Frontend |
| 깨진 링크 시각화 | Frontend |
| LLM이 생성한 embed의 `sourceRefs` 동기화 | LLM (생성 시) + Backend (검증) |

---

## 9. 예시 (참조용)

```md
# Self-Attention

Self-Attention은 sequence 안의 각 token이 다른 token과의 관계를 계산해 문맥 표현을 만드는 attention mechanism이다.

## 핵심 근거 page

![[transformer-week3.pdf#page=12]]

## 보조 다이어그램

![[attention-diagram.png]]

## 관련 원본

전체 강의: [[transformer-week3.pdf]]
```

대응되는 frontmatter (요약):

```yaml
sourceRefs:
  - id: ref-1
    sourceId: source-transformer-week3
    file: transformer-week3.pdf
    page: 12
    embed: true
    reason: "Self-Attention 수식 근거"
  - id: ref-2
    sourceId: source-attention-diagram
    file: attention-diagram.png
    embed: true
    reason: "구조 시각화"
  - id: ref-3
    sourceId: source-transformer-week3
    file: transformer-week3.pdf
    embed: false
    label: "전체 강의"
```

---

## 10. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §7.4 (line 171-229) + §11.3 (line 752-774)을 통합·재구성한 SSOT다.
- 충돌 처리 4종(§7)은 PRD §15.6 (line 1005-1012)을 본 문서로 이전·확장했다.
- 책임 분리 매트릭스(§8)는 본 리팩토링에서 신규 명시했다.
