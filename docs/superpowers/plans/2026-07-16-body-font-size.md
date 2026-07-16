# 본문 글자 크기 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 노트 본문(에디터 + 읽기 모드) 글자 크기를 설정 모달 스테퍼(`[-] N px [+]`, 13~17, 1px 단위)로 조절하고 localStorage 에 유지한다.

**Architecture:** CSS 변수 `--pp-body-font-size` 하나를 `:root` 에 두고, 앱 마운트·설정 변경 시 `settings.ts` 의 `applyBodyFontSize` 가 documentElement 에 주입한다. CM6 에디터 테마와 read-mode Markdown 본문 클래스가 그 변수를 참조 — 리렌더·에디터 재구성 없이 즉시 반영. 스펙: [`2026-07-16-body-font-size-design.md`](../specs/2026-07-16-body-font-size-design.md).

**Tech Stack:** React 18 + localStorage(settings.ts 기존 패턴) + CM6 theme + Tailwind arbitrary value.

## Global Constraints

- 작업 위치: `/Users/park/dev/piecepool/.claude/worktrees/feat-pdf-wiki-terms`, 브랜치 `feat/body-font-size` (base main a6e5113). 모든 명령 이 디렉토리에서.
- 허용값 13~17 정수, 기본 15. UI(버튼·사이드바)·읽기 모드 헤딩·테이블(14px)·코드(0.9em)는 불변.
- Rust·`docs/10-contracts/`·LLM 변경 금지. 커밋 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 각 태스크 끝 `npm test` green, 최종 `npm run check`.

---

### Task 1: settings.ts — get/set/apply + 테스트

**Files:**
- Modify: `src/lib/settings.ts` (파일 끝에 섹션 추가)
- Test: `src/lib/settings.test.ts` (describe 추가)

**Interfaces:**
- Produces: `getBodyFontSize(): number` (기본 15, 13~17 정수 클램프) · `setBodyFontSize(px: number): void` · `applyBodyFontSize(px: number): void` (documentElement 에 `--pp-body-font-size` 주입, document 없으면 no-op) · `BODY_FONT_MIN = 13` · `BODY_FONT_MAX = 17`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/settings.test.ts` — import 목록에 `getBodyFontSize, setBodyFontSize, BODY_FONT_MIN, BODY_FONT_MAX` 추가 후 파일 끝에:

```ts
describe("본문 글자 크기", () => {
  it("기본값 15", () => {
    expect(getBodyFontSize()).toBe(15);
  });

  it("set/get 라운드트립", () => {
    setBodyFontSize(17);
    expect(getBodyFontSize()).toBe(17);
  });

  it("범위 밖·비정수·쓰레기 값은 클램프/폴백", () => {
    setBodyFontSize(12);
    expect(getBodyFontSize()).toBe(BODY_FONT_MIN); // 12 → 13
    setBodyFontSize(99);
    expect(getBodyFontSize()).toBe(BODY_FONT_MAX); // 99 → 17
    localStorage.setItem("body-font-size", "abc");
    expect(getBodyFontSize()).toBe(15);
    localStorage.setItem("body-font-size", "15.7");
    expect(getBodyFontSize()).toBe(15); // 정수화
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/settings.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: 구현**

`src/lib/settings.ts` 파일 끝에 추가:

```ts
// ── 본문 글자 크기 — 에디터(CM6 테마)와 읽기 모드(markdown.tsx)가 공유하는 CSS 변수 ──
// 스펙: docs/superpowers/specs/2026-07-16-body-font-size-design.md
const BODY_FONT_KEY = "body-font-size";
export const BODY_FONT_MIN = 13;
export const BODY_FONT_MAX = 17;
const BODY_FONT_DEFAULT = 15;

export function getBodyFontSize(): number {
  const raw = Number(ls()?.getItem(BODY_FONT_KEY));
  if (!Number.isInteger(raw)) return BODY_FONT_DEFAULT;
  return Math.min(BODY_FONT_MAX, Math.max(BODY_FONT_MIN, raw));
}

export function setBodyFontSize(px: number): void {
  ls()?.setItem(BODY_FONT_KEY, String(px));
}

/** documentElement 에 --pp-body-font-size 주입 — 앱 시작(PiecePoolApp)·설정 변경 공용. */
export function applyBodyFontSize(px: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--pp-body-font-size", `${px}px`);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/settings.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "feat(settings): 본문 글자 크기 get/set/apply — 13~17 클램프, 기본 15

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: CSS 변수 적용 — :root · 앱 마운트 · 에디터 · 읽기 모드

**Files:**
- Modify: `src/styles/index.css` (`:root` 블록)
- Modify: `src/app/PiecePoolApp.tsx` (마운트 effect)
- Modify: `src/lib/SlashBlockEditor.tsx:20`
- Modify: `src/lib/markdown.tsx:117-121`

**Interfaces:**
- Consumes: Task 1 의 `getBodyFontSize`, `applyBodyFontSize`

- [ ] **Step 1: `:root` 폴백 기본값**

`src/styles/index.css` 의 첫 `:root {` 블록 안에 한 줄 추가:

```css
  --pp-body-font-size: 15px; /* 본문 글자 크기 — settings.ts applyBodyFontSize 가 덮어쓴다 */
```

- [ ] **Step 2: 앱 마운트 시 저장값 주입**

`src/app/PiecePoolApp.tsx` — import 에 `getBodyFontSize, applyBodyFontSize` 를 기존 `../lib/settings` import 에 추가(없으면 새 줄). 컴포넌트 본문 상단 state 선언들 뒤에:

```tsx
  // 본문 글자 크기 — 저장값을 CSS 변수로 1회 주입(이후 변경은 설정 모달이 직접 apply)
  useEffect(() => applyBodyFontSize(getBodyFontSize()), []);
```

- [ ] **Step 3: 에디터 테마 변수 참조**

`src/lib/SlashBlockEditor.tsx:20` 교체:

```ts
  "&": { color: "var(--ds-ink)", fontSize: "var(--pp-body-font-size, 15px)" },
```

- [ ] **Step 4: 읽기 모드 본문 클래스 변수 참조**

`src/lib/markdown.tsx` — p·ul·ol·blockquote 4곳의 `text-[15px]` 를 `text-[length:var(--pp-body-font-size,15px)]` 로 교체:

```tsx
          p: ({ children }) => <p className="text-[length:var(--pp-body-font-size,15px)] leading-relaxed text-ink-2">{children}</p>,
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1 text-[length:var(--pp-body-font-size,15px)] text-ink-2">{children}</ul>,
          ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1 text-[length:var(--pp-body-font-size,15px)] text-ink-2">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-hairline pl-3 text-[length:var(--pp-body-font-size,15px)] italic text-ink-muted">{children}</blockquote>,
```

(테이블 14px·코드 0.9em·헤딩은 그대로 — 스펙 §구성 요소)

- [ ] **Step 5: 검증 + 커밋**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 0, 전체 PASS

```bash
git add src/styles/index.css src/app/PiecePoolApp.tsx src/lib/SlashBlockEditor.tsx src/lib/markdown.tsx
git commit -m "feat(ui): 본문 글자 크기를 --pp-body-font-size 변수로 — 에디터·읽기 모드 공용

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 설정 모달 스테퍼

**Files:**
- Modify: `src/app/shell/SettingsModal.tsx`

**Interfaces:**
- Consumes: Task 1 의 `getBodyFontSize, setBodyFontSize, applyBodyFontSize, BODY_FONT_MIN, BODY_FONT_MAX`

- [ ] **Step 1: import·상태·핸들러 추가**

`SettingsModal.tsx` — `../../lib/settings` import 에 `getBodyFontSize, setBodyFontSize, applyBodyFontSize, BODY_FONT_MIN, BODY_FONT_MAX` 추가. `const changeLang = ...` 아래에:

```tsx
  const [fontSize, setFontSize] = useState(getBodyFontSize());
  // 클릭 즉시 저장 + CSS 변수 반영 — 생성 언어 토글과 같은 즉시 적용 결(저장 버튼 없음)
  const changeFontSize = (delta: number) => {
    const next = Math.min(BODY_FONT_MAX, Math.max(BODY_FONT_MIN, fontSize + delta));
    setFontSize(next);
    setBodyFontSize(next);
    applyBodyFontSize(next);
  };
```

- [ ] **Step 2: 스테퍼 UI — 생성 언어 행 바로 아래에 추가**

생성 언어 행(`</div>` 로 닫히는 `flex items-center justify-between rounded-md border` 블록) 다음에:

```tsx
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <div>
              <span className="text-[14px] text-ink-2">본문 글자 크기</span>
              <p className="text-[12px] text-ink-muted">노트 에디터·위키·문서 본문에 적용됩니다 ({BODY_FONT_MIN}~{BODY_FONT_MAX}px).</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="utility"
                size="sm"
                aria-label="본문 글자 작게"
                disabled={fontSize <= BODY_FONT_MIN}
                onClick={() => changeFontSize(-1)}
              >
                −
              </Button>
              <span className="w-12 text-center text-[14px] tabular-nums text-ink">{fontSize}px</span>
              <Button
                variant="utility"
                size="sm"
                aria-label="본문 글자 크게"
                disabled={fontSize >= BODY_FONT_MAX}
                onClick={() => changeFontSize(1)}
              >
                +
              </Button>
            </div>
          </div>
```

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit && npm test && npm run check`
Expected: 전부 PASS

```bash
git add src/app/shell/SettingsModal.tsx
git commit -m "feat(settings): 본문 글자 크기 스테퍼 — [-] N px [+], 13~17 즉시 반영

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

수동 확인(dev 앱): 설정 → 스테퍼 조절 시 에디터·위키 패널·DocView 본문 즉시 변화, 13/17 경계에서 버튼 disabled, 재시작 후 유지.

## Self-Review 체크

- 스펙 커버: 범위(에디터+읽기 모드)=Task 2 / 스테퍼 13~17=Task 3 / 클램프·폴백=Task 1 / 즉시 반영·재시작 유지=Task 1·2·3. 갭 없음.
- placeholder 없음, 시그니처 일관(`getBodyFontSize/setBodyFontSize/applyBodyFontSize/BODY_FONT_MIN/MAX` 전 태스크 동일).
