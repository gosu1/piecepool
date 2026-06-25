# Markdown Editor

`archive/*.md` / `wiki/*.md` 본문을 직접 편집하는 화면. raw markdown과 렌더링 결과를 나란히 보여주는 split view.

> 문법/저장 규약의 단일 출처는 [`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md), [`../../10-contracts/markdown-frontmatter.md`](../../10-contracts/markdown-frontmatter.md)다. 본 문서는 React 구현 설계만 다룬다.

상태: 🔜 MVP 예정

---

## 1. 범위

- 라우트 `/editor` ([`../architecture.md`](../architecture.md) §2) — 기존 ArchiveNote/WikiPage 파일을 열어 본문(body)을 수정·저장
- split view: 좌측 raw markdown 편집, 우측 렌더링 프리뷰
- 렌더링 프리뷰는 `wikilink.md`/`embed-renderer.md`의 컴포넌트를 그대로 재사용 — 본 문서에서 재정의하지 않음
- 이미지/파일 인라인 첨부 (기존 노트 보강, §7)
- frontmatter 필드 직접 편집은 **범위 밖** (§4)

`screens/inbox.md`의 "신규 note 작성"과는 분리된 화면이다 — Inbox는 `Source` 생성, 본 문서는 이미 생성된 `ArchiveNote`/`WikiPage`의 사후 수정을 다룬다.

---

## 2. 에디터 라이브러리 선정

후보를 세 그룹으로 나눠 비교한다 ([`open-questions.md`](../../00-overview/open-questions.md) §1 "Markdown 편집기 라이브러리" 항목 결정).

**A. 원문 텍스트만 편집, 미리보기는 별도 컴포넌트로 직접 구현**

| 후보 | ⭐ | 비고 |
|---|---|---|
| `@uiw/react-codemirror` (CodeMirror 6) | 2.2k(wrapper) / 7.8k(core) | 가볍고 모듈식, 입력한 글자를 그대로 유지 — **채택** |
| `microsoft/monaco-editor` | 46.2k | VS Code 엔진. 코드 편집 특화 기능(자동완성, 디버깅 연동 등)을 다 포함해 무겁고, `.dmg`/`.pkg` 용량 예산([`packaging.md`](../packaging.md))에 부담 |
| EasyMDE 등 CodeMirror 5 계열 | 3k | 구버전(CM5) 엔진 기반, 신규 프로젝트는 CM6로 이동하는 추세라 확장성이 떨어짐 |

**B. 마크다운 전용, 분할화면(원문/미리보기)이 내장된 올인원**

| 후보 | ⭐ | 비고 |
|---|---|---|
| `@uiw/react-md-editor` | 2.9k | React 전용, split view 기본 제공 |
| `nhn/tui.editor` | 18k | 더 유명하나 차트/표 등 불필요한 기능까지 포함돼 더 무거움 |

두 후보 모두 **내장 미리보기가 일반 마크다운만 해석**한다 — `[[파일명]]` 같은 우리 전용 wikilink 문법은 모른다. 결국 그 미리보기를 떼어내고 `wikilink.md`/`embed-renderer.md`의 우리 컴포넌트로 바꿔 끼워야 하므로, "분할화면 내장"이라는 이 그룹의 핵심 장점이 우리 경우엔 사라진다.

**C. 보이는 대로 편집(WYSIWYG)**

| 후보 | ⭐ | 비고 |
|---|---|---|
| `Saul-Mirone/milkdown` | 11.6k | 마크다운을 직접 읽고/쓰지만, `[[...]]` 문법을 알아듣게 하려면 커스텀 플러그인 직접 구현 필요 |
| `ueberdosis/tiptap` | 37.4k | 문서를 HTML/ProseMirror 구조로 다룬다 — 마크다운으로 저장할 때 변환 과정에서 `[[...]]`/`![[...]]`가 깨질 위험 |
| `facebook/lexical` | 23.6k | TipTap과 동일한 구조적 문제(HTML/JSON 문서가 기본, 마크다운은 변환 플러그인을 거침) |

**결정**: 오른쪽 미리보기는 어차피 `wikilink.md`/`embed-renderer.md`에서 직접 만든 컴포넌트를 쓰므로 B그룹의 장점이 무효화되고, C그룹은 전부 "보이는 모양 ↔ 실제 글자" 변환 과정에서 `[[...]]`/`![[...]]` 리터럴 문법이 깨질 위험을 안고 있다. A그룹의 CodeMirror 6는 입력한 글자를 그대로 유지하면서 가볍다는 점에서 채택. (Frontend #2 결정, 2026-06-25 — [`open-questions.md`](../../00-overview/open-questions.md) §6에 기록)

---

## 3. 화면 구성

```
┌──────────────────┬──────────────────┐
│ raw markdown      │ 렌더링 프리뷰      │
│ (CodeMirror 6,    │ (wikilink.md +    │
│  markdown 강조)    │  embed-renderer.md│
│                    │  컴포넌트 재사용)   │
└──────────────────┴──────────────────┘
│ frontmatter 요약 chip (읽기 전용, §4)  │
└────────────────────────────────────┘
```

- 두 패널은 동일 스크롤 위치를 따라가지 않음(MVP) — 단순 동기화 비용 대비 이득이 작다고 판단
- rendered-only 단일 패널 보기로 전환하는 토글 제공 (좁은 창 대응)

정확한 분할 비율·spacing은 `design-tokens.md`(Design #4, 핸드오프 대기 중) 확정 후 반영한다 (`wikilink.md` §5, `inbox.md` §3과 동일 원칙).

---

## 4. Frontmatter 처리 — 본문만 편집, 구조 필드는 읽기 전용

`id`/`title`/`subjectIds`/`sourceIds`/`sourceRefs` 등 frontmatter 필드는 화면 상단에 **읽기 전용 chip**으로만 표시한다. 사용자가 YAML을 직접 편집하게 하지 않는다.

**이유**: `markdown-frontmatter.md` §4 검증 규칙(필수 필드, ID 존재 여부, ISO 8601 등)을 사용자가 손으로 깨뜨릴 수 있는 경로를 열어두지 않기 위함. `title` 변경은 별도 인라인 입력(작은 텍스트 필드)으로만 허용 — 나머지는 MVP에서 변경 불가.

저장 시 IPC(`write_note`/`write_wiki_page`, [`../../20-backend/ipc-api.md`](../../20-backend/ipc-api.md) §5~§6)에는 **원본 frontmatter + 수정된 본문**을 합쳐 전체 markdown 문자열로 넘긴다. frontmatter 직렬화 자체는 화면이 만들지 않고, 열 때 읽은 원본 블록을 그대로 보존한다.

---

## 5. ArchiveNote vs WikiPage 편집 차이

| | ArchiveNote | WikiPage |
|---|---|---|
| 본문 성격 | 사용자 원문 (CLAUDE.md: LLM이 덮어쓸 수 없는 영역) | LLM 생성물, 구조화 메타데이터(`sourceRefs`)와 분리 보관 |
| 자유 편집 | 본문 전체 자유 편집 | 본문 자유 편집 가능하나 §6 충돌 규칙 적용 |
| 저장 IPC | `write_note(path, markdown)` | `write_wiki_page(path, markdown)` |

WikiPage 편집은 본문의 `[[...]]`/`![[...]]`와 frontmatter `sourceRefs`가 어긋날 수 있다는 점에서 ArchiveNote 편집과 다르다 — 본 화면이 그 어긋남을 사용자에게 보여주는 지점이다(§6).

---

## 6. Wikilink/Embed 충돌 표시 (WikiPage 전용)

[`wikilink-embed.md`](../../10-contracts/wikilink-embed.md) §7을 화면 UI로 그대로 구현한다.

| 상황 (계약 §7) | 화면 표시 |
|---|---|
| 본문 embed가 `sourceRefs`에 없음 (§7.1) | 경고 배너 "구조화 메타데이터 누락" + "구조화" 버튼 — 클릭 시에만 `sourceRefs`에 추가 (자동 추가 금지) |
| `sourceRefs`에 있으나 본문에 없음 (§7.2) | 경고 배너 "본문에 미사용 참조" + 삭제/본문삽입 버튼 — 둘 다 사용자 명시적 선택 |
| 본문 embed 대상 파일 없음 (§7.3) | 깨진 표시 + tooltip — `embed-renderer.md` §5 컴포넌트 그대로 재사용 |

자동으로 양쪽을 동기화하지 않는 원칙은 계약과 동일하게 유지한다 — 화면은 "보여주고 사용자가 결정"까지만 책임진다.

---

## 7. 이미지/파일 인라인 첨부 (기존 노트 보강)

`screens/inbox.md` §4와 동일한 드래그→인라인 첨부 인터랙션을 재사용한다. 신규 작성(Inbox)과의 차이:

| | Inbox (신규 작성) | 본 문서 (기존 노트 보강) |
|---|---|---|
| 첨부 후 처리 | `ocr-client.md` 1차 vision 호출 → 2차 LLM 호출(Concept 추출)까지 자동 진행 | 1차 vision 호출로 본문에 텍스트/설명 블록 삽입만, **2차 LLM 재호출은 트리거하지 않음** (사용자가 명시적으로 "재처리" 액션을 눌러야 `ImportJob` 재실행) |
| 근거 | 편집 중 첨부마다 전체 재추출을 돌리면 기존 Concept/Relation이 의도치 않게 바뀔 수 있음 — `WikiPage 본문 LLM 재생성 정책` 자체가 [`open-questions.md`](../../00-overview/open-questions.md) §5 미결 항목이라 보수적으로 자동 트리거를 막아둠 |

원본 파일은 동일하게 `sources/original-files/`에 보존 ([`workspace-layout.md`](../../10-contracts/workspace-layout.md)).

---

## 8. 저장 파이프라인

```
편집 (raw markdown 본문 수정 [+ 이미지 첨부])
            ↓
        "저장" 버튼 클릭 (자동저장 MVP 제외)
            ↓
        원본 frontmatter + 수정 본문 합쳐 markdown 문자열 구성
            ↓
        ArchiveNote → write_note(path, markdown)
        WikiPage    → write_wiki_page(path, markdown)
            ↓
        성공 시 화면 내 저장 상태 표시 / 실패 시 AppError 메시지 토스트
```

라우트 이탈 시 미저장 변경이 있으면 확인 다이얼로그를 띄운다 (정확한 문구/스타일은 `component-states.md` 핸드오프 대기).

---

## 9. MVP 범위

| 항목 | MVP | 후속 |
|---|---|---|
| split view (raw/렌더링) | ✅ | — |
| ArchiveNote/WikiPage 본문 편집 + 저장 | ✅ | — |
| frontmatter 구조 필드 편집 | ⛔ (읽기 전용, §4) | post-MVP 필요성 재검토 |
| wikilink/embed 충돌 경고 UI | ✅ | — |
| 이미지 첨부 시 자동 재추출 | ⛔ (수동 "재처리" 액션만) | `WikiPage 재생성 정책` 결정 후 ([open-questions §5](../../00-overview/open-questions.md)) |
| 자동저장 | ⛔ | post-MVP |
| 두 패널 스크롤 동기화 | ⛔ | post-MVP |

---

## 10. 의존 문서

- [`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md) — 문법/충돌 처리 SSOT
- [`../../10-contracts/markdown-frontmatter.md`](../../10-contracts/markdown-frontmatter.md) — ArchiveNote/WikiPage frontmatter 검증
- [`../../10-contracts/workspace-layout.md`](../../10-contracts/workspace-layout.md) — `sources/original-files/` 경로
- [`../../20-backend/ipc-api.md`](../../20-backend/ipc-api.md) §5~§6 — `write_note`/`write_wiki_page`
- [`../../00-overview/open-questions.md`](../../00-overview/open-questions.md) §5, §6 — WikiPage 재생성 정책(미결), 에디터 라이브러리 결정 기록
- `wikilink.md` / `embed-renderer.md` — 렌더링 프리뷰 컴포넌트 재사용 (PR #57/#58, 병합 대기 — 머지 후 링크로 교체)
- `screens/inbox.md` §4 — 이미지 첨부 인터랙션 출처
- [`../architecture.md`](../architecture.md) §2 — 라우팅 `/editor`
- [`../README.md`](../README.md) — 40-frontend 영역 개요
