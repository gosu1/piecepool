# PDF 원샷 파이프라인 + 본문 키워드→위키 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF를 드롭하면 제목 입력 → 요약 스트리밍 → 자동 저장+위키 생성까지 원샷으로 진행되고, 위키 패널에 이번 노트의 개념 목록이 전부 뜨며, 본문 속 개념 키워드가 은은히 강조되어 클릭하면 해당 위키가 열린다.

**Architecture:** 표시-시점 매칭(프론트 전용, 본문 비파괴). 공유 매처(`src/lib/wikiTerms.ts`)를 CodeMirror 데코레이션(에디터)과 remark 플러그인(읽기 모드)이 함께 쓴다. 파이프라인은 기존 `runSummary` → `runImport` 체인 연결만 — LLM 호출·Rust·계약 변경 없음. 스펙: [`docs/superpowers/specs/2026-07-16-pdf-auto-pipeline-wiki-terms-design.md`](../specs/2026-07-16-pdf-auto-pipeline-wiki-terms-design.md).

**Tech Stack:** React 18 + zustand + CodeMirror 6(@uiw/react-codemirror) + react-markdown/unified + vitest.

## Global Constraints

- 작업 위치: worktree `/Users/park/dev/piecepool/.claude/worktrees/feat-pdf-wiki-terms`, 브랜치 `worktree-feat-pdf-wiki-terms` (base origin/main 666c253). 모든 명령은 이 디렉토리에서.
- **Rust(`src-tauri/`)·LLM 프롬프트(`src/llm/`)·`docs/10-contracts/` 변경 금지.**
- **`LoadingOverlay` 컴포넌트(InboxSection.tsx:92) 수정 금지** — `feat+loading-quotes` worktree 와 충돌 회피.
- 본문(에디터 value·archive 저장물)은 어떤 경우에도 표시 계층이 수정하지 않는다.
- 주석 컨벤션: 본문 한국어, 식별자·타입 영어(기존 파일 스타일 따름).
- 커밋 메시지 끝에 항상: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 각 태스크 끝에 `npm test` green 확인. 최종 태스크에서 `npm run check`(tsc)까지.
- `main` 직접 푸시 금지. PR 전 `docs/00-overview/journey.md` 타임라인 행 추가 필수(훅이 차단).

---

### Task 1: 공유 키워드 매처 `src/lib/wikiTerms.ts`

**Files:**
- Create: `src/lib/wikiTerms.ts`
- Test: `src/lib/wikiTerms.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `interface TermMatch { from: number; to: number; title: string }`
  - `interface TermMatcher { regex: RegExp; byKey: Map<string, string> }`
  - `buildTermMatcher(titles: string[]): TermMatcher | null` — 2글자 미만·중복 제거, 전부 걸러지면 null
  - `findTermMatches(text: string, matcher: TermMatcher, excluded?: Array<{from:number;to:number}>): TermMatch[]`
  - `findExcludedRanges(text: string): Array<{from:number;to:number}>` — `[[..]]`/`![[..]]`·URL·인라인 코드
  - (Task 2에서 같은 파일에 `remarkWikiTerm` 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/wikiTerms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTermMatcher, findTermMatches, findExcludedRanges } from "./wikiTerms";

const M = (titles: string[]) => {
  const m = buildTermMatcher(titles);
  if (!m) throw new Error("matcher null");
  return m;
};

describe("buildTermMatcher", () => {
  it("2글자 미만·공백 제목은 버리고, 전부 걸러지면 null", () => {
    expect(buildTermMatcher([])).toBeNull();
    expect(buildTermMatcher(["a", " ", ""])).toBeNull();
  });

  it("대소문자만 다른 중복 제목은 하나로 접는다", () => {
    const m = M(["TCP", "tcp"]);
    expect(findTermMatches("tcp 연결", m)).toHaveLength(1);
  });
});

describe("findTermMatches — 경계 규칙", () => {
  it("한글 조사 뒤는 매치 인정", () => {
    const m = M(["프로세스"]);
    expect(findTermMatches("프로세스는 실행 단위다", m)).toEqual([{ from: 0, to: 4, title: "프로세스" }]);
    expect(findTermMatches("프로세스에서 시작", m)).toEqual([{ from: 0, to: 4, title: "프로세스" }]);
  });

  it("조사가 아닌 한글이 이어지면 불인정", () => {
    const m = M(["프로세스"]);
    expect(findTermMatches("프로세스들", m)).toEqual([]); // "들"은 whitelist 밖
    expect(findTermMatches("프로세스는지금", m)).toEqual([]); // 조사 뒤에 또 한글
  });

  it("영숫자 부분 단어는 불인정", () => {
    const m = M(["TCP"]);
    expect(findTermMatches("TCP 연결", m)).toHaveLength(1);
    expect(findTermMatches("HTCPCP", m)).toEqual([]);
    expect(findTermMatches("TCP2", m)).toEqual([]);
  });

  it("겹치면 최장 일치 우선", () => {
    const m = M(["운영체제", "운영체제 스케줄러"]);
    expect(findTermMatches("운영체제 스케줄러 개념", m)).toEqual([{ from: 0, to: 9, title: "운영체제 스케줄러" }]);
  });

  it("대소문자 무시 매치, canonical 제목 반환", () => {
    const m = M(["Transformer"]);
    expect(findTermMatches("transformer 구조", m)[0].title).toBe("Transformer");
  });

  it("정규식 메타문자 제목도 안전", () => {
    const m = M(["C++"]);
    expect(findTermMatches("C++ 언어", m)).toEqual([{ from: 0, to: 3, title: "C++" }]);
  });

  it("excluded 구간과 겹치면 버린다", () => {
    const m = M(["프로세스"]);
    expect(findTermMatches("프로세스", m, [{ from: 0, to: 4 }])).toEqual([]);
  });

  it("한 텍스트에서 여러 매치, 등장 순", () => {
    const m = M(["스레드", "프로세스"]);
    const r = findTermMatches("프로세스와 스레드의 차이", m);
    expect(r.map((x) => x.title)).toEqual(["프로세스", "스레드"]);
  });
});

describe("findExcludedRanges", () => {
  it("위키링크·임베드·URL·인라인 코드 구간을 돌려준다", () => {
    const text = "본문 ![[a.pdf]] 과 [[개념]] 그리고 https://x.io/p `코드` 끝";
    const spans = findExcludedRanges(text).map((r) => text.slice(r.from, r.to));
    expect(spans).toEqual(["![[a.pdf]]", "[[개념]]", "https://x.io/p", "`코드`"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/wikiTerms.test.ts`
Expected: FAIL — `Cannot find module './wikiTerms'`

- [ ] **Step 3: 구현**

`src/lib/wikiTerms.ts`:

```ts
// 본문 속 위키 개념 키워드 매칭 — 표시 계층 전용(본문 비파괴).
// 에디터(cmWikiTerm)·읽기 모드(remarkWikiTerm)가 같은 규칙을 공유한다.
// 스펙: docs/superpowers/specs/2026-07-16-pdf-auto-pipeline-wiki-terms-design.md §4.

export interface TermMatch {
  from: number;
  to: number;
  title: string; // canonical 위키 제목 (매치 표면형이 대소문자 달라도 원 제목)
}

export interface TermMatcher {
  regex: RegExp;
  byKey: Map<string, string>; // lowercase 표면형 → canonical 제목
}

// 제목 뒤에 붙어도 매치로 인정하는 한국어 조사 — 긴 것 먼저("에서"가 "에"보다 먼저 걸리게).
const PARTICLES = ["에서", "부터", "까지", "처럼", "조차", "마저", "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만"];

const WORD = /[A-Za-z0-9가-힣]/;

/** 제목 목록 → 매처. 2글자 미만 제외(과매칭 방지), 대소문자 무시 중복 제거, 최장 우선 정렬. */
export function buildTermMatcher(titles: string[]): TermMatcher | null {
  const seen = new Set<string>();
  const list = titles
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t) => {
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.length - a.length); // alternation 은 앞이 이긴다 — 최장 일치 우선
  if (!list.length) return null;
  const esc = list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return { regex: new RegExp(`(?:${esc.join("|")})`, "gi"), byKey: new Map(list.map((t) => [t.toLowerCase(), t])) };
}

/** 매치 뒤 경계 — 비단어문자면 OK, 한글이면 조사(+비단어문자)일 때만 OK. */
function okAfter(text: string, end: number): boolean {
  const c = text[end];
  if (c === undefined || !WORD.test(c)) return true;
  if (!/[가-힣]/.test(c)) return false;
  for (const p of PARTICLES) {
    if (text.startsWith(p, end)) {
      const after = text[end + p.length];
      if (after === undefined || !WORD.test(after)) return true;
    }
  }
  return false;
}

/** text 안의 개념 매치 전부(등장 순, 비중첩). excluded 구간과 겹치는 매치는 버린다. */
export function findTermMatches(
  text: string,
  matcher: TermMatcher,
  excluded: Array<{ from: number; to: number }> = [],
): TermMatch[] {
  const out: TermMatch[] = [];
  const re = new RegExp(matcher.regex.source, "gi"); // 호출마다 독립 — 공유 lastIndex 오염 방지
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    const prev = text[from - 1];
    const boundaryOk = (prev === undefined || !WORD.test(prev)) && okAfter(text, to);
    const hitExcluded = excluded.some((r) => from < r.to && to > r.from);
    if (boundaryOk && !hitExcluded) {
      out.push({ from, to, title: matcher.byKey.get(m[0].toLowerCase()) ?? m[0] });
    } else {
      re.lastIndex = from + 1; // 이 자리 실패 — 한 글자 뒤부터 다시(안쪽 짧은 제목 기회)
    }
  }
  return out;
}

// 매칭 제외 구간(순수 텍스트 규칙): 위키링크/임베드 · URL · 인라인 코드.
// 펜스 코드블록은 에디터에선 syntaxTree(cmWikiTerm), 읽기 모드에선 mdast 구조가 이미 걸러 준다.
const EXCLUDE = /!?\[\[[^\]]*\]\]|https?:\/\/[^\s)]+|`[^`\n]*`/g;

export function findExcludedRanges(text: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  EXCLUDE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXCLUDE.exec(text)) !== null) out.push({ from: m.index, to: m.index + m[0].length });
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/wikiTerms.test.ts`
Expected: PASS (전 케이스)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/wikiTerms.ts src/lib/wikiTerms.test.ts
git commit -m "feat(wiki-terms): 본문 키워드 매처 — 경계·조사·최장일치 규칙

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 읽기 모드 — `remarkWikiTerm` + `Markdown` terms prop

**Files:**
- Modify: `src/lib/wikiTerms.ts` (플러그인 추가)
- Modify: `src/lib/markdown.tsx`
- Test: `src/lib/wikiTerms.test.ts` (케이스 추가)

**Interfaces:**
- Consumes: Task 1의 `buildTermMatcher`, `findTermMatches`
- Produces:
  - `remarkWikiTerm(opts: { titles: string[] })` — 텍스트 노드의 매치를 `url: "term:<제목>"` link 노드로 치환하는 remark 플러그인
  - `MarkdownProps.terms?: string[]` — 있으면 매치가 강조 버튼으로 렌더, 클릭 시 기존 `onLink(제목)` 호출

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/wikiTerms.test.ts` 하단에 추가 (markdownRender.test.ts 와 같은 unified 패턴):

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { remarkWikilink } from "./wikilink";
import { remarkWikiTerm } from "./wikiTerms";

interface HNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { href?: string };
  children?: HNode[];
}

function toHast(md: string, titles: string[]): HNode {
  const p = unified()
    .use(remarkParse)
    .use(remarkWikilink as never) // markdown.tsx 와 같은 순서 — 위키링크 먼저 링크 노드가 된다
    .use(remarkWikiTerm as never, { titles })
    .use(remarkRehype);
  return p.runSync(p.parse(md)) as unknown as HNode;
}

function findAllH(node: HNode, pred: (n: HNode) => boolean): HNode[] {
  const out: HNode[] = [];
  const walk = (n: HNode) => {
    if (pred(n)) out.push(n);
    n.children?.forEach(walk);
  };
  walk(node);
  return out;
}

describe("remarkWikiTerm", () => {
  it("본문 텍스트의 개념을 term: 링크로 치환한다", () => {
    const tree = toHast("프로세스는 실행 단위다", ["프로세스"]);
    const links = findAllH(tree, (n) => n.tagName === "a");
    expect(links).toHaveLength(1);
    expect(links[0].properties?.href).toBe("term:프로세스");
  });

  it("헤딩 속 개념도 치환한다", () => {
    const tree = toHast("## 프로세스 개요", ["프로세스"]);
    const links = findAllH(tree, (n) => n.tagName === "a" && n.properties?.href === "term:프로세스");
    expect(links).toHaveLength(1);
  });

  it("[[위키링크]] 안은 건드리지 않는다 — 중첩 링크 금지", () => {
    const tree = toHast("[[프로세스]] 참고", ["프로세스"]);
    const links = findAllH(tree, (n) => n.tagName === "a");
    expect(links).toHaveLength(1); // wiki: 링크 하나뿐
    expect(links[0].properties?.href).toBe("wiki:프로세스");
  });

  it("인라인 코드·코드블록은 건드리지 않는다", () => {
    const tree = toHast("`프로세스`\n\n```\n프로세스\n```", ["프로세스"]);
    expect(findAllH(tree, (n) => n.tagName === "a")).toHaveLength(0);
  });

  it("제목 목록이 비면 no-op", () => {
    const tree = toHast("프로세스", []);
    expect(findAllH(tree, (n) => n.tagName === "a")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/wikiTerms.test.ts`
Expected: FAIL — `remarkWikiTerm` export 없음

- [ ] **Step 3: 플러그인 구현**

`src/lib/wikiTerms.ts` 하단에 추가:

```ts
// ── remark 플러그인 (react-markdown 읽기 모드) — wikilink.ts 의 remarkWikilink 와 같은 결 ──
// remarkWikilink **뒤에** 실행돼야 한다: [[..]] 가 이미 link 노드라 텍스트 스캔에 안 걸린다.

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
  [k: string]: unknown;
}

function expandTerms(value: string, matcher: TermMatcher): MdNode[] {
  const matches = findTermMatches(value, matcher);
  if (!matches.length) return [{ type: "text", value }];
  const out: MdNode[] = [];
  let last = 0;
  for (const m of matches) {
    if (m.from > last) out.push({ type: "text", value: value.slice(last, m.from) });
    out.push({
      type: "link",
      url: `term:${m.title}`,
      title: null,
      children: [{ type: "text", value: value.slice(m.from, m.to) }],
    });
    last = m.to;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

/** 텍스트 노드의 개념 제목을 `term:` 링크로 치환. link 내부·code 노드는 구조상 안 닿는다. */
export function remarkWikiTerm(opts: { titles: string[] }) {
  const matcher = buildTermMatcher(opts?.titles ?? []);
  return (tree: MdNode) => {
    if (!matcher) return;
    const walk = (node: MdNode): void => {
      if (!node.children || node.type === "link") return; // 링크 안을 또 링크로 감싸지 않는다
      const next: MdNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && typeof child.value === "string") {
          next.push(...expandTerms(child.value, matcher));
        } else {
          walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree);
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/wikiTerms.test.ts`
Expected: PASS

- [ ] **Step 5: `Markdown` 컴포넌트에 terms prop 연결**

`src/lib/markdown.tsx` 수정 3곳:

(a) import 에 추가:

```tsx
import { remarkWikiTerm } from "./wikiTerms";
```

(b) `MarkdownProps` 에 필드 추가:

```tsx
  /** 본문 속 개념 키워드 강조 — 위키 제목 목록. 매치 클릭은 onLink(제목)로 전달(DocView 전용). */
  terms?: string[];
```

(c) 컴포넌트 시그니처에 `terms` 추가하고, 함수 본문 첫머리(components useMemo 위)에 플러그인 배열 memo 추가 + `ReactMarkdown` 의 `remarkPlugins` 를 그 변수로 교체:

```tsx
export const Markdown = memo(function Markdown({ source, className, onLink, linkExists, embedSpace, terms }: MarkdownProps) {
  // terms 는 내용 키로 memo — 부모가 매 렌더 새 배열을 줘도 파이프라인 재실행(임베드 재마운트) 없음.
  const termsKey = terms?.join("\n") ?? "";
  const remarkPlugins = useMemo(
    () => (terms?.length ? [...REMARK_PLUGINS, [remarkWikiTerm, { titles: terms }] as never] : REMARK_PLUGINS),
    // eslint 경고 무시 의도: terms 자체가 아니라 내용(termsKey)이 진실이다
    [termsKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
```

그리고 `a` 컴포넌트 분기의 `wiki:` 처리 **앞에** `term:` 분기 추가:

```tsx
            if (h.startsWith("term:")) {
              const target = decode(h.slice(5));
              // 은은한 키워드 강조 — 일반 위키링크(primary 밑줄)보다 조용하게, 배경 틴트 + 점선.
              return (
                <button
                  type="button"
                  onClick={() => onLink?.(target)}
                  className="rounded-[3px] bg-primary/[0.08] px-0.5 text-ink underline decoration-primary/50 decoration-dotted underline-offset-[3px] hover:bg-primary/[0.16]"
                >
                  {children}
                </button>
              );
            }
```

마지막으로 JSX 의 `remarkPlugins={REMARK_PLUGINS}` → `remarkPlugins={remarkPlugins}` 로 교체.

- [ ] **Step 6: 전체 테스트 + 커밋**

Run: `npm test`
Expected: 전체 PASS (기존 355 + 신규)

```bash
git add src/lib/wikiTerms.ts src/lib/wikiTerms.test.ts src/lib/markdown.tsx
git commit -m "feat(wiki-terms): 읽기 모드 키워드 강조 — remarkWikiTerm + Markdown terms prop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 에디터 — `cmWikiTerm` 데코레이션 + `SlashBlockEditor` props

**Files:**
- Create: `src/lib/cmWikiTerm.ts`
- Modify: `src/lib/SlashBlockEditor.tsx`
- Test: `src/lib/cmWikiTerm.test.ts`

**Interfaces:**
- Consumes: Task 1의 `buildTermMatcher`, `findTermMatches`, `findExcludedRanges`
- Produces:
  - `wikiTermExtension(getTerms: () => string[], onClick: (title: string) => void): Extension[]`
  - `refreshWikiTerms: StateEffect<null>` — terms 목록 변경 시 부모가 dispatch
  - `termDecoRanges(text, offset, matcher, codeRanges): Array<{from;to;title}>` (순수, 테스트 대상)
  - `SlashBlockEditor` 신규 props: `wikiTerms?: string[]`, `onWikiTerm?: (title: string) => void`

- [ ] **Step 1: 순수 코어 실패 테스트**

`src/lib/cmWikiTerm.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { termDecoRanges } from "./cmWikiTerm";
import { buildTermMatcher } from "./wikiTerms";

const m = buildTermMatcher(["프로세스", "스레드"])!;

describe("termDecoRanges", () => {
  it("문서 좌표(offset)로 변환해 돌려준다", () => {
    expect(termDecoRanges("프로세스와 스레드", 100, m, [])).toEqual([
      { from: 100, to: 104, title: "프로세스" },
      { from: 106, to: 109, title: "스레드" },
    ]);
  });

  it("인라인 코드·임베드(텍스트 규칙)는 제외", () => {
    const text = "`프로세스` ![[프로세스.pdf]] 프로세스";
    const r = termDecoRanges(text, 0, m, []);
    expect(r).toEqual([{ from: text.length - 4, to: text.length, title: "프로세스" }]);
  });

  it("codeRanges(문서 좌표, syntaxTree 산출)와 겹치면 제외", () => {
    // offset 10, "프로세스" = 문서 10..14 — 코드 범위 12..20 과 겹침
    expect(termDecoRanges("프로세스", 10, m, [{ from: 12, to: 20 }])).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/cmWikiTerm.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `cmWikiTerm.ts` 구현**

```ts
// 본문 키워드 → 위키 데코레이션(CM6). 표시 전용 — 문서는 안 바꾼다(hideMarkupMarks 와 같은 결).
// terms 는 getTerms() 로 매번 읽는다(부모 ref) — 목록이 바뀌면 부모가 refreshWikiTerms 를
// dispatch 해 편집 없이도 다시 그린다. 스펙 §4.

import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { buildTermMatcher, findTermMatches, findExcludedRanges, type TermMatcher } from "./wikiTerms";

export const refreshWikiTerms = StateEffect.define<null>();

// 매치를 걸지 않을 구문 노드 — 코드·URL·마크다운 링크(위키링크는 텍스트 규칙이 잡는다).
const SKIP_NODES = new Set(["FencedCode", "CodeBlock", "InlineCode", "URL", "Autolink", "Link", "Image"]);

/** 보이는 범위 텍스트의 데코 범위(문서 좌표) — 텍스트 규칙 + syntaxTree 코드 범위 둘 다 제외. */
export function termDecoRanges(
  text: string,
  offset: number,
  matcher: TermMatcher,
  codeRanges: Array<{ from: number; to: number }>,
): Array<{ from: number; to: number; title: string }> {
  const excluded = [
    ...findExcludedRanges(text),
    ...codeRanges.map((r) => ({ from: r.from - offset, to: r.to - offset })),
  ];
  return findTermMatches(text, matcher, excluded).map((m) => ({ from: m.from + offset, to: m.to + offset, title: m.title }));
}

function buildDeco(view: EditorView, matcher: TermMatcher | null): DecorationSet {
  if (!matcher) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const codeRanges: Array<{ from: number; to: number }> = [];
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (SKIP_NODES.has(node.name)) codeRanges.push({ from: node.from, to: node.to });
      },
    });
    for (const r of termDecoRanges(view.state.sliceDoc(from, to), from, matcher, codeRanges)) {
      builder.add(r.from, r.to, Decoration.mark({ class: "cm-wiki-term", attributes: { "data-wiki-term": r.title } }));
    }
  }
  return builder.finish();
}

const termTheme = EditorView.theme({
  ".cm-wiki-term": {
    backgroundColor: "color-mix(in srgb, var(--ds-primary) 9%, transparent)",
    borderRadius: "3px",
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: "color-mix(in srgb, var(--ds-primary) 55%, transparent)",
    textUnderlineOffset: "3px",
    cursor: "pointer",
  },
  ".cm-wiki-term:hover": { backgroundColor: "color-mix(in srgb, var(--ds-primary) 18%, transparent)" },
});

export function wikiTermExtension(getTerms: () => string[], onClick: (title: string) => void): Extension[] {
  // matcher 는 terms 내용이 바뀔 때만 재생성 — 매 update 재빌드는 낭비.
  let matcher: TermMatcher | null = null;
  let key: string | null = null;
  const ensure = () => {
    const terms = getTerms();
    const k = terms.join("\n");
    if (k !== key) {
      key = k;
      matcher = buildTermMatcher(terms);
    }
    return matcher;
  };
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDeco(view, ensure());
      }
      update(u: ViewUpdate) {
        const refreshed = u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshWikiTerms)));
        if (u.docChanged || u.viewportChanged || refreshed) this.decorations = buildDeco(u.view, ensure());
      }
    },
    { decorations: (v) => v.decorations },
  );
  const click = EditorView.domEventHandlers({
    click: (e, view) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".cm-wiki-term");
      const title = el?.getAttribute("data-wiki-term");
      if (!title) return false;
      if (!view.state.selection.main.empty) return false; // 드래그 선택은 클릭이 아니다
      onClick(title);
      return false; // 기본 처리(커서 이동)는 그대로 — 위키만 옆에 연다
    },
  });
  return [plugin, click, termTheme];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/cmWikiTerm.test.ts`
Expected: PASS

- [ ] **Step 5: `SlashBlockEditor` 에 props 연결**

`src/lib/SlashBlockEditor.tsx` 수정 4곳:

(a) import 추가:

```tsx
import { wikiTermExtension, refreshWikiTerms } from "./cmWikiTerm";
```

(b) props 시그니처(destructure + 타입)에 추가 — `foldEasyKey = 0,` 뒤:

```tsx
  wikiTerms,
  onWikiTerm,
```

타입 블록의 `foldEasyKey?: number;` 뒤:

```tsx
  /** 본문 속 개념 키워드 강조 — 위키 제목 목록(표시 전용, 문서 비파괴) */
  wikiTerms?: string[];
  /** 강조된 키워드 클릭 — canonical 위키 제목을 올린다 */
  onWikiTerm?: (title: string) => void;
```

(c) 컴포넌트 본문, `viewRef` 선언 아래에 ref + 갱신 effect 추가:

```tsx
  const termsRef = useRef(wikiTerms);
  termsRef.current = wikiTerms;
  const onTermRef = useRef(onWikiTerm);
  onTermRef.current = onWikiTerm;
  // terms 는 내용 키로 비교 — 부모가 매 렌더 새 배열을 줘도 재데코 dispatch 는 내용 변경 때만.
  const termsKey = (wikiTerms ?? []).join("\n");
  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshWikiTerms.of(null) });
  }, [termsKey]);
```

(d) extensions useMemo 배열의 `slashTrigger,` 다음 줄에 추가 (deps 변경 없음 — ref 로만 읽는다):

```tsx
      ...wikiTermExtension(() => termsRef.current ?? [], (t) => onTermRef.current?.(t)),
```

- [ ] **Step 6: 전체 테스트 + 커밋**

Run: `npm test`
Expected: 전체 PASS

```bash
git add src/lib/cmWikiTerm.ts src/lib/cmWikiTerm.test.ts src/lib/SlashBlockEditor.tsx
git commit -m "feat(wiki-terms): 에디터 키워드 데코레이션 — cmWikiTerm + SlashBlockEditor props

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `runSummary` 가 종결 상태를 돌려준다

**Files:**
- Modify: `src/store/inboxDraftStore.ts`
- Test: `src/store/inboxDraftStore.test.ts` (케이스 추가)

**Interfaces:**
- Consumes: 기존 `runPdfSummary`
- Produces: `runSummary(p): Promise<PdfSummaryStatus | null>` — `"done" | "cancelled" | "failed"`, single-flight 재진입이면 `null`. (Task 6의 자동 트리거가 `"done"` 판정에 쓴다)

- [ ] **Step 1: 실패하는 테스트 추가**

`src/store/inboxDraftStore.test.ts` 의 기존 describe 들 뒤에 추가 (파일 상단 mock 은 이미 있음):

```ts
describe("runSummary 반환값 — 원샷 파이프라인 트리거 판정용", () => {
  it("정상 종결이면 'done'", async () => {
    vi.mocked(runPdfSummary).mockResolvedValue({ markdown: "# 요약", truncated: false });
    const out = await useInboxDraftStore.getState().runSummary(RUN);
    expect(out).toBe("done");
    expect(useInboxDraftStore.getState().job?.status).toBe("done");
  });

  it("사용자 취소(AbortError)면 'cancelled'", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    vi.mocked(runPdfSummary).mockRejectedValue(abort);
    const out = await useInboxDraftStore.getState().runSummary(RUN);
    expect(out).toBe("cancelled");
  });

  it("실패면 'failed'", async () => {
    vi.mocked(runPdfSummary).mockRejectedValue(new Error("boom"));
    const out = await useInboxDraftStore.getState().runSummary(RUN);
    expect(out).toBe("failed");
  });

  it("스트리밍 중 재진입은 null (single-flight)", async () => {
    useInboxDraftStore.setState({ job: { noteKey: "other", file: "x.pdf", status: "streaming", text: "" } });
    const out = await useInboxDraftStore.getState().runSummary(RUN);
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/store/inboxDraftStore.test.ts`
Expected: FAIL — 반환값이 undefined

- [ ] **Step 3: 구현**

`src/store/inboxDraftStore.ts` 수정 2곳:

(a) 인터페이스의 `runSummary` 시그니처 교체:

```ts
  // 종결 상태를 돌려준다 — 원샷 파이프라인(InboxSection)이 "done"일 때만 자동 저장+위키를 잇는다.
  // single-flight 재진입이면 null(아무것도 안 했음).
  runSummary: (p: { noteKey: string; file: string; title: string; text: string }) => Promise<PdfSummaryStatus | null>;
```

(b) 구현부 — 각 종결 분기에서 상태를 return (finish 호출은 그대로):

```ts
        runSummary: async (p) => {
          if (get().job?.status === "streaming") return null; // single-flight (버튼 disable 백스톱)
          const myAc = new AbortController();
          ac = myAc;
          latest = "";
          set({ job: { noteKey: p.noteKey, file: p.file, status: "streaming", text: "" } });
          try {
            const r = await runPdfSummary({ sourceTitle: p.title, sourceText: p.text }, apiKey(), {
              onDelta,
              signal: myAc.signal,
            });
            finish(p.noteKey, r.markdown, { status: "done", text: r.markdown, truncated: r.truncated, warning: r.warning });
            return "done";
          } catch (e) {
            if (e instanceof Error && e.name === "AbortError") {
              finish(p.noteKey, latest, { status: "cancelled", text: latest });
              return "cancelled";
            } else if (e instanceof PdfSummaryStreamError) {
              finish(p.noteKey, latest, { status: "failed", text: latest, error: e.message });
              return "failed";
            }
            finish(p.noteKey, "", { status: "failed", error: e instanceof Error ? e.message : String(e) });
            return "failed";
          } finally {
            if (ac === myAc) ac = null; // 내가 시작한 컨트롤러일 때만 정리(다른 노트 요약을 건드리지 않게)
          }
        },
```

- [ ] **Step 4: 통과 + 전체 확인**

Run: `npx vitest run src/store/inboxDraftStore.test.ts && npm test`
Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/store/inboxDraftStore.ts src/store/inboxDraftStore.test.ts
git commit -m "feat(inbox): runSummary 가 종결 상태(done/cancelled/failed)를 반환

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 위키 패널 개념 목록 + Inbox 에디터 키워드 연결

**Files:**
- Modify: `src/store/importStore.ts` (`wikiPaths` 추가)
- Modify: `src/app/panes/InboxSection.tsx` (wikiPane 목록 뷰 · PaneSelect 제거 · 에디터 terms 연결)

**Interfaces:**
- Consumes: Task 3의 `SlashBlockEditor.wikiTerms/onWikiTerm`
- Produces: `ImportJobView.wikiPaths?: string[]` (Task 6의 run() 완료 분기가 사용)

- [ ] **Step 1: `importStore` 에 wikiPaths 추가**

`src/store/importStore.ts` 수정 2곳:

(a) `ImportJobView` 의 `firstWikiPath?: string;` 줄 아래에:

```ts
  wikiPaths?: string[]; // 이번 임포트로 생성/병합된 위키 경로 전부 — 위키 패널 개념 목록(스펙 §3)
```

(b) `writeAndComplete` 의 `firstWikiPath: applied.pages[0]?.path,` 줄 아래에:

```ts
      wikiPaths: applied.pages.map((pg) => pg.path),
```

- [ ] **Step 2: InboxSection — 에디터 키워드 + 위키 패널 목록**

`src/app/panes/InboxSection.tsx` 수정:

(a) import 줄 수정 — `useMemo` 추가:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```

(b) `const refWiki = ...` (기존 388행 부근) 아래에 추가:

```tsx
  // ── 본문 키워드 강조·클릭 (스펙 §4) — 대상 공간의 위키 제목 전부(정리 글 제외) ──
  const termTitles = useMemo(
    () => refCandidates.filter((w) => !isSynthesisPage(w)).map((w) => w.title),
    [refCandidates],
  );
  // 키워드 클릭 → 위키 패널 오픈 + 해당 위키 열람 (resolveLink 와 같은 제목 매칭: 정확 → 대소문자 무시)
  const openWikiByTitle = (t: string) => {
    const hit =
      refCandidates.find((w) => w.title === t) ??
      refCandidates.find((w) => w.title.toLowerCase() === t.toLowerCase());
    if (!hit) return;
    setRefWikiPath(hit.path);
    togglePanel("wiki", true);
  };

  // ── 위키 패널 개념 목록 (스펙 §3) — 이번 임포트 개념이 있으면 그것만, 없으면 공간 전체 ──
  const jobWikiPaths =
    job?.status === "completed" && job.space === targetSpace && job.noteFile && job.noteFile === savedFile
      ? (job.wikiPaths ?? [])
      : [];
  const listWikis = jobWikiPaths.length
    ? jobWikiPaths.map((p) => refCandidates.find((w) => w.path === p)).filter((w): w is WikiPageT => !!w)
    : refCandidates.filter((w) => !isSynthesisPage(w));
```

(c) notePane 의 `<SlashBlockEditor ... />` 호출에 props 2개 추가 (`frameless` 아래):

```tsx
            wikiTerms={termTitles}
            onWikiTerm={openWikiByTitle}
```

(d) `wikiPane` 전체를 아래로 교체 (드롭다운 제거 → 목록/열람 2상태):

```tsx
  // ── 위키 패널 (우측 보조) — 개념 목록(기본) ↔ 열람. 드롭다운 대신 본문 키워드·목록으로 연다 ──
  const wikiPane = (
    <section style={{ width: `${paneW.wiki}%`, minWidth: 280 }} className="flex min-w-0 shrink-0 flex-col border-l border-hairline">
      <PaneHeader
        label="위키"
        hint={refCandidates.length > 0 ? `${targetName}의 위키 ${refCandidates.length}개` : "위키 없음"}
        right={
          refWiki ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <Button size="sm" variant="utility" className="shrink-0 whitespace-nowrap" onClick={() => setRefWikiPath("")}>
                ← 목록
              </Button>
              <Button size="sm" variant="utility" className="shrink-0 whitespace-nowrap" onClick={() => onOpenWiki(targetSpace, refWiki.path)}>
                열기
              </Button>
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {refWiki ? (
          <>
            <h2 className="mb-3 text-[17px] font-bold text-ink">{refWiki.title}</h2>
            <Markdown source={refWiki.markdown} embedSpace={targetSpace} />
          </>
        ) : listWikis.length ? (
          <>
            <p className="ds-eyebrow mb-2 text-ink-faint">{jobWikiPaths.length ? "이 노트의 개념" : "이 공간의 개념"}</p>
            <ul className="space-y-0.5">
              {listWikis.map((w) => (
                <li key={w.path}>
                  <button
                    type="button"
                    onClick={() => setRefWikiPath(w.path)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[14px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
                  >
                    <span className="truncate font-medium">{w.title}</span>
                    <Icons.ChevronRightIcon size={14} className="shrink-0 text-ink-faint" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="pt-8 text-center text-[14px] text-ink-muted">
            저장 + AI 정리하면
            <br />
            이 노트의 위키가 여기 나타나요.
          </p>
        )}
      </div>
    </section>
  );
```

(e) 이제 안 쓰는 `PaneSelect` 컴포넌트(파일 하단, "value=\"\" 일 때 placeholder…" 주석부터 함수 끝까지) 삭제 — 이 변경으로 고아가 됐다.

- [ ] **Step 3: 타입·테스트 확인**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 0, 전체 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/store/importStore.ts src/app/panes/InboxSection.tsx
git commit -m "feat(inbox): 위키 패널 개념 목록 + 본문 키워드 클릭→위키 열람

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 제목 모달 + 원샷 자동 파이프라인

**Files:**
- Modify: `src/app/panes/InboxSection.tsx`

**Interfaces:**
- Consumes: Task 4의 `runSummary → PdfSummaryStatus|null`, Task 5의 `wikiPaths`
- Produces: 사용자 플로우 — PDF 드롭 → 제목 모달 → (자동) 추출·요약·저장·위키·패널 오픈

- [ ] **Step 1: ref·모달 상태 추가**

`InboxSection.tsx` 의 `const [uploadOpen, setUploadOpen] = useState(false);` 아래에:

```tsx
  // ── PDF 원샷 파이프라인 (스펙 §1) ──
  // 제목 모달 — PDF 드롭 시 노트 이름부터 받는다(자동 저장의 제목). 취소하면 업로드 자체를 안 한다.
  const [pendingPdf, setPendingPdf] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  // 자동 트리거는 렌더 사이 마이크로태스크에서 발화한다 — 최신 클로저·마운트 여부를 ref 로 본다.
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false; // 탭 이탈 시 자동 저장 중단(스펙 §1 MVP 한계 — 요약 병합은 스토어가 계속한다)
  }, []);
  const withLlmRef = useRef(true);
  const runRef = useRef<() => Promise<void>>(async () => {});
```

그리고 기존 `const [withLlm, setWithLlm] = useState(true);` 바로 아래에:

```tsx
  withLlmRef.current = withLlm;
```

- [ ] **Step 2: `togglePanel` fresh-read 로 교체**

기존:

```tsx
  const togglePanel = (key: InboxPanelKey, open?: boolean) => write({ panels: { ...panels, [key]: open ?? !panels[key] } });
```

교체 (자동 경로는 렌더 클로저 panels 가 한 렌더 뒤질 수 있다):

```tsx
  const togglePanel = (key: InboxPanelKey, open?: boolean) => {
    const cur = ds.getState().drafts[draftKey]?.panels ?? EMPTY_DRAFT.panels;
    write({ panels: { ...cur, [key]: open ?? !cur[key] } });
  };
```

- [ ] **Step 3: `importPdf` 의 요약 fire-and-forget 을 자동 체인으로 교체**

기존 (`void ds.getState().runSummary({ noteKey: draftKey, file: stored, title: noteTitle, text });`) 을 교체:

```tsx
        const summaryDone = ds.getState().runSummary({ noteKey: draftKey, file: stored, title: noteTitle, text });
        // 원샷 파이프라인(스펙 §1) — 요약이 정상 종결(done)했고 이 탭이 살아 있을 때만 자동 저장+위키.
        // cancelled/failed 는 부분 텍스트만 남기고 수동 저장 폴백. 탭 이탈 시(unmount) 트리거 중단.
        void summaryDone.then((outcome) => {
          if (outcome !== "done" || !mountedRef.current) return;
          void runRef.current();
        });
```

- [ ] **Step 4: `run` 을 fresh-read 버전으로 교체 + `runRef` 대입**

기존 `const run = async () => { ... };` 전체를 교체:

```tsx
  const run = async () => {
    // 클로저가 아니라 스토어에서 지금 값을 읽는다 — 자동 트리거(.then)는 요약 병합 set 직후의
    // 마이크로태스크라, 렌더 클로저 스냅샷(body 에 요약 미병합)이 한 렌더 뒤질 수 있다.
    const d = { ...EMPTY_DRAFT, ...ds.getState().drafts[draftKey] };
    const curTitle = d.title.trim();
    const curSpace = d.targetSpace || space;
    const importJob = useImportStore.getState().job;
    const importBusy = !!importJob && !["completed", "failed"].includes(importJob.status);
    const summaryStreaming = ds.getState().job?.status === "streaming";
    const pdfWorking = (ds.getState().pdfJobs[draftKey] ?? 0) > 0;
    // pdfBusy/summarizing 게이트: 요약 완료 전 저장하면 아카이브에 PDF 요약이 빠진 채 저장되고
    // 뒤늦은 요약이 비워진 에디터에 고아로 삽입된다.
    if (!curTitle || importBusy || pdfWorking || summaryStreaming) return;
    const t = resolveTarget(curSpace);
    // 재저장(saveNote)은 savedFile 이 그 공간에 있을 때만 — 대상 공간을 바꿨으면 새 노트로(다른 공간 노트 덮어쓰기 방지).
    const reuse = d.savedFile && d.savedSpace === curSpace ? d.savedFile : undefined;
    const res = await runImport({
      space: curSpace,
      spaceId: t.spaceId,
      title: curTitle,
      markdown: d.body,
      subjectIds: t.subjectIds,
      withLlm: withLlmRef.current,
      existing: t.existing,
      crossConcepts: t.crossConcepts,
      noteFile: reuse,
      feynmanNoteId: draftNoteId(draftKey),
    });
    // 생성/갱신된 노트에 바인딩(살아있는 노트) — 노트를 비우지 않고 이어서 필기.
    if (res.noteFile) write({ savedFile: res.noteFile, savedSpace: curSpace });
    if (res.status === "completed") {
      write({ savedSnapshot: `${curTitle} ${d.body}` });
      await onRefresh(curSpace);
      onNotice?.(
        res.feynmanUsed
          ? "파인만에서 쓴 설명까지 위키에 반영됐어요 ✓ — 이어서 필기하세요"
          : withLlmRef.current
            ? "위키에 반영됐어요 ✓ — 이어서 필기하세요"
            : "저장됐어요 ✓ — 이어서 필기하세요",
      );
      // 방금 만든 위키가 있으면 위키 패널을 개념 "목록"부터 연다(스펙 §3 — 전부 보이게).
      if (withLlmRef.current && (res.wikiPaths?.length || res.firstWikiPath)) {
        setRefWikiPath("");
        togglePanel("wiki", true);
      }
    } else if (res.status === "failed") {
      onNotice?.(`저장 실패: ${res.errorMessage ?? "알 수 없는 오류"}`);
    }
  };
  runRef.current = run; // 자동 트리거(importPdf 의 .then)가 최신 클로저를 부른다
```

- [ ] **Step 5: `onFiles` PDF 분기를 모달 오픈으로 교체**

기존:

```tsx
    if (pdfs.length > 1) onNotice?.("노트 하나에 PDF 하나예요 — 첫 파일만 올렸어요");
    void importPdf(pdfs[0]);
```

교체:

```tsx
    if (pdfs.length > 1) onNotice?.("노트 하나에 PDF 하나예요 — 첫 파일만 올렸어요");
    // 업로드 전에 노트 이름부터 — 자동 저장(원샷 파이프라인)의 제목이 된다(스펙 §1).
    setPdfTitle(ds.getState().drafts[draftKey]?.title || pdfs[0].name.replace(/\.[^.]+$/, ""));
    setPendingPdf(pdfs[0]);
```

그리고 `onFiles` 아래에 confirm 핸들러 추가:

```tsx
  const confirmPdfImport = () => {
    const f = pendingPdf;
    const name = pdfTitle.trim();
    if (!f || !name) return;
    setPendingPdf(null);
    setTitle(name);
    void importPdf(f);
  };
```

- [ ] **Step 6: 제목 모달 JSX 추가**

return 문 안, 업로드 팝업(`{uploadOpen && (...)}`) 바로 위에:

```tsx
      {/* PDF 노트 이름 모달 — 확인하면 업로드→추출→요약→자동 저장+위키까지 원샷(스펙 §1) */}
      {pendingPdf && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-surface/60 backdrop-blur-md pt-[16vh]" onClick={() => setPendingPdf(null)}>
          <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface p-4 shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-semibold text-ink">노트 이름</p>
            <p className="mt-1 text-[13px] text-ink-muted">이 PDF로 만들 노트의 이름이에요 — 요약과 위키까지 자동으로 만들어요.</p>
            <input
              autoFocus
              value={pdfTitle}
              onChange={(e) => setPdfTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmPdfImport();
                if (e.key === "Escape") setPendingPdf(null);
              }}
              aria-label="노트 이름"
              className="mt-3 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-primary"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="utility" onClick={() => setPendingPdf(null)}>
                취소
              </Button>
              <Button size="sm" variant="primary" disabled={!pdfTitle.trim()} onClick={confirmPdfImport}>
                가져오기
              </Button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 7: 타입·테스트 확인 + 커밋**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 0, 전체 PASS

```bash
git add src/app/panes/InboxSection.tsx
git commit -m "feat(inbox): PDF 원샷 파이프라인 — 제목 모달 → 요약 → 자동 저장+위키

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: DocView 읽기·편집 모드 키워드 배선

**Files:**
- Modify: `src/app/panes/DocView.tsx`
- Modify: `src/app/PiecePoolApp.tsx`

**Interfaces:**
- Consumes: Task 2 `Markdown.terms`, Task 3 `SlashBlockEditor.wikiTerms/onWikiTerm`
- Produces: `DocView.terms?: string[]` — 클릭은 기존 `onLink(제목)` → `resolveLink` (제목→위키 열기, PiecePoolApp:717-724 기존 로직 그대로)

- [ ] **Step 1: DocView 에 terms prop 추가**

`src/app/panes/DocView.tsx` 수정 4곳:

(a) import 에 `useMemo` 가 이미 있는지 확인 — 없으면 `useState` import 줄에 추가. 그리고 destructure 목록 `feynman,` 뒤에 `terms,` 추가. 타입 블록 `embedSpace?: string;` 근처에:

```tsx
  /** 본문 속 개념 키워드 강조 — 이 공간 위키 제목 목록. 클릭 시 onLink(제목) */
  terms?: string[];
```

(b) 컴포넌트 본문 상단(readBody 정의 위)에 자기 제목 제외 필터:

```tsx
  // 자기 자신 링크 방지 — 위키 문서 안에서 그 문서 제목은 강조하지 않는다.
  const termsKey = terms?.join("\n") ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const docTerms = useMemo(() => terms?.filter((t) => t !== title), [termsKey, title]);
```

(c) 읽기 모드 `readBody` 의 `<Markdown ... />` 에 `terms={docTerms}` 추가. 편집 모드 미리보기 `<Markdown source={draft} ... />` 에도 `terms={docTerms}` 추가.

(d) 편집 모드 `<SlashBlockEditor ... placeholder="'/' 로 블록 · ⌘Enter 로 저장" />` 에 추가:

```tsx
            wikiTerms={docTerms}
            onWikiTerm={onLink}
```

- [ ] **Step 2: PiecePoolApp 에서 terms 공급**

`src/app/PiecePoolApp.tsx` 수정 3곳:

(a) `wikiBySlug` state 선언(67행 부근) 아래에 memo 추가 (`useMemo` import 확인 — 없으면 추가, `isSynthesisPage` 는 이미 import 됨):

```tsx
  // 본문 키워드 강조용 위키 제목 — 공간별로 안정 참조(내용 변경 때만 새 배열, remark 파이프라인 재실행 방지)
  const termsBySlug = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(wikiBySlug).map(([s, pages]) => [s, (pages ?? []).filter((p) => !isSynthesisPage(p)).map((p) => p.title)]),
      ) as Record<string, string[]>,
    [wikiBySlug],
  );
```

(b) 위키 리더 DocView(1048행 부근 `<DocView`)에 prop 추가:

```tsx
        terms={termsBySlug[space]}
```

(c) 원본 리더 DocView(1149행 부근 `<DocView`)에도 동일하게:

```tsx
        terms={termsBySlug[space]}
```

- [ ] **Step 3: 타입·테스트 확인 + 커밋**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 0, 전체 PASS

```bash
git add src/app/panes/DocView.tsx src/app/PiecePoolApp.tsx
git commit -m "feat(wiki-terms): DocView 읽기·편집 모드 본문 키워드 → 위키 이동

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 마무리 — 검증 · journey · PR 준비

**Files:**
- Modify: `docs/00-overview/journey.md`

- [ ] **Step 1: 전체 검증**

Run: `npm run check && npm test`
Expected: tsc 에러 0 · 전체 테스트 PASS

- [ ] **Step 2: journey.md 타임라인 행 추가**

`docs/00-overview/journey.md` §2 타임라인 표 마지막 행 뒤에:

```markdown
| 07-16 | **PDF 원샷 파이프라인 + 본문 키워드→위키** ([설계](../superpowers/specs/2026-07-16-pdf-auto-pipeline-wiki-terms-design.md)) — PDF 를 올리면 노트 이름 하나 묻고, 요약 스트리밍이 끝나는 순간 저장→위키 생성까지 자동으로 이어진다(클릭 0회, 기존 로딩 오버레이 체인 재사용). 위키 패널은 드롭다운 대신 이번 노트의 개념 목록이 기본 화면. 본문 속 개념 키워드는 표시 계층에서만 은은히 강조되어(원문 비파괴) 클릭하면 그 위키가 옆에 열린다 — 에디터(CM6 데코)·읽기 모드(remark) 공용 매처 | 교재 PDF 하나가 "요약 노트 + 개념 위키 + 본문 속 하이퍼링크"로 바뀌는 데 필요한 사용자 행동이 이름 입력 하나로 줄었다 — 필기가 곧 위키로 통하는 문이 되고, 학생은 정리가 아니라 이해에 시간을 쓴다 |
```

- [ ] **Step 3: 수동 E2E 체크리스트 (스펙 §테스트 — 사용자와 함께)**

`npm run tauri dev` 로 앱 실행 후:

1. Gemini 키 설정된 상태에서 Inbox 에 PDF 드롭 → **노트 이름 모달**(기본값=파일명) 확인
2. 확인 → PDF 패널 자동 오픈 + "PDF 저장·텍스트 추출 중…" 오버레이 → 요약 스트리밍
3. 요약 완료 직후 **자동으로** 저장 오버레이(원본 저장→AI 위키 생성→위키 저장 체크리스트) 진행
4. completed → 위키 패널 자동 오픈, **"이 노트의 개념" 목록** 전부 표시
5. 본문 속 개념 키워드에 은은한 강조 → 클릭 → 해당 위키 열람 뷰 · "← 목록" 동작
6. DocView(사이드바에서 원본/위키 열기) 읽기·편집 모드에서도 키워드 강조·클릭 → 위키 탭 열림
7. 실패 경로: 요약 중 "중단" → 자동 저장 안 됨(부분 텍스트 유지) · 키 없는 상태 드롭 → 기존 안내만
8. 회귀: 텍스트/이미지 노트 "저장 + AI 정리" 버튼 플로우 정상

- [ ] **Step 4: 커밋 + PR 준비**

```bash
git add docs/00-overview/journey.md
git commit -m "docs(journey): 07-16 PDF 원샷 파이프라인 + 본문 키워드→위키

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin worktree-feat-pdf-wiki-terms
```

PR 본문에 **Before / After 섹션** 포함, 사용자에게 스크린샷 첨부 요청(에이전트는 앱 캡처 불가). base=main. `feat+loading-quotes` 브랜치가 먼저 머지되면 `InboxSection.tsx` 충돌 여부 확인 후 rebase.

## Self-Review 체크 결과

- 스펙 §1(모달·자동 체인·폴백) → Task 6 / §2(로딩 재사용) → Task 6(신규 UI 없음, 기존 오버레이 자동 표출) / §3(목록·wikiPaths·드롭다운 제거) → Task 5 / §4(매처·에디터·읽기 모드·클릭) → Task 1·2·3·5·7 / §5(에러) → Task 4·6 분기 / 테스트 → Task 1~4 + Task 8 E2E. 갭 없음.
- placeholder 없음 — 전 스텝 실코드.
- 타입 일관성: `wikiTerms?: string[]`/`onWikiTerm?: (title: string) => void`(Task 3 = Task 5·7 사용처), `runSummary → Promise<PdfSummaryStatus | null>`(Task 4 = Task 6 사용처), `wikiPaths?: string[]`(Task 5 = Task 6 사용처) 일치 확인.
