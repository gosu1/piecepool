# 위키링크 계약-코드 불일치 3건 (PIE-66) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 본문의 `[[파일명]]` 링크가 원본 파일을 앱 안에서 열게 하고, 그림 확장자 목록을 한 곳으로 모아 계약과 일치시킨다.

**Architecture:** `wikilink.ts` 가 계약 §1·§4 의 유일한 코드 표현이 된다. 링크 대상이 원본 파일인지 판정해 `orig:` / `wiki:` 스킴으로 가르고, `markdown.tsx` 는 스킴만 보고 분기한다. 원본은 `TabKind` 에 새로 추가하는 `"original"` 탭이 기존 `PdfViewer` · `FilePreview` 를 재사용해 그린다. `#page=N` 범위 초과 판정은 `pdfView.ts` 의 순수 함수로 뽑아 vitest 로 잰다.

**Tech Stack:** TypeScript, React 19, react-markdown + remark, react-pdf, zustand, vitest

**설계 문서:** [`docs/superpowers/specs/2026-08-27-wikilink-contract-mismatch-design.md`](../specs/2026-08-27-wikilink-contract-mismatch-design.md)

## Global Constraints

- 브랜치는 `fix/pie-66-wikilink-contract` (이미 `main` 에서 분기해 설계 문서 커밋까지 완료)
- 계약 SSOT 는 `docs/10-contracts/wikilink-embed.md`. 계약 파일을 건드리는 PR 은 `contracts-change` 라벨 + 계약 담당(@ChangSik88) 승인이 필요하다
- 저장소에 jsdom·testing-library 가 없다. **React 컴포넌트를 마운트하는 테스트를 쓰지 말 것.** 순수 함수와 remark 트리 수준에서만 검증한다
- 테스트: `npm run test` (= `vitest run`). 타입: `npm run check` (= `tsc --noEmit` + scripts tsconfig)
- 주석은 한국어 본문 / 영어 식별자 — 저장소 관례
- 확장자 목록은 `src/lib/wikilink.ts` 한 곳에만 적는다. 다른 파일에 다시 적으면 이번 작업이 고치는 바로 그 버그를 되살리는 것이다
- 이번 작업은 프론트엔드만 건드린다. `src-tauri/` 는 손대지 않는다

---

### Task 1: 확장자 목록을 한 곳으로 + 계약 §4 에 GIF

**Files:**
- Modify: `src/lib/wikilink.ts:80` (`IMAGE_EXTS` 선언), `:88`, `:96-99`
- Modify: `src/lib/markdown.tsx:7` (import), `:31` (isImage 정규식)
- Modify: `src/lib/FilePreview.tsx:5` (import), `:19` (MIME), `:23-24`, `:92`
- Modify: `docs/10-contracts/wikilink-embed.md:65`
- Test: `src/lib/wikilink.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces:
  - `export const IMAGE_MIME: Record<string, string>` — 확장자(소문자) → MIME 문자열
  - `export const IMAGE_EXTS: Set<string>` — `Object.keys(IMAGE_MIME)` 로 만든 집합
  - `export function extOf(file: string): string` — 파일명의 소문자 확장자, 없으면 `""`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/wikilink.test.ts` 의 import 줄(2번째 줄)을 다음으로 바꾼다.

```ts
import { parseWikilinks, parseEmbedTarget, firstEmbedFile, noteOriginalFiles, renameRefs, IMAGE_EXTS } from "./wikilink";
```

파일 맨 끝에 다음 블록을 덧붙인다.

```ts
describe("IMAGE_EXTS — 계약 §4 지원 포맷의 단일 출처", () => {
  it("계약이 정한 여섯 포맷", () => {
    expect([...IMAGE_EXTS].sort()).toEqual(["gif", "jpeg", "jpg", "png", "svg", "webp"]);
  });

  it("svg 도 그림으로 본다(종전 누락)", () => {
    expect(firstEmbedFile("![[diagram.svg]]")).toEqual({ file: "diagram.svg", type: "image" });
    expect(noteOriginalFiles("![[diagram.svg]]")).toEqual(["diagram.svg"]);
  });

  it("gif 도 그대로 그림이다", () => {
    expect(firstEmbedFile("![[loop.gif]]")).toEqual({ file: "loop.gif", type: "image" });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/lib/wikilink.test.ts`
Expected: FAIL. `IMAGE_EXTS` 가 export 되지 않아 import 단계에서 터진다 (`No matching export in "src/lib/wikilink.ts" for import "IMAGE_EXTS"`).

- [ ] **Step 3: `wikilink.ts` 에 단일 출처를 만든다**

`src/lib/wikilink.ts:80` 의 이 줄을

```ts
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
```

다음으로 교체한다.

```ts
/** 계약 §4 지원 포맷의 유일한 코드 표현 — docs/10-contracts/wikilink-embed.md.
 *  확장자 목록을 다른 파일에 다시 적지 말 것. markdown.tsx · FilePreview.tsx 가 여기서 가져다 쓴다. */
export const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
};
export const IMAGE_EXTS = new Set(Object.keys(IMAGE_MIME));

/** 파일명의 소문자 확장자. 없으면 "". */
export function extOf(file: string): string {
  return file.split(".").pop()?.toLowerCase() ?? "";
}
```

- [ ] **Step 4: `wikilink.ts` 안의 확장자 추출을 `extOf` 로 바꾼다**

`firstEmbedFile` 안(교체 전 88번째 줄)의

```ts
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
```

를 다음으로 바꾼다.

```ts
    const ext = extOf(file);
```

`isOriginalFile` 안(교체 전 97번째 줄)의

```ts
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
```

도 다음으로 바꾼다.

```ts
  const ext = extOf(file);
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/lib/wikilink.test.ts`
Expected: PASS. 기존 테스트 전부 + 새 3건 통과.

- [ ] **Step 6: `markdown.tsx` 의 복사본을 제거한다**

`src/lib/markdown.tsx:7` 의 import 를

```ts
import { remarkWikilink, parseEmbedTarget } from "./wikilink";
```

에서 다음으로 바꾼다.

```ts
import { remarkWikilink, parseEmbedTarget, IMAGE_EXTS, extOf } from "./wikilink";
```

`src/lib/markdown.tsx:31` 의

```tsx
  const isImage = /\.(png|jpe?g|webp|svg)$/i.test(file);
```

을 다음으로 바꾼다.

```tsx
  const isImage = IMAGE_EXTS.has(extOf(file));
```

- [ ] **Step 7: `FilePreview.tsx` 의 복사본을 제거한다**

`src/lib/FilePreview.tsx:5` 의 import 를

```ts
import { parseEmbedTarget } from "./wikilink";
```

에서 다음으로 바꾼다.

```ts
import { parseEmbedTarget, IMAGE_MIME, extOf } from "./wikilink";
```

`src/lib/FilePreview.tsx:19` 의 이 줄을 **통째로 삭제한다.**

```ts
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
```

`FilePreview` 함수 안(삭제 전 23-24번째 줄)의

```ts
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ext in MIME;
```

를 다음으로 바꾼다.

```ts
  const ext = extOf(file);
  const isImage = ext in IMAGE_MIME;
```

이미지 렌더 줄(삭제 전 92번째 줄)의

```tsx
    return <img src={`data:${MIME[ext]};base64,${b64}`} alt={file} className="max-w-full rounded-md border border-hairline" />;
```

를 다음으로 바꾼다.

```tsx
    return <img src={`data:${IMAGE_MIME[ext]};base64,${b64}`} alt={file} className="max-w-full rounded-md border border-hairline" />;
```

- [ ] **Step 8: 계약 §4 에 GIF 를 추가한다**

`docs/10-contracts/wikilink-embed.md:65` 의

```md
- 지원 포맷: PNG, JPG, JPEG, WebP, SVG (MVP)
```

를 다음으로 바꾼다.

```md
- 지원 포맷: PNG, JPG, JPEG, WebP, SVG, GIF (MVP)
```

- [ ] **Step 9: 전체 테스트와 타입 검사**

Run: `npm run test`
Expected: 전부 PASS

Run: `npm run check`
Expected: 오류 없이 종료(출력 없음)

- [ ] **Step 10: 커밋**

```bash
git add src/lib/wikilink.ts src/lib/wikilink.test.ts src/lib/markdown.tsx src/lib/FilePreview.tsx docs/10-contracts/wikilink-embed.md
git commit -m "fix(wikilink): 그림 확장자 목록을 한 곳으로 모으고 svg 를 살린다 (PIE-66)

세 파일이 각자 적어둔 목록이 갈라져 svg 가 어떤 경로에서는 그림으로
안 보였다. wikilink.ts 가 계약 §4 의 유일한 코드 표현이 되고 나머지가
가져다 쓴다. 코드에 이미 들어와 있던 gif 는 계약 쪽에 추가했다."
```

---

### Task 2: `[[파일]]` 을 `orig:` 스킴으로 가른다

**Files:**
- Modify: `src/lib/wikilink.ts:49-60` (`expand`)
- Test: `src/lib/wikilink.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `extOf`, `IMAGE_EXTS`
- Produces: `remarkWikilink()` 가 만드는 link 노드의 `url` 스킴 — 원본 파일 링크는 `orig:`, 그 외 링크는 `wiki:`, 임베드는 `embed:` (모두 뒤에 target 원문이 그대로 붙는다)

판정에 쓰는 `isOriginalFile` 은 `wikilink.ts` 안에서만 불리므로 export 하지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/wikilink.test.ts` 의 import 줄에 `remarkWikilink` 를 더한다.

```ts
import { parseWikilinks, parseEmbedTarget, firstEmbedFile, noteOriginalFiles, renameRefs, IMAGE_EXTS, remarkWikilink } from "./wikilink";
```

파일 맨 끝에 다음 블록을 덧붙인다.

```ts
// remark 플러그인이 만든 mdast 에서 link url(=스킴 + 대상)만 뽑는다.
// jsdom 이 없으므로 컴포넌트를 마운트하지 않고 트리 수준에서 검증한다.
interface TreeNode {
  type: string;
  url?: string;
  value?: string;
  children?: TreeNode[];
}

function linkUrls(md: string): string[] {
  const tree: TreeNode = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: md }] }] };
  (remarkWikilink() as (t: TreeNode) => void)(tree);
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    if (n.type === "link" && n.url) out.push(n.url);
    n.children?.forEach(walk);
  };
  walk(tree);
  return out;
}

describe("remarkWikilink — 링크 스킴 분기(계약 §1)", () => {
  it("개념 링크는 wiki:", () => {
    expect(linkUrls("[[프로세스]]")).toEqual(["wiki:프로세스"]);
  });

  it("원본 PDF 링크는 orig:", () => {
    expect(linkUrls("[[강의자료.pdf]]")).toEqual(["orig:강의자료.pdf"]);
  });

  it("#page=N 이 붙어도 orig: 이고 조각은 그대로 남는다", () => {
    expect(linkUrls("[[강의자료.pdf#page=12]]")).toEqual(["orig:강의자료.pdf#page=12"]);
  });

  it("이미지 링크도 orig:", () => {
    expect(linkUrls("[[그림.svg]]")).toEqual(["orig:그림.svg"]);
  });

  it("임베드는 원본이든 아니든 embed: 그대로", () => {
    expect(linkUrls("![[강의자료.pdf]]")).toEqual(["embed:강의자료.pdf"]);
    expect(linkUrls("![[프로세스]]")).toEqual(["embed:프로세스"]);
  });

  it("별칭이 있어도 스킴은 대상 기준", () => {
    expect(linkUrls("[[강의자료.pdf|강의록]]")).toEqual(["orig:강의자료.pdf"]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/lib/wikilink.test.ts`
Expected: FAIL. "원본 PDF 링크는 orig:" 가 `["wiki:강의자료.pdf"]` 를 받아 `["orig:강의자료.pdf"]` 와 어긋난다.

- [ ] **Step 3: `expand()` 에서 스킴을 가른다**

`src/lib/wikilink.ts:49-60` 의 `expand` 전체를 다음으로 교체한다.

```ts
function expand(value: string): MdNode[] {
  return parseWikilinks(value).map((t) => {
    if (t.kind === "text") return { type: "text", value: t.value };
    // [[파일]] 은 동명 위키가 아니라 원본 파일로 가는 링크다(계약 §1) — 스킴을 여기서 가른다.
    // #page=N 조각을 떼고 판정한다. 안 떼면 확장자가 "pdf#page=12" 가 되어 원본으로 안 잡힌다.
    const scheme =
      t.kind === "embed" ? "embed:" : isOriginalFile(parseEmbedTarget(t.value).file) ? "orig:" : "wiki:";
    return {
      type: "link",
      url: scheme + t.value,
      title: null,
      children: [{ type: "text", value: t.alias ?? t.value }],
    };
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/lib/wikilink.test.ts`
Expected: PASS. 새 6건과 기존 테스트 전부 통과.

- [ ] **Step 5: 전체 테스트**

Run: `npm run test`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/wikilink.ts src/lib/wikilink.test.ts
git commit -m "fix(wikilink): [[파일.pdf]] 를 위키가 아닌 원본 링크로 가른다 (PIE-66)

계약 §1 은 [[파일명]] 을 원본 파일 링크로 정하는데 파싱 계층이
전부 wiki: 로 보내 동명 위키를 찾게 만들었다. 확장자로 판정해
orig: 스킴을 붙인다. 렌더러는 스킴만 보면 된다."
```

---

### Task 3: `resolveInitialPage` — 범위 초과 판정을 순수 함수로

**Files:**
- Modify: `src/lib/pdfView.ts` (파일 끝에 함수 추가)
- Test: `src/lib/pdfView.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `export function resolveInitialPage(want: number, total: number): { page: number; over: boolean }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/pdfView.test.ts` 의 import 줄을 다음으로 바꾼다.

```ts
import { clampZoom, clampPage, resolveInitialPage } from "./pdfView";
```

파일 맨 끝에 다음 블록을 덧붙인다.

```ts
describe("resolveInitialPage — 링크가 지정한 page (계약 §3.2)", () => {
  it("범위 안이면 그 page 그대로", () => {
    expect(resolveInitialPage(12, 30)).toEqual({ page: 12, over: false });
  });
  it("마지막 page 는 초과가 아니다", () => {
    expect(resolveInitialPage(10, 10)).toEqual({ page: 10, over: false });
  });
  it("범위 초과면 첫 page + over", () => {
    expect(resolveInitialPage(200, 10)).toEqual({ page: 1, over: true });
  });
  it("total 0(아직 문서 미로드)이면 판정을 미룬다", () => {
    expect(resolveInitialPage(200, 0)).toEqual({ page: 200, over: false });
  });
  it("1 미만은 첫 page (over 아님)", () => {
    expect(resolveInitialPage(0, 10)).toEqual({ page: 1, over: false });
    expect(resolveInitialPage(-3, 10)).toEqual({ page: 1, over: false });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/lib/pdfView.test.ts`
Expected: FAIL. `resolveInitialPage` 가 export 되지 않아 import 단계에서 터진다.

- [ ] **Step 3: 함수를 구현한다**

`src/lib/pdfView.ts` 파일 끝에 다음을 덧붙인다.

```ts
/** 링크(`[[a.pdf#page=N]]`)가 지정한 page 를 실제 표시할 page 로 옮긴다.
 *  총 page 수를 넘으면 첫 page 를 보여주고 over 를 세운다 — 계약 §3.2 는 조용한 클램프를 금지한다.
 *  total 이 0 이면 아직 문서를 안 읽은 상태다. 여기서 판정하면 모든 링크가 1쪽으로 무너지므로 미룬다. */
export function resolveInitialPage(want: number, total: number): { page: number; over: boolean } {
  if (total < 1) return { page: Math.max(1, want), over: false };
  if (want > total) return { page: 1, over: true };
  return { page: Math.max(1, want), over: false };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/lib/pdfView.test.ts`
Expected: PASS. 새 5건 + 기존 `clampZoom`·`clampPage` 테스트 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/pdfView.ts src/lib/pdfView.test.ts
git commit -m "feat(pdf): 링크가 지정한 page 의 범위 초과 판정을 순수 함수로 (PIE-66)

계약 §3.2 의 첫 page + 안내 규칙. 뷰어 컴포넌트에 묻지 않고
pdfView.ts 에 두어 vitest 로 잰다."
```

---

### Task 4: `PdfViewer` 가 `initialPage` 를 받고 범위 초과를 알린다

**Files:**
- Modify: `src/lib/PdfViewer.tsx:5` (import), `:41-47` (props), `:51-53` (state), `:76-93` (리셋 effect), `:216-223` 근처 (page 이동 effect 추가), `:330-368` (배너)

**Interfaces:**
- Consumes: Task 3 의 `resolveInitialPage`
- Produces: `PdfViewer` 가 `{ space: string; file: string; initialPage?: number }` 를 받는다. `initialPage` 는 1-indexed. 생략하면 종전과 완전히 같게 동작한다

- [ ] **Step 1: import 에 `resolveInitialPage` 를 더한다**

`src/lib/PdfViewer.tsx:5` 를

```ts
import { clampPage, clampZoom } from "./pdfView";
```

에서 다음으로 바꾼다.

```ts
import { clampPage, clampZoom, resolveInitialPage } from "./pdfView";
```

- [ ] **Step 2: prop 을 추가한다**

`src/lib/PdfViewer.tsx:41-47` 의

```tsx
export function PdfViewer({
  space,
  file,
}: {
  space: string;
  file: string;
}) {
```

를 다음으로 바꾼다.

```tsx
export function PdfViewer({
  space,
  file,
  initialPage,
}: {
  space: string;
  file: string;
  /** 링크(`[[a.pdf#page=N]]`)가 지정한 1-indexed page. 총 page 수를 넘으면 첫 page + 안내(계약 §3.2). */
  initialPage?: number;
}) {
```

- [ ] **Step 3: 범위 초과 상태를 추가한다**

`src/lib/PdfViewer.tsx` 의

```tsx
  const [parseErr, setParseErr] = useState<string | null>(null);
```

바로 아래에 다음 줄을 넣는다.

```tsx
  // 링크가 요청한 page 가 범위를 넘었을 때 그 숫자를 담는다(안내 문구에 쓴다). 정상이면 null.
  const [overPage, setOverPage] = useState<number | null>(null);
```

- [ ] **Step 4: 파일이 바뀌면 안내도 지운다**

`[space, file]` effect 안의

```tsx
    setLoadErr(null);
    setParseErr(null);
```

를 다음으로 바꾼다.

```tsx
    setLoadErr(null);
    setParseErr(null);
    setOverPage(null);
```

- [ ] **Step 5: 링크가 지정한 page 로 가는 effect 를 넣는다**

`src/lib/PdfViewer.tsx` 의 이 블록

```tsx
  useLayoutEffect(() => {
    const p = restorePageRef.current;
    if (mode !== "scroll" || p == null || p <= 1) return;
    pageEls.current[p - 1]?.scrollIntoView({ block: "start" });
  }, [mode, zoom, numPages]);
```

바로 **뒤에** 다음을 넣는다.

```tsx
  // 링크가 지정한 page 로 — 문서 로드로 numPages 가 확정된 뒤, 그리고 같은 탭에서 다른 page 링크를 눌렀을 때.
  // restorePageRef 를 함께 무장한다: 폭맞춤 줌이 안정될 때까지 페이지가 밀리므로 위 effect 가 이어서 재스냅한다.
  // mode 는 의도적으로 deps 에서 뺐다 — 모드 전환 시 위치 복원은 위 두 effect 의 몫이고,
  // 여기서 다시 잡으면 사용자가 옮겨둔 page 를 initialPage 로 되돌려버린다.
  useLayoutEffect(() => {
    if (!initialPage || numPages < 1) return;
    const { page, over } = resolveInitialPage(initialPage, numPages);
    setOverPage(over ? initialPage : null);
    setCur(page);
    restorePageRef.current = page;
    pageEls.current[page - 1]?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage, numPages]);
```

- [ ] **Step 6: 안내 배너를 툴바 아래에 넣는다**

`src/lib/PdfViewer.tsx` 의 툴바를 닫는 `</div>` 와 본문 주석 사이, 즉

```tsx
      </div>
      {/* 본문 — Ctrl+휠 줌 리스너가 붙는 컨테이너 */}
```

를 다음으로 바꾼다.

```tsx
      </div>
      {/* 범위 초과 안내 — 문구는 FilePreview 의 임베드 경로와 같게 맞춘다(같은 상황에 다른 말을 하지 않는다) */}
      {overPage !== null && (
        <p className="shrink-0 border-b border-hairline px-3 py-1.5 text-[12px] text-danger">
          요청한 {overPage}쪽이 범위를 벗어남(총 {numPages}쪽) — 1쪽을 표시합니다.
        </p>
      )}
      {/* 본문 — Ctrl+휠 줌 리스너가 붙는 컨테이너 */}
```

- [ ] **Step 7: 타입 검사와 전체 테스트**

Run: `npm run check`
Expected: 오류 없이 종료. `initialPage` 는 선택 prop 이라 기존 호출부(`InboxSection.tsx:813`)는 그대로 통과한다.

Run: `npm run test`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add src/lib/PdfViewer.tsx
git commit -m "feat(pdf): 뷰어가 링크의 initialPage 를 받고 범위 초과를 알린다 (PIE-66)

없는 쪽을 지정하면 첫 쪽을 펴고 총 쪽수를 알린다(계약 §3.2).
재스냅은 기존 restorePageRef 경로에 얹었다 — 폭맞춤 줌이 안정될
때까지 위치가 밀리는 문제를 이미 그쪽이 풀어놨다."
```

---

### Task 5: `markdown.tsx` 가 `orig:` 링크를 그린다

**Files:**
- Modify: `src/lib/markdown.tsx:16-25` (props), `:49-50` (urlTransform), `:54` (destructure), `:75-87` 뒤 (분기 추가), `:146` (deps)
- Modify: `src/app/panes/DocView.tsx:19-40` (destructure + 타입), `:88` (전달)

**Interfaces:**
- Consumes: Task 2 의 `orig:` 스킴
- Produces:
  - `MarkdownProps.onOpenFile?: (target: string) => void` — target 은 `파일명#page=N` 원문 그대로
  - `DocView` 도 같은 이름·같은 시그니처의 선택 prop 을 받아 그대로 넘긴다

이 작업이 끝나도 아직 아무 일도 일어나지 않는다(`onOpenFile` 을 넘기는 곳이 없다). 링크는 클릭 가능한 모양이 되고, 실제 동작은 Task 6 이 붙인다.

- [ ] **Step 1: `MarkdownProps` 에 prop 을 추가한다**

`src/lib/markdown.tsx` 의 `MarkdownProps` 안, `embedSpace` 줄 바로 아래에 다음을 넣는다.

```ts
  /** `[[강의자료.pdf]]` 처럼 원본 파일을 가리키는 링크 클릭(계약 §1).
   *  target 은 `파일명#page=N` 원문 그대로 — 쪼개는 책임은 호출자에 둔다. */
  onOpenFile?: (target: string) => void;
```

- [ ] **Step 2: `urlTransform` 에 `orig:` 를 더한다**

`src/lib/markdown.tsx:48-50` 의

```ts
// 커스텀 스킴(wiki:/embed:/term:) 은 기본 sanitizer 가 제거하므로 보존 — 나머지는 기본 정화.
const urlTransform = (url: string) =>
  url.startsWith("wiki:") || url.startsWith("embed:") || url.startsWith("term:") ? url : defaultUrlTransform(url);
```

를 다음으로 바꾼다.

```ts
// 커스텀 스킴(wiki:/embed:/term:/orig:) 은 기본 sanitizer 가 제거하므로 보존 — 나머지는 기본 정화.
// orig: 를 빠뜨리면 원본 링크가 통째로 사라진다(모양도 클릭도 없이).
const urlTransform = (url: string) =>
  url.startsWith("wiki:") || url.startsWith("embed:") || url.startsWith("term:") || url.startsWith("orig:")
    ? url
    : defaultUrlTransform(url);
```

- [ ] **Step 3: 컴포넌트 시그니처에 prop 을 넣는다**

`src/lib/markdown.tsx:54` 의

```tsx
export const Markdown = memo(function Markdown({ source, className, onLink, linkExists, embedSpace, terms }: MarkdownProps) {
```

를 다음으로 바꾼다.

```tsx
export const Markdown = memo(function Markdown({ source, className, onLink, onOpenFile, linkExists, embedSpace, terms }: MarkdownProps) {
```

- [ ] **Step 4: `orig:` 분기를 추가한다**

`src/lib/markdown.tsx` 의 `term:` 분기가 끝나는 지점, 즉

```tsx
            if (h.startsWith("wiki:")) {
```

바로 **앞에** 다음을 넣는다.

```tsx
            if (h.startsWith("orig:")) {
              const target = decode(h.slice(5));
              // linkExists 는 위키 존재 여부만 안다 — 원본 링크에는 쓰지 않는다.
              // 파일이 없는 경우는 탭을 연 뒤 뷰어가 "원본을 불러오지 못했습니다" 로 알린다.
              return (
                <button type="button" onClick={() => onOpenFile?.(target)} className="text-primary underline-offset-2 hover:underline">
                  {children}
                </button>
              );
            }
```

- [ ] **Step 5: `components` useMemo 의 deps 를 고친다**

`src/lib/markdown.tsx:146` 의

```tsx
    [onLink, linkExists, embedSpace],
```

를 다음으로 바꾼다.

```tsx
    [onLink, onOpenFile, linkExists, embedSpace],
```

- [ ] **Step 6: `DocView` 가 prop 을 통과시키게 한다**

`src/app/panes/DocView.tsx` 의 destructure 목록에서 `onLink,` 바로 아래에 다음 줄을 넣는다.

```tsx
  onOpenFile,
```

같은 파일의 타입 블록에서 `onLink: (target: string) => void;` 바로 아래에 다음을 넣는다.

```tsx
  /** 원본 파일 링크(`[[a.pdf]]`) 클릭 — target 은 `파일명#page=N` 원문 그대로 */
  onOpenFile?: (target: string) => void;
```

`src/app/panes/DocView.tsx:88` 의

```tsx
      <Markdown source={displayMd} onLink={onLink} linkExists={linkExists} embedSpace={embedSpace} terms={docTerms} />
```

를 다음으로 바꾼다.

```tsx
      <Markdown source={displayMd} onLink={onLink} onOpenFile={onOpenFile} linkExists={linkExists} embedSpace={embedSpace} terms={docTerms} />
```

- [ ] **Step 7: 타입 검사와 전체 테스트**

Run: `npm run check`
Expected: 오류 없이 종료

Run: `npm run test`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add src/lib/markdown.tsx src/app/panes/DocView.tsx
git commit -m "feat(markdown): orig: 링크를 원본 열기 버튼으로 그린다 (PIE-66)

렌더러는 스킴만 보고 분기한다. 어느 파일이 원본인지는 wikilink.ts 가 안다.
urlTransform 보존 목록에 orig: 를 넣지 않으면 링크가 통째로 사라진다."
```

---

### Task 6: 원본 파일 탭을 만들고 전부 연결한다

**Files:**
- Modify: `src/store/workspaceStore.ts:9` (`TabKind`), `:17` (주석)
- Modify: `src/app/PiecePoolApp.tsx:17-18` 근처 (import), `:36` (wikilink import), `:41` (`KIND_LABEL`), `:293` 근처 (`openOriginal`), `:1173`·`:1292` (DocView 연결), `renderActiveTab` 의 `switch`
- Modify: `src/app/panes/InboxSection.tsx:162`·`:187` (prop), `:879` (Markdown 연결)

**Interfaces:**
- Consumes: Task 4 의 `PdfViewer` `initialPage`, Task 5 의 `onOpenFile`, Task 1 의 `extOf`
- Produces:
  - `TabKind` 에 `"original"` 이 추가된다. 탭 id 형식은 `original:<space>:<file>`
  - `InboxSection` 이 `onOpenSource: (space: string, target: string) => void` 를 **필수** prop 으로 받는다 (형제인 `onOpenWiki` 와 같은 결)

- [ ] **Step 1: `TabKind` 에 `"original"` 을 추가한다**

`src/store/workspaceStore.ts:9` 의

```ts
export type TabKind = "home" | "wiki" | "archive" | "inbox" | "graph" | "empty";
```

를 다음으로 바꾼다.

```ts
export type TabKind = "home" | "wiki" | "archive" | "inbox" | "graph" | "original" | "empty";
```

같은 파일의

```ts
  file?: string; // wiki/archive 파일명
```

를 다음으로 바꾼다.

```ts
  file?: string; // wiki/archive 파일명. original 은 sources/original-files/ 의 원본 파일명
```

- [ ] **Step 2: 타입 검사로 빠뜨린 곳을 찾는다**

Run: `npm run check`
Expected: FAIL 1건. `src/app/PiecePoolApp.tsx:41` 의 `KIND_LABEL` 이 `Record<TabKind, string>` 이라 `original` 항목이 없다고 잡힌다. 이 실패가 Step 3 의 근거다.

- [ ] **Step 3: `KIND_LABEL` 에 항목을 넣는다**

`src/app/PiecePoolApp.tsx:41` 의

```tsx
const KIND_LABEL: Record<TabKind, string> = { wiki: "Wiki", archive: "Source", inbox: "Inbox", graph: "Graph", home: "Home", empty: "새 탭" };
```

를 다음으로 바꾼다. `archive` 가 이미 "Source" 를 쓰고 있으므로 원본 파일 탭은 "Original" 이다.

```tsx
const KIND_LABEL: Record<TabKind, string> = { wiki: "Wiki", archive: "Source", inbox: "Inbox", graph: "Graph", home: "Home", original: "Original", empty: "새 탭" };
```

- [ ] **Step 4: `PiecePoolApp` 의 import 를 보강한다**

`src/app/PiecePoolApp.tsx:36` 의

```ts
import { noteOriginalFiles } from "../lib/wikilink";
```

를 다음으로 바꾼다.

```ts
import { noteOriginalFiles, parseEmbedTarget, extOf } from "../lib/wikilink";
```

같은 파일의 `import { InboxSection, InboxPanelToggles } from "./panes/InboxSection";` 바로 아래에 다음 두 줄을 넣는다.

```ts
import { PdfViewer } from "../lib/PdfViewer";
import { FilePreview } from "../lib/FilePreview";
```

- [ ] **Step 5: `openOriginal` 을 만든다**

`src/app/PiecePoolApp.tsx` 의

```tsx
  const openGraph = (space: string) => openTab({ id: `graph:${space}`, kind: "graph", title: "Graph", space });
```

바로 **앞에** 다음을 넣는다.

```tsx
  // 원본 파일 탭 — 본문의 [[강의자료.pdf]] 링크가 여는 곳(계약 §1). 파일 하나 = 탭 하나다.
  // page 를 탭 id 에 넣지 않는다 — 같은 PDF 의 12쪽 링크와 30쪽 링크가 탭 둘로 갈라진다.
  // 대신 탭 id → page 를 셸이 들고 initialPage 로 내려보낸다(graphViews 와 같은 방식).
  const [originalPages, setOriginalPages] = useState<Record<string, number>>({});
  const openOriginal = (space: string, target: string) => {
    const { file, page } = parseEmbedTarget(target);
    const id = `original:${space}:${file}`;
    setOriginalPages((m) => ({ ...m, [id]: page ?? 1 }));
    openTab({ id, kind: "original", title: file, space, file });
  };
```

- [ ] **Step 6: `renderActiveTab` 에 분기를 넣는다**

`src/app/PiecePoolApp.tsx` 의 `switch (activeTab.kind) {` 안, `case "graph": {` 바로 **앞에** 다음을 넣는다.

```tsx
      case "original": {
        const file = activeTab.file ?? "";
        // PDF 는 인박스에서 쓰던 뷰어를 그대로 재사용하고, 이미지는 FilePreview 가 이미 그린다.
        return extOf(file) === "pdf" ? (
          <PdfViewer key={activeTab.id} space={sp} file={file} initialPage={originalPages[activeTab.id]} />
        ) : (
          <div className="h-full overflow-auto p-4">
            <FilePreview space={sp} target={file} />
          </div>
        );
      }
```

- [ ] **Step 7: 위키·아카이브 화면의 링크를 연결한다**

`src/app/PiecePoolApp.tsx` 에서 `onLink={(t) => resolveLink(space, t)}` 가 나오는 **두 곳 모두**, 그 줄 바로 아래에 다음을 넣는다.

```tsx
        onOpenFile={(t) => openOriginal(space, t)}
```

- [ ] **Step 8: 인박스 위키 패널을 연결한다**

`src/app/panes/InboxSection.tsx` 의 destructure 목록에서 `onOpenWiki,` 바로 아래에 다음 줄을 넣는다.

```tsx
  onOpenSource,
```

같은 파일의 타입 블록에서 `onOpenWiki: (space: string, file: string) => void;` 바로 아래에 다음을 넣는다.

```tsx
  /** 원본 파일 탭 열기 — 본문의 [[강의자료.pdf]] 링크(계약 §1). target 은 `파일명#page=N` 원문 그대로 */
  onOpenSource: (space: string, target: string) => void;
```

`src/app/panes/InboxSection.tsx:879` 의

```tsx
            <Markdown source={stripFeynmanSection(stripEvidenceSection(refWiki.markdown))} embedSpace={targetSpace} />
```

를 다음으로 바꾼다.

```tsx
            <Markdown
              source={stripFeynmanSection(stripEvidenceSection(refWiki.markdown))}
              embedSpace={targetSpace}
              onOpenFile={(t) => onOpenSource(targetSpace, t)}
            />
```

- [ ] **Step 9: `InboxSection` 호출부에 prop 을 넘긴다**

`src/app/PiecePoolApp.tsx` 의 `<InboxSection` 안, `onOpenWiki={openWiki}` 줄 바로 아래에 다음을 넣는다.

```tsx
            onOpenSource={openOriginal}
```

- [ ] **Step 10: 타입 검사와 전체 테스트**

Run: `npm run check`
Expected: 오류 없이 종료

Run: `npm run test`
Expected: 전부 PASS

Run: `node scripts/ssot-check.mjs`
Expected: 통과. 이 스크립트는 RelationType 값과 계약 엔티티 이름의 복사만 찾으므로 확장자 목록은 대상이 아니다

- [ ] **Step 11: 커밋**

```bash
git add src/store/workspaceStore.ts src/app/PiecePoolApp.tsx src/app/panes/InboxSection.tsx
git commit -m "feat(ui): 원본 파일 탭 — [[강의자료.pdf]] 가 원본을 연다 (PIE-66)

TabKind 에 original 을 더하고 PdfViewer·FilePreview 를 재사용한다.
page 는 탭 id 가 아니라 셸이 들고 initialPage 로 내려보낸다 —
같은 PDF 의 여러 쪽 링크가 탭을 여러 개 만들지 않게."
```

---

### Task 7: 실기 확인과 PR

**Files:** 없음 (확인과 PR 작성)

**Interfaces:**
- Consumes: Task 1-6 전부

- [ ] **Step 1: 앱을 띄운다**

Run: `npm run tauri dev`
Expected: 데스크톱 창이 뜬다

- [ ] **Step 2: 확인용 원본을 준비한다**

세션 스크래치패드에 만들어 둔 두 파일을 인박스 탭에서 업로드한다.

- `lecture.pdf` — 12쪽, 각 쪽에 "PAGE N" 이 큰 글씨로 찍혀 있다. pdf.js 로 12쪽 판독까지 확인 완료
- `diagram.svg` — 원·사각형·삼각형 + 문구

**파일명을 한글로 바꾸지 말 것.** `save_source_file` 이 stem 을 slug 처리하는데 한글 stem 은 해시로 뭉개진다(`src-tauri/src/tests.rs:760`). 그러면 본문의 `[[...]]` 와 저장된 파일명이 어긋나 확인 자체가 성립하지 않는다. 영문 소문자 이름은 그대로 남는다.

- [ ] **Step 3: 노트에 네 줄을 넣는다**

위키 문서 하나를 편집 모드로 열고 본문에 다음을 넣은 뒤 저장한다.

```md
[[lecture.pdf]]
[[lecture.pdf#page=12]]
[[lecture.pdf#page=200]]
![[diagram.svg]]
```

- [ ] **Step 4: 네 동작을 확인한다**

- 첫 줄 클릭 → `Original` 탭이 새로 열리고 PDF 1쪽("PAGE 1")이 보인다
- 둘째 줄 클릭 → **같은 탭**이 유지된 채 12쪽("PAGE 12")으로 이동한다. 탭이 새로 생기면 안 된다
- 셋째 줄 클릭 → 같은 탭, 1쪽으로 돌아가고 툴바 아래에 "요청한 200쪽이 범위를 벗어남(총 12쪽) — 1쪽을 표시합니다." 가 뜬다
- 넷째 줄 → 본문에 svg 가 그림으로 보인다 (수정 전에는 안 보였다)

인박스 화면의 위키 패널에서도 첫 줄 클릭이 원본 탭을 여는지 함께 본다 — 카드가 재현한 화면이다.

- [ ] **Step 5: 비포·애프터 스크린샷을 찍는다**

CLAUDE.md 의 협업 규칙상 UI 변경 PR 은 비포·애프터 스크린샷이 필수다. 에이전트는 앱 화면을 캡처할 수 없으므로 **사용자에게 요청한다.** 필요한 것은 두 쌍이다.

- `[[lecture.pdf]]` 클릭: 수정 전("연결된 위키가 아직 없어요" 툴팁) / 수정 후(원본 탭)
- `![[diagram.svg]]`: 수정 전(안 보임) / 수정 후(그림)

- [ ] **Step 6: PR 을 올린다**

```bash
git push -u origin fix/pie-66-wikilink-contract
```

PR 본문에 다음을 넣는다.

- 이 계획서와 설계 문서 링크
- "Before / After" 절과 Step 5 의 스크린샷
- 계약 파일(`docs/10-contracts/wikilink-embed.md`)을 건드렸다는 사실과 §4 에 GIF 를 추가한 이유
- 카드 3번 항목의 실제 상태(임베드 경로는 이미 준수, 링크 경로가 빠져 있었음)

PR 에 `contracts-change` 라벨을 달고 계약 담당(@ChangSik88)에게 리뷰를 요청한다. 일반 변경분 리뷰어도 최소 1명 필요하다.

- [ ] **Step 7: Linear 를 갱신한다**

PIE-66 상태를 `Done` 으로 옮기고 PR 링크를 코멘트로 남긴다(팀 그라운드 룰 §1.2). 담당자 칸이 다른 사람으로 되어 있으면 팀장(박서준)에게 확인받는다.
