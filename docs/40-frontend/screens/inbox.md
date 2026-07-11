# Inbox

PiecePool 사용자 첫 진입 화면. 글/이미지를 작성해 하나의 `Source`로 저장하고 import 파이프라인에 넘긴다.

> 화면 모델의 단일 출처는 [`../../00-overview/scope-mvp.md`](../../00-overview/scope-mvp.md) §2.3이다. 본 문서는 React 구현 설계 + entity 매핑만 다룬다.

상태: 🔜 MVP 예정

---

## 1. 범위

- 제목 입력 + 속성 패널(§2) + Markdown 본문 작성으로 note 1개를 만들고 저장하는 화면
- 저장 시 `Source` 1개 생성, `<space>/archive/*.md`로 영속화 ([`entities.md#source`](../../10-contracts/entities.md#source))
- 라우트: `/inbox`, 첫 진입 리다이렉트 대상 ([`../architecture.md`](../architecture.md) §2)

본문 Markdown 입력 자체(텍스트 편집 위젯, 이미지 드래그→인라인 첨부 인터랙션)는 `screens/markdown-editor.md`([#21](https://github.com/gosu1/piecepool/issues/21))가 소유하는 컴포넌트를 그대로 재사용한다 — `wiki-view.md`가 `wikilink.md`/`embed-renderer.md`를 재사용하는 것과 같은 구조. 본 문서는 Inbox 화면의 레이아웃·속성 패널·저장 트리거만 다룬다.

---

## 2. 속성 패널 ↔ entity 매핑

`scope-mvp.md` §2.3: "제목, resource, project, 고정하기, 연결된 node들이 화면에 표시된다" (첨부된 예시 화면은 Notion 캡처 그 자체이며 PiecePool 자체 목업이 아니다). 각 속성을 현재 SSOT(`entities.md`)와 대조한 결과:

| 속성 | 매핑 | 근거 |
|---|---|---|
| 제목 | `Source.title` / `ArchiveNote.title` | 1:1 대응, 추가 결정 불필요 |
| project | `KnowledgeSpace` 선택 | "project에 넣는 화면을 고른다"(§2.3 원문)가 곧 어느 `<space>/`에 저장할지 고르는 동작과 동일. `useWorkspaceStore`의 현재 선택값을 기본값으로 노출, Inbox 화면에서 즉시 변경 가능 |
| resource(자원) | **신규 `Source.tags` 필드** (project 경계와 무관한 자유 해시태그) | @gosu1 확인(2026-06-24, Slack): `#주식`, `#딥러닝`처럼 어느 project에 있든 자유롭게 붙이는 태그 기능. `Subject`는 `spaceId`로 project(KnowledgeSpace) 1개에 종속되므로 요구사항 충족 불가 → 신규 필드 필요. [이슈 #64](https://github.com/gosu1/piecepool/issues/64)로 `contracts-change` 제안, 머지 대기 |
| 고정하기 | **MVP 제외** | `Source`/`ArchiveNote`에 대응 필드 없음(`pinned: boolean` 미정의). 추가하려면 `entities.md` 변경 → `contracts-change` 라벨 + 4역할 review 필요. 별도 결정 없이는 post-MVP로 보류 |
| 연결된 node | **Inbox 단계에서 표시 안 함** | Inbox 시점엔 `Source`만 존재 — `Concept`/`Relation`은 LLM 처리(§4 `llm_processing`) 이후에야 생성된다. 근거 데이터가 없는 시점에 표시할 수 없음. 처리 완료 후엔 `wiki-view.md`/`graph-view.md`에서 의미를 가짐 |

---

## 3. 화면 구성

Notion 페이지 모델([`../../00-overview/scope-mvp.md`](../../00-overview/scope-mvp.md) §2.3 예시 화면 그대로): 상단 제목 입력 + 속성 패널(project 선택 dropdown, 자유 해시태그 입력) + 하단 Markdown 본문 편집 영역.

```
┌─────────────────────────────┐
│ 제목 입력                    │
├─────────────────────────────┤
│ project: [KnowledgeSpace ▾] │
│ resource: [#해시태그 입력 +] │
├─────────────────────────────┤
│ Markdown 본문 편집 영역       │
│ (markdown-editor.md 컴포넌트 │
│  재사용 — 이미지 인라인 첨부) │
└─────────────────────────────┘
```

정확한 spacing·타이포그래피는 `design-tokens.md`(Design #4, 핸드오프 대기 중) 확정 후 반영한다 (`wikilink.md` §5와 동일 원칙).

---

## 4. 이미지 첨부 연계

본문에 이미지를 인라인 첨부하면 `ocr-client.md`(PR #55, 병합 대기) 파이프라인이 그대로 적용된다:

- 첨부 시 사용자가 이미지 설명을 직접 입력 가능 (`ocr-client.md` §4)
- 저장 시 `[텍스트 그대로]` / `[사용자 설명]` / `[그림 설명 — AI 해석]` 3블록으로 archive에 보존 (`ocr-client.md` §4~§5)

별도 dropzone 컴포넌트는 두지 않는다 ([#27](https://github.com/gosu1/piecepool/issues/27) 흡수 완료, [#21](https://github.com/gosu1/piecepool/issues/21) 참조).

---

## 5. 저장 파이프라인

```
Inbox 작성 (제목 + project 선택 + 해시태그(tags) + Markdown 본문 [+ 이미지])
            ↓
        저장 클릭 → save_source IPC (ipc-api.md §4)
            ↓
        ImportJob 생성 — status: parsing
            (텍스트: 그대로 / PDF: extract_pdf_text / 이미지: ocr-client.md 1차 vision 호출)
            ↓
        status: archiving — Source + ArchiveNote 저장 (archive/*.md, frontmatter 검증)
            ↓
        [핵심 주제 게이트] 설명 안 한 핵심 주제가 있으면 → llm_processing 건너뜀 (노트는 저장됨)
            ↓
        status: llm_processing — Concept/WikiPage/Relation 추출 (2차 LLM 호출)
            ↓
        status: writing — wiki/*.md + relations.json 저장
            ↓
        status: completed
```

`ImportJobStatus` 전이는 [`entities.md#importjob`](../../10-contracts/entities.md#importjob)을 그대로 따른다 — 본 문서에서 재정의하지 않는다.

---

## 6. 파인만 pill + 핵심 주제 게이트

**`파인만` pill은 토글이 아니라 액션이다.** 누르면 지금 쓰고 있는 글 전체를 자기 말로 설명하게 하는 파인만 패널이 열린다(저장을 기다리지 않는다). 섹션 하나만 하려면 에디터에서 그 부분을 드래그하거나 `##`/`###` 제목 줄에 마우스를 올려 제목 끝의 `파인만` 버튼을 누른다. 판정은 오직 사용자가 하고, 설명을 한 번도 쓰지 않으면 `[네, 이해했어요]`를 누를 수 없다.

- 저장 전 초안에서 한 파인만은 **저장 시 방금 만들어진 노트로 이관**되고, 사용자가 쓴 설명이 위키 생성 입력에 함께 들어간다.
- 대화는 메모리 전용. 판정 결과(answered/understood + 사용자가 쓴 설명)만 `localStorage`(`pp-feynman-sections`)에 남는다.

**`저장 + AI 정리`(AI 생성 on)에는 핵심 주제 게이트가 걸린다.** Gemini가 노트의 `##` 섹션 중 핵심 주제를 판별하고, 그 주제를 파인만에 답하고 "이해했다"고 선언하지 않았으면 위키를 만들지 않는다.

- **노트(`archive/`)는 언제나 저장된다** — 막는 것은 wiki뿐이다. 차단 시 어느 주제가 막는지 하단 토스트로 알려준다.
- 키가 없거나 판별에 실패하면 게이트를 걸지 않는다(fail-open).
- `AI 생성` pill을 끄면 위키 없이 원본만 저장한다(게이트도 무의미).

흐름·상태 전이는 [`../../20-backend/import-job-states.md`](../../20-backend/import-job-states.md), 판정 규칙은 [`../../30-llm/output-validation.md`](../../30-llm/output-validation.md) §6.

---

## 7. MVP 범위

| 항목 | MVP | 후속 |
|---|---|---|
| 제목 입력 | ✅ | — |
| project(KnowledgeSpace) 선택 | ✅ | — |
| resource → `tags` 해시태그 | ⏸ `entities.md` 변경 대기 ([#64](https://github.com/gosu1/piecepool/issues/64)) | 변경 머지되면 MVP 포함 |
| Markdown 본문 + 이미지 인라인 첨부 | ✅ (`markdown-editor.md` 컴포넌트 재사용) | — |
| 고정하기 | ⛔ | post-MVP, `entities.md` 변경(`contracts-change`) 필요 |
| 연결된 node 표시 | ⛔ (Inbox 단계엔 근거 데이터 없음) | `wiki-view.md`/`graph-view.md`에서 구현 |
| 파인만 UI 표시 방식 | ✅ 인라인 패널(`FeynmanPanel`) — `파인만` pill(액션) · 제목 줄 호버 버튼 · 드래그 선택 | — |
| 핵심 주제 게이트 (`저장 + AI 정리`) | ✅ (§6) | — |

---

## 8. 의존 문서

- [`../../10-contracts/entities.md`](../../10-contracts/entities.md) — `Source`, `KnowledgeSpace`, `Subject`, `ArchiveNote`, `ImportJob`
- [`../../10-contracts/workspace-layout.md`](../../10-contracts/workspace-layout.md) — `<space>/inbox/`, `<space>/archive/`
- [`../../10-contracts/markdown-frontmatter.md`](../../10-contracts/markdown-frontmatter.md) — ArchiveNote frontmatter 검증
- [`../../00-overview/scope-mvp.md`](../../00-overview/scope-mvp.md) §2.3 — 화면 모델 SSOT
- [`../../30-llm/output-validation.md`](../../30-llm/output-validation.md) §6 — 파인만(에디터 도구) · 핵심 주제 게이트 규칙
- [이슈 #64](https://github.com/gosu1/piecepool/issues/64) — `Source.tags` 신규 필드 제안 (resource 매핑, `contracts-change` 머지 대기)
- `../ocr-client.md` — 이미지 첨부 파이프라인 (PR #55, 병합 대기 — 머지 후 링크로 교체)
- `markdown-editor.md` ([#21](https://github.com/gosu1/piecepool/issues/21)) — 본문 편집 컴포넌트 재사용
- [`../../20-backend/ipc-api.md`](../../20-backend/ipc-api.md) §4 — `save_source`
- [`../architecture.md`](../architecture.md) §2~§3 — 라우팅 `/inbox`, `useWorkspaceStore`/`useImportStore`
- [`../README.md`](../README.md) — 40-frontend 영역 개요
