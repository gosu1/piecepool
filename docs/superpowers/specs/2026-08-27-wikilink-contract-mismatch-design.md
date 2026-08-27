# 위키링크 계약과 코드의 불일치 3건 — 설계

- 날짜: 2026-08-27
- 상태: 설계 승인됨 (구현 대기)
- 작업 카드: [PIE-66](https://linear.app/piecepool/issue/PIE-66/)
- 관련 SSOT: [`docs/10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md)

## 1. 배경

계약(`wikilink-embed.md`)은 노트 본문의 `[[파일명]]`을 "원본 파일 링크", `![[파일명]]`을 "그 자리에 embed"로 정의한다. 탐색 root 는 `<space>/sources/original-files/` 다. 카드가 지적한 세 지점을 코드와 대조한 결과는 다음과 같다.

| # | 계약 조항 | 현재 코드 | 판정 |
|---|---|---|---|
| 1 | §1 `[[파일명]]` = 원본 파일 링크 | `markdown.tsx:88` 이 `wiki:` 스킴으로 보내 동명 위키를 찾는다. 없으면 "연결된 위키가 아직 없어요" | 불일치 확인 |
| 2 | §4 지원 포맷 PNG·JPG·JPEG·WebP·SVG | 확장자 목록이 세 파일에 복사돼 서로 다르다 | 불일치 확인 |
| 3 | §3.2 범위 초과 시 첫 page + 오류 메시지 | embed 경로(`FilePreview.tsx:96`)는 이미 준수. link 경로는 1번 때문에 존재하지 않음 | 부분 불일치 |

### 1.1 3번의 실제 상태

카드가 쓴 재현(`![[강의자료.pdf#page=200]]`)은 `FilePreview.tsx:96-109` 가 이미 계약대로 처리한다. `over` 를 계산해 1 page 를 그리고 "요청한 N쪽이 범위를 벗어남(총 M쪽)" 을 띄운다. `32715ae`(2026-07-01)부터 있었고 카드 작성일(2026-08-10)보다 앞선다.

카드가 지목한 `pdfView.ts:11` 의 `clampPage` 가 실제로 조용히 클램프하는 곳은 `PdfViewer` 툴바의 page 입력창(`PdfViewer.tsx:226,234`)이다. 사용자가 직접 숫자를 친 상황은 계약 §3.2 가 규율하는 본문 `#page=N` 문법이 아니므로 이번 범위에서 제외한다.

남는 구멍은 느낌표 없는 `[[강의자료.pdf#page=200]]` 이고, 이는 1번과 같은 원인이다. 원본을 여는 경로 자체가 없어 page 지정도 범위 초과 안내도 붙을 자리가 없다.

### 1.2 2번의 실제 상태

| 위치 | png/jpg/jpeg/webp | svg | gif |
|---|---|---|---|
| 계약 §4 | 지원 | 지원 | 없음 |
| `wikilink.ts:80` `IMAGE_EXTS` | 지원 | 없음 | 지원 |
| `markdown.tsx:31` isImage 정규식 | 지원 | 지원 | 없음 |
| `FilePreview.tsx:19` `MIME` | 지원 | 지원 | 지원 |

같은 목록을 세 번 적은 결과다. 한 곳을 고쳐도 나머지가 남는다.

## 2. 이번 범위

- `[[파일명]]` / `[[파일명#page=N]]` 클릭 시 원본을 앱 안 새 탭에서 연다
- link 경로의 page 범위 초과 시 첫 page + 안내
- 확장자 목록을 한 곳으로 모으고 계약 §4 에 GIF 를 추가한다

범위 밖: `PdfViewer` 툴바 page 입력창의 클램프 동작, 계약 §7.3(끊어진 링크 시각화)의 link 경로 확장, cross-space 참조.

## 3. 설계

### 3.1 확장자 목록의 단일 출처

`wikilink.ts` 가 계약 §4 의 유일한 코드 표현을 갖는다.

```ts
export const IMAGE_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", svg: "image/svg+xml", gif: "image/gif",
};
export const IMAGE_EXTS = new Set(Object.keys(IMAGE_MIME));
```

`markdown.tsx:31` 의 정규식과 `FilePreview.tsx:19` 의 `MIME` 은 삭제하고 이것을 import 한다. 의존 방향이 `markdown.tsx`·`FilePreview.tsx` → `wikilink.ts` 한쪽뿐이라 순환이 생기지 않는다(두 파일 모두 이미 `wikilink.ts` 를 import 중).

GIF 는 코드 두 곳에 이미 들어와 있고 브라우저가 기본 지원한다. 계약에서 빼는 대신 계약 §4 목록에 GIF 를 추가한다. PR 에 `contracts-change` 라벨을 달고 계약 담당(@ChangSik88) 승인을 받는다.

### 3.2 스킴 분기를 파싱 계층으로

`wikilink.ts` 의 `expand()` 가 대상의 확장자를 보고 스킴을 나눈다. 판정은 이미 있는 `isOriginalFile()` 을 그대로 쓴다(같은 파일 안이라 export 는 필요 없다).

- 원본 파일(pdf + `IMAGE_EXTS`) → `orig:` + target
- 그 외 → `wiki:` + target (기존 그대로)
- embed(`![[..]]`) → `embed:` + target (기존 그대로)

`file:` 이 아니라 `orig:` 를 쓰는 이유: `file:` 은 실제 URL 스킴이라 react-markdown 기본 sanitizer 와 얽힌다. 기존 커스텀 스킴(`wiki:`·`embed:`·`term:`)과 같은 결로 간다.

`markdown.tsx` 는 `orig:` 분기 하나를 더해 새 prop `onOpenFile?.(target)` 을 부른다. target 은 `파일명#page=N` 원문 그대로 넘긴다 — 쪼개는 책임은 호출자에 둔다. `urlTransform` 의 보존 목록에도 `orig:` 를 넣는다(빠뜨리면 기본 sanitizer 가 링크를 제거한다).

`linkExists` 는 위키 존재 여부만 판정하므로 `orig:` 링크에는 적용하지 않는다. 파일이 없는 경우는 탭을 연 뒤 `PdfViewer` 가 이미 "원본을 불러오지 못했습니다" 를 표시한다.

### 3.3 원본 파일 탭

`TabKind` 에 `"original"` 을 추가한다. 탭 id 는 `original:<space>:<file>` — 파일 하나가 탭 하나다.

`"source"` 가 아닌 이유: `archive` 탭의 `KIND_LABEL` 이 이미 "Source" 이고, 계약과 코드가 원본 파일을 `sources/original-files/`·`isOriginalFile`·`noteOriginalFiles` 로 부른다. `KIND_LABEL` 은 `Record<TabKind, string>` 이라 항목을 빠뜨리면 tsc 가 잡는다.

page 번호는 탭 id 에 넣지 않는다. 넣으면 같은 PDF 의 12 page 링크와 30 page 링크가 탭 두 개가 되어, 위키·아카이브 탭이 지키는 "파일 하나 = 탭 하나" 모델과 어긋난다. 대신 `graphViews[tabId]` 가 이미 쓰는 방식대로 `PiecePoolApp` 이 `originalPages: Record<string, number>` 를 소유하고 `PdfViewer` 에 `initialPage` 로 내려보낸다. 이미 열린 탭을 다시 클릭하면 그 값만 갱신되므로 같은 탭이 해당 page 로 이동한다.

`renderActiveTab` 의 `case "original"`:

- 확장자 `pdf` → `<PdfViewer space file initialPage>` (인박스에서 쓰던 뷰어 재사용)
- 확장자가 `IMAGE_EXTS` 에 있음 → `<FilePreview space target={file} />` (이미지 렌더를 이미 갖고 있다)

### 3.4 link 경로의 범위 초과 안내

판정을 `PdfViewer` 안에 묻지 않고 `pdfView.ts` 에 순수 함수로 둔다. 카드가 지목한 파일이고 vitest 로 바로 잴 수 있다.

```ts
/** 링크가 지정한 page 를 실제 표시할 page 로. 총 page 수 초과면 첫 page + over 표식(계약 §3.2). */
export function resolveInitialPage(want: number, total: number): { page: number; over: boolean };
```

`PdfViewer` 는 `onLoadSuccess` 로 `numPages` 가 확정된 뒤 이 함수를 부른다. 범위 안이면 해당 page 로 이동하고, 초과면 첫 page 에 머물며 배너를 띄운다. 문구는 `FilePreview.tsx:109` 와 동일하게 맞춘다 — 같은 상황에서 두 경로가 다른 말을 하면 안 된다.

## 4. 검증 기준

### 4.1 단위 테스트

- `wikilink.test.ts` — `remarkWikilink` 가 만든 mdast 에서 `[[개념]]` 은 `wiki:`, `[[a.pdf]]`·`[[b.svg]]` 는 `orig:` 로 갈린다. `![[..]]` 는 그대로 `embed:`. svg·gif 가 `firstEmbedFile`·`noteOriginalFiles` 에 잡힌다
- `pdfView.test.ts` — `resolveInitialPage(200, 10)` → `{ page: 1, over: true }`, `resolveInitialPage(12, 30)` → `{ page: 12, over: false }`, `total` 이 0(미로드)일 때의 동작

저장소에 jsdom·testing-library 가 없어 React 컴포넌트를 마운트하는 테스트는 쓰지 않는다. `markdownRender.test.ts` 가 이미 하듯 remark 체인을 문자열→트리로 돌려 검증하고, `markdown.tsx` 의 `orig:` 분기 자체는 실기 확인(§4.2)으로 덮는다.

### 4.2 실기 확인

노트 하나에 세 줄을 넣고 각각 확인한다.

```md
[[강의자료.pdf]]
[[강의자료.pdf#page=200]]
![[그림.svg]]
```

- 첫 줄 클릭 → 원본 탭이 열리고 1 page 표시
- 둘째 줄 클릭 → 같은 탭, 1 page + "요청한 200쪽이 범위를 벗어남(총 N쪽)" 배너
- 셋째 줄 → svg 가 본문에 그림으로 보인다

UI 변경이므로 PR 본문에 비포·애프터 스크린샷을 첨부한다.

### 4.3 회귀

- `npm run test` 전체 통과
- `node scripts/ssot-check.mjs` — 계약 내용을 코드로 복사하지 않았는지(§3.1 의 `IMAGE_MIME` 은 계약 표의 복사가 아니라 코드 표현이므로 걸리면 주석 링크로 대응)

## 5. 건드리는 파일

| 파일 | 변경 |
|---|---|
| `docs/10-contracts/wikilink-embed.md` | §4 지원 포맷에 GIF 추가 |
| `src/lib/wikilink.ts` | `IMAGE_MIME`·`IMAGE_EXTS`·`extOf` export, `expand()` 스킴 분기 |
| `src/lib/markdown.tsx` | `onOpenFile` prop, `orig:` 분기, `urlTransform` 보존 목록, 정규식 제거 |
| `src/lib/FilePreview.tsx` | 지역 `MIME` 제거하고 `IMAGE_MIME` 사용 |
| `src/lib/pdfView.ts` | `resolveInitialPage` 추가 |
| `src/lib/PdfViewer.tsx` | `initialPage` prop, 범위 초과 배너 |
| `src/store/workspaceStore.ts` | `TabKind` 에 `"original"` |
| `src/app/PiecePoolApp.tsx` | `openOriginal`, `originalPages`, `KIND_LABEL`, `renderActiveTab` 의 `case "original"`, `onOpenFile` 연결 |
| `src/app/panes/DocView.tsx` | `onOpenFile` 통과 |
| `src/app/panes/InboxSection.tsx` | 위키 패널의 `<Markdown>`(879줄)에 `onOpenFile` 연결 — 카드가 재현한 인박스 화면 |
