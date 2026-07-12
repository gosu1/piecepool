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

`scope-mvp.md` §2.3: "제목, resource, project, 고정하기, 연결된 node들이 화면에 표시된다" (첨부된 예시 화면은 타사 앱 캡처이며 PiecePool 자체 목업이 아니다). 각 속성을 현재 SSOT(`entities.md`)와 대조한 결과:

| 속성 | 매핑 | 근거 |
|---|---|---|
| 제목 | `Source.title` / `ArchiveNote.title` | 1:1 대응, 추가 결정 불필요 |
| project | `KnowledgeSpace` 선택 | "project에 넣는 화면을 고른다"(§2.3 원문)가 곧 어느 `<space>/`에 저장할지 고르는 동작과 동일. `useWorkspaceStore`의 현재 선택값을 기본값으로 노출, Inbox 화면에서 즉시 변경 가능 |
| resource(자원) | **신규 `Source.tags` 필드** (project 경계와 무관한 자유 해시태그) | @gosu1 확인(2026-06-24, Slack): `#주식`, `#딥러닝`처럼 어느 project에 있든 자유롭게 붙이는 태그 기능. `Subject`는 `spaceId`로 project(KnowledgeSpace) 1개에 종속되므로 요구사항 충족 불가 → 신규 필드 필요. [이슈 #64](https://github.com/gosu1/piecepool/issues/64)로 `contracts-change` 제안, 머지 대기 |
| 고정하기 | **MVP 제외** | `Source`/`ArchiveNote`에 대응 필드 없음(`pinned: boolean` 미정의). 추가하려면 `entities.md` 변경 → `contracts-change` 라벨 + 4역할 review 필요. 별도 결정 없이는 post-MVP로 보류 |
| 연결된 node | **Inbox 단계에서 표시 안 함** | Inbox 시점엔 `Source`만 존재 — `Concept`/`Relation`은 LLM 처리(§4 `llm_processing`) 이후에야 생성된다. 근거 데이터가 없는 시점에 표시할 수 없음. 처리 완료 후엔 `wiki-view.md`/`graph-view.md`에서 의미를 가짐 |

---

## 3. 화면 구성

페이지 모델([`../../00-overview/scope-mvp.md`](../../00-overview/scope-mvp.md) §2.3 예시 화면 그대로): 상단 제목 입력 + 속성 패널(project 선택 dropdown, 자유 해시태그 입력) + 하단 Markdown 본문 편집 영역.

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
        status: llm_processing — Concept/WikiPage/Relation 추출 (2차 LLM 호출)
            │
      (파인만 on) status: clarify_pending — 사용자 응답 대기
            │
        status: writing — wiki/*.md + relations.json 저장
            ↓
        status: completed
```

`ImportJobStatus` 전이는 [`entities.md#importjob`](../../10-contracts/entities.md#importjob)을 그대로 따른다 — 본 문서에서 재정의하지 않는다.

---

## 6. 파인만 토글 차이

- 파인만 off: `clarify_pending` 발생 안 함, `parsing`→`archiving`→`llm_processing`→`writing`→`completed`로 직행
- 파인만 on(기본): 저신뢰·모호 판정 시 `clarify_pending` 경유 가능

파인만을 Inbox 화면 안에서 모달로 보여줄지, 별도 알림으로 보여줄지는 아직 미결 — [`open-questions.md`](../../00-overview/open-questions.md) §3 "파인만 UI 모달 vs 인라인" (Design #4 + Frontend #2, 결정 기한: `component-states.md` 작성 시). 본 문서는 저장 직후 화면 전환만 다루고, 파인만 UI 자체는 범위에서 제외한다.

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
| 파인만 UI 표시 방식 | ⏸ Open Question | [`open-questions.md`](../../00-overview/open-questions.md) §3 결정 후 |

---

## 8. 의존 문서

- [`../../10-contracts/entities.md`](../../10-contracts/entities.md) — `Source`, `KnowledgeSpace`, `Subject`, `ArchiveNote`, `ImportJob`
- [`../../10-contracts/workspace-layout.md`](../../10-contracts/workspace-layout.md) — `<space>/inbox/`, `<space>/archive/`
- [`../../10-contracts/markdown-frontmatter.md`](../../10-contracts/markdown-frontmatter.md) — ArchiveNote frontmatter 검증
- [`../../00-overview/scope-mvp.md`](../../00-overview/scope-mvp.md) §2.3 — 화면 모델 SSOT
- [`../../00-overview/open-questions.md`](../../00-overview/open-questions.md) §3 — 파인만 UI 미결 항목
- [이슈 #64](https://github.com/gosu1/piecepool/issues/64) — `Source.tags` 신규 필드 제안 (resource 매핑, `contracts-change` 머지 대기)
- `../ocr-client.md` — 이미지 첨부 파이프라인 (PR #55, 병합 대기 — 머지 후 링크로 교체)
- `markdown-editor.md` ([#21](https://github.com/gosu1/piecepool/issues/21)) — 본문 편집 컴포넌트 재사용
- [`../../20-backend/ipc-api.md`](../../20-backend/ipc-api.md) §4 — `save_source`
- [`../architecture.md`](../architecture.md) §2~§3 — 라우팅 `/inbox`, `useWorkspaceStore`/`useImportStore`
- [`../README.md`](../README.md) — 40-frontend 영역 개요
