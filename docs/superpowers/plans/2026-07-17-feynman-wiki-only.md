# 파인만 위키 전용 이전 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파인만을 사용자 노트에서 완전히 떼어내고, LLM이 생성한 위키 페이지에만 적용한다. 기록은 위키 `.md` 본문의 `## 파인만 기록` 섹션에 남아 나중에 복기된다.

**Architecture:** 새 순수 모듈 `feynmanSection.ts` 가 본문 ↔ 기록 분리/합성을 전담한다. 기록은 본문에 살므로 본문을 만지는 모든 경로(LLM 병합·정리글·표시·편집·probe 입력)에서 strip 해야 한다 — 이게 이 작업의 급소다. 저장은 기존 `ipc.saveWiki` 를 그대로 타므로 Rust·계약 변경이 없다.

**Tech Stack:** React + zustand(persist) + vitest + Playwright(e2e). Tauri IPC. Gemini(OpenAI 호환).

**설계 문서:** [docs/superpowers/specs/2026-07-17-feynman-wiki-only-design.md](../specs/2026-07-17-feynman-wiki-only-design.md) — 결정의 근거는 전부 여기 있다. 왜 frontmatter 가 아닌지, 왜 `updatedAt` 이 아닌지 의문이 들면 스펙을 먼저 읽어라.

## Global Constraints

- **브랜치**: `feat/feynman-wiki-only` (origin/main `e21cdc0` 기준). `main` 직접 push 금지 — PR 필수.
- **계약 변경 0.** `docs/10-contracts/` 를 건드리면 안 된다. `src-tauri/` 도 건드리지 않는다. 이 두 개를 건드려야 할 것 같으면 설계가 틀린 것이니 멈추고 보고하라.
- **스테이징은 경로 명시.** `git add -A` 금지. 작업 트리에 무관한 사용자 변경(`src/store/inboxDraftStore.ts`, `test-pdfs/`)이 있다 — 절대 커밋하지 마라.
- **테스트**: `npx vitest run <path>` (단일 파일), `npm test` (전체). e2e: `npx playwright test <path>`.
- **주석**: 본문 한국어, 식별자·타입 영어. 기존 파일의 주석 밀도·문체에 맞춘다.
- **`unwrap()`/`panic!()` 금지** — 해당 없음(Rust 변경 없음).
- **사용자 데이터를 조용히 삭제하지 마라.** 파싱 실패 시 원문 보존이 기본이다.
- 판정 어휘는 사용자 선언형이다: "아직 모르겠다고 **표시하셨어요**". AI 판정형("설명이 충분하지 않습니다") 금지.

## 일부러 안 하는 것 — 손대면 리뷰에서 되돌린다

- **⌘K 검색(`PiecePoolApp.tsx:830` → `SearchPalette`)은 그대로 둔다.** 위키 본문 통째를 문자열 매치하므로 파인만 발화도 검색된다. 이건 **의도된 것**이다 — 자기가 쓴 설명을 검색으로 되찾는 게 복기 목적에 부합한다. strip 지점처럼 보이지만 아니다. 코드 변경 0.
- **`src/llm/feynman.ts` 는 건드리지 않는다.** 위키를 모르는 순수 LLM 어댑터다. strip 은 호출부(`feynmanStore`)에서 한다. 테스트 13개도 하나도 안 깨진다.
- **`e2e/feynman.spec.ts` 삭제 금지.** 이름만 feynman 이고 실제로는 `review_needed` 테스트다.
- **`provider.ts:16` `features.clarify` 는 그대로 둔다.** 완전 데드코드지만 지우려면 docs SSOT 를 같이 고쳐야 해서 범위 밖이다.
- **`review_needed` 연동을 만들지 마라.** `graph.rs:305` 에 파인만을 기다리는 문구가 있지만 별도 PR 이다.
- **게이트를 만들지 마라.** "이해할 때까지 잠금" 은 범위 밖이다. 기록이 목적이지 통제가 아니다.

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/lib/feynmanSection.ts` (신규) | 본문 ↔ 기록 섹션 분리/합성/해시. 순수 함수만, IPC·store 의존 0 | 1 |
| `src/lib/noteSections.ts` | `scanHeadings` export 승격(1) → 노트 주제 분할 함수 제거, 위키 표시 전처리 모듈로 축소(5) | 1, 5 |
| `src/lib/llmApply.ts` | 병합·정리글 경로에서 기록을 코드로 보존 | 2 |
| `src/app/panes/useFeynmanEditor.tsx` | **삭제** | 3 |
| `src/lib/cmHeadingAction.ts` | **삭제** | 3 |
| `src/app/panes/FeynmanPanel.tsx` | **삭제**(3) → 위키용 신규 작성(6) | 3, 6 |
| `src/store/importStore.ts` | 파인만 → 위키 생성 재료 배선 제거 | 4 |
| `src/store/feynmanStore.ts` | 다중주제·statuses·adopt 제거 → 단일 위키 페이지 세션 + `dismissed` | 5 |
| `src/app/PiecePoolApp.tsx` | `wikiReader` 에 패널 배선 + 자동 열기(7), 편집 모드 숨김/재부착(8) | 3, 7, 8 |
| `src/app/panes/DocView.tsx` | `feynman` prop 제거(3), 표시 strip(7) | 3, 7 |
| `src/app/panes/InboxSection.tsx` | 파인만 pill·진입점 제거(3), 참조 패널 strip(7) | 3, 7 |

---

### Task 1: `feynmanSection.ts` — 본문 ↔ 기록 분리 (순수 함수)

이 태스크가 나머지 전부의 토대다. 다른 파일은 안 건드린다(`noteSections.ts` 의 export 승격 제외).

**Files:**
- Create: `src/lib/feynmanSection.ts`
- Create: `src/lib/feynmanSection.test.ts`
- Modify: `src/lib/noteSections.ts:58` (`function scanHeadings` → `export function scanHeadings`), `:83` (`function sectionEnd` → `export function sectionEnd`)

**Interfaces:**
- Consumes: `scanHeadings(md: string): Heading[]` · `sectionEnd(headings: Heading[], i: number, len: number): number` — `noteSections.ts` 에서 export 승격해 가져온다. **복붙 금지** — 펜스 토글 로직(`noteSections.ts:66`)이 이미 검증돼 있고 두 벌이 되면 갈라진다.
- Produces: 아래 5개. Task 2·5·6·7·8 이 전부 이걸 쓴다.
  - `interface FeynmanTurn { role: "user" | "probe"; text: string }`
  - `interface FeynmanSession { at: string; verdict: "understood" | "not_yet"; bodyHash: string; turns: FeynmanTurn[] }`
  - `splitFeynmanSection(md: string): { body: string; sessions: FeynmanSession[]; unparsed: string[] }`
  - `joinFeynmanSection(body: string, sessions: FeynmanSession[], unparsed?: string[]): string`
  - `stripFeynmanSection(md: string): string`
  - `bodyHash(md: string): string`

- [ ] **Step 1: `noteSections.ts` 의 두 함수를 export 로 승격**

`src/lib/noteSections.ts:57-58` 을 이렇게 바꾼다 (주석 유지):

```ts
/** 문서의 모든 ATX 헤딩. 코드 펜스 안의 `#` 는 헤딩이 아니다. Setext(`===`)는 비지원. */
export function scanHeadings(md: string): Heading[] {
```

`src/lib/noteSections.ts:82-83`:

```ts
/** 헤딩 h 의 섹션 끝 = level ≤ h.level 인 다음 헤딩의 시작. 없으면 EOF. */
export function sectionEnd(headings: Heading[], i: number, len: number): number {
```

`interface Heading`(`:33`)도 export 한다 — `feynmanSection.ts` 가 반환 타입을 받으려면 필요하다:

```ts
export interface Heading {
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

Create `src/lib/feynmanSection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitFeynmanSection, joinFeynmanSection, stripFeynmanSection, bodyHash, type FeynmanSession } from "./feynmanSection";

const S = (over: Partial<FeynmanSession> = {}): FeynmanSession => ({
  at: "2026-07-16T12:03:11.123Z",
  verdict: "understood",
  bodyHash: "a1b2c3d4",
  turns: [
    { role: "user", text: "스레드는 메모리를 공유하는 실행 단위예요" },
    { role: "probe", text: "스택도 공유되나요?" },
  ],
  ...over,
});

const BODY = "# 스레드\n\n프로세스 안의 실행 단위.";

describe("splitFeynmanSection", () => {
  it("기록이 없으면 본문 그대로, 세션 0개", () => {
    expect(splitFeynmanSection(BODY)).toEqual({ body: BODY, sessions: [] });
  });

  it("라운드트립 — join 한 것을 split 하면 원래대로", () => {
    const sessions = [S()];
    const md = joinFeynmanSection(BODY, sessions);
    const back = splitFeynmanSection(md);
    expect(back.body).toBe(BODY);
    expect(back.sessions).toEqual(sessions);
  });

  it("세션 여러 개 — 순서 보존", () => {
    const sessions = [S({ at: "2026-07-16T12:00:00.000Z" }), S({ at: "2026-04-02T09:11:02.000Z", verdict: "not_yet" })];
    expect(splitFeynmanSection(joinFeynmanSection(BODY, sessions)).sessions).toEqual(sessions);
  });

  it("sessions 가 비면 섹션을 만들지 않는다", () => {
    expect(joinFeynmanSection(BODY, [])).toBe(BODY);
  });
});

describe("적대적 입력 — 사용자 발화가 포맷을 위조할 수 없다", () => {
  const rt = (text: string) => {
    const sessions = [S({ turns: [{ role: "user", text }] })];
    return splitFeynmanSection(joinFeynmanSection(BODY, sessions)).sessions[0].turns[0].text;
  };

  it("화자 마커를 발화에 써도 경계가 안 깨진다", () => {
    expect(rt("**나:** 안녕")).toBe("**나:** 안녕");
    expect(rt("**되묻기:** 가짜")).toBe("**되묻기:** 가짜");
  });

  it("세션 헤더를 발화에 써도 위조가 안 된다", () => {
    expect(rt("### 2026-01-01T00:00:00.000Z · 이해함 · deadbeef")).toBe("### 2026-01-01T00:00:00.000Z · 이해함 · deadbeef");
  });

  it("섹션 헤딩을 발화에 써도 위조가 안 된다", () => {
    expect(rt("## 파인만 기록")).toBe("## 파인만 기록");
  });

  it("인용문은 한 단계만 벗긴다", () => {
    expect(rt("> 교수님 말씀")).toBe("> 교수님 말씀");
    expect(rt(">> 이중 인용")).toBe(">> 이중 인용");
  });

  it("발화 내부 빈 줄이 발화 경계와 구분된다", () => {
    expect(rt("첫 문단\n\n둘째 문단")).toBe("첫 문단\n\n둘째 문단");
  });

  it("발화 내부 빈 줄이 두 발화로 쪼개지지 않는다", () => {
    const sessions = [S({ turns: [{ role: "user", text: "A\n\nB" }] })];
    expect(splitFeynmanSection(joinFeynmanSection(BODY, sessions)).sessions[0].turns).toHaveLength(1);
  });

  it("빈 줄 표기에 후행 공백을 쓰지 않는다 — 포매터가 지워도 안전", () => {
    const md = joinFeynmanSection(BODY, [S({ turns: [{ role: "user", text: "A\n\nB" }] })]);
    expect(md.split("\n").some((l) => l !== l.trimEnd())).toBe(false);
  });
});

describe("stripFeynmanSection", () => {
  it("본문 코드펜스 안의 `## 파인만 기록` 에 속지 않는다", () => {
    const md = "# 개념\n\n```md\n## 파인만 기록\n예시입니다\n```\n\n## 진짜 본문\n소중한 내용";
    expect(stripFeynmanSection(md)).toBe(md);
  });

  it("기록만 걷어내고 본문은 온전하다", () => {
    const md = joinFeynmanSection(BODY, [S()]);
    expect(stripFeynmanSection(md)).toBe(BODY);
  });

  it("기록 뒤에 다른 섹션이 있어도 그건 남긴다", () => {
    const body = `${BODY}\n\n## 근거\n\n![[a.pdf]]`;
    expect(stripFeynmanSection(joinFeynmanSection(body, [S()]))).toBe(body);
  });

  it("CRLF 본문에서도 동작한다", () => {
    const md = joinFeynmanSection(BODY, [S()]).replace(/\n/g, "\r\n");
    expect(stripFeynmanSection(md).replace(/\r\n/g, "\n")).toBe(BODY);
  });
});

describe("fail-closed — 파싱 못 한 기록을 조용히 삭제하지 않는다", () => {
  // 복기가 이 기능의 존재 이유다. at/verdict 를 못 읽는 것과 사용자 발화를 잃는 것은 전혀 다른 문제다.
  it("헤더가 망가져도 본문은 보존하고, 그 블록 원문을 unparsed 로 돌려준다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 이건 헤더가 아니다\n\n> 소중한 발화\n`;
    const { body, sessions, unparsed } = splitFeynmanSection(md);
    expect(body).toBe(BODY);
    expect(sessions).toEqual([]);
    expect(unparsed.join("\n")).toContain("소중한 발화");
    expect(unparsed.join("\n")).toContain("### 이건 헤더가 아니다");
  });

  it("판정 문자열이 미상이면 그 세션을 unparsed 로 넘긴다 — 발화를 버리지 않는다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 2026-07-16T12:00:00.000Z · 몰?루 · abc12345\n\n**나:**\n\n> 소중한 발화\n`;
    const { sessions, unparsed } = splitFeynmanSection(md);
    expect(sessions).toEqual([]);
    expect(unparsed.join("\n")).toContain("소중한 발화");
  });

  it("깨진 블록이 읽기→쓰기 사이클에서 살아남는다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 이건 헤더가 아니다\n\n> 소중한 발화\n`;
    const { body, sessions, unparsed } = splitFeynmanSection(md);
    const out = joinFeynmanSection(body, sessions, unparsed);
    expect(out).toContain("소중한 발화");
    // 다시 읽어도 여전히 살아 있다 — 사이클을 반복해도 증발하지 않는다
    expect(splitFeynmanSection(out).unparsed.join("\n")).toContain("소중한 발화");
  });

  it("성한 세션과 깨진 블록이 섞여 있으면 둘 다 살린다", () => {
    const md = joinFeynmanSection(BODY, [S()]) + "\n\n### 깨진 헤더\n\n> 잃으면 안 되는 말\n";
    const { sessions, unparsed } = splitFeynmanSection(md);
    expect(sessions).toHaveLength(1);
    expect(unparsed.join("\n")).toContain("잃으면 안 되는 말");
  });

  it("unparsed 가 비면 섹션 모양이 그대로다 — 정상 경로에 흔적을 안 남긴다", () => {
    expect(joinFeynmanSection(BODY, [S()], [])).toBe(joinFeynmanSection(BODY, [S()]));
  });
});

describe("bodyHash", () => {
  it("세션 append 가 해시를 바꾸지 않는다 — 자기 자극 없음", () => {
    const h0 = bodyHash(BODY);
    expect(bodyHash(joinFeynmanSection(BODY, [S()]))).toBe(h0);
    expect(bodyHash(joinFeynmanSection(BODY, [S(), S({ at: "2026-01-01T00:00:00.000Z" })]))).toBe(h0);
  });

  it("본문이 바뀌면 해시가 바뀐다", () => {
    expect(bodyHash(`${BODY} 추가`)).not.toBe(bodyHash(BODY));
  });

  it("CRLF/LF 차이가 해시를 바꾸지 않는다", () => {
    expect(bodyHash(BODY.replace(/\n/g, "\r\n"))).toBe(bodyHash(BODY));
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/lib/feynmanSection.test.ts`
Expected: FAIL — `Failed to resolve import "./feynmanSection"`

- [ ] **Step 4: 구현한다**

Create `src/lib/feynmanSection.ts`:

```ts
import { scanHeadings, sectionEnd } from "./noteSections";

// ══ 위키 본문의 `## 파인만 기록` 섹션 — 학습자가 그 개념을 자기 말로 설명한 기록 ══
//
// 위키 개념은 학습자가 만든 것이 아니다. 그래서 "이해했다"고 선언한 시점의 사고 과정을
// 개념과 같은 파일에 남긴다 — 나중에 복기할 때 그때의 자신을 다시 만나기 위해.
//
// frontmatter 가 아니라 본문인 이유: 자체 YAML 파서(storage/frontmatter.rs)가 개행·따옴표를
// 못 버틴다(yq 는 개행 미이스케이프, unquote 는 언이스케이프 미구현). 본문 섹션은 `## 근거`
// 선례가 있고 계약 변경이 필요 없다.
//
// 화자 마커(`**나:**`)를 인용 **밖**에 두는 것이 이 포맷의 핵심이다. 발화의 모든 줄에 `> ` 가
// 붙으므로 사용자는 인용 안 붙은 줄을 만들 수 없다 → 화자 경계가 위조 불가능하고 이스케이프가
// 통째로 불필요해진다.

export interface FeynmanTurn {
  role: "user" | "probe";
  text: string;
}

export interface FeynmanSession {
  /** ISO 8601. 표시 전용 — 문서 변경 판정에는 쓰지 않는다(bodyHash 가 한다). */
  at: string;
  /** 판정은 오직 사용자. LLM 은 채점하지 않는다. */
  verdict: "understood" | "not_yet";
  /** 설명 시점의 기록 제외 본문 해시. 현재 본문과 다르면 "이후 문서 바뀜". */
  bodyHash: string;
  turns: FeynmanTurn[];
}

const SECTION_TITLE = "파인만 기록";
const VERDICT_TO_LABEL: Record<FeynmanSession["verdict"], string> = { understood: "이해함", not_yet: "아직 모름" };
const LABEL_TO_VERDICT: Record<string, FeynmanSession["verdict"]> = { 이해함: "understood", "아직 모름": "not_yet" };
const ROLE_TO_LABEL: Record<FeynmanTurn["role"], string> = { user: "나", probe: "되묻기" };
const LABEL_TO_ROLE: Record<string, FeynmanTurn["role"]> = { 나: "user", 되묻기: "probe" };

const ROLE_LINE = /^\*\*(.+?):\*\*$/;
const SESSION_LINE = /^### (.+)$/;

const dropCr = (line: string) => (line.endsWith("\r") ? line.slice(0, -1) : line);

/** 기록 섹션의 [시작, 끝) 오프셋. 없으면 null. 코드펜스 안의 헤딩은 scanHeadings 가 이미 거른다. */
function locate(md: string): [number, number] | null {
  const headings = scanHeadings(md);
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].level === 2 && headings[i].title === SECTION_TITLE) {
      return [headings[i].from, sectionEnd(headings, i, md.length)];
    }
  }
  return null;
}

/** 세션 블록 하나(헤더 줄 제외한 본문)의 발화들. */
function parseTurns(lines: string[]): FeynmanTurn[] {
  const turns: FeynmanTurn[] = [];
  let role: FeynmanTurn["role"] | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (role) turns.push({ role, text: buf.join("\n") });
    buf = [];
  };
  for (const raw of lines) {
    const line = dropCr(raw);
    // 인용 안 붙은 줄만 화자 마커가 될 수 있다 — 사용자 발화는 전부 `>` 로 시작하므로 위조 불가.
    const m = !line.startsWith(">") && ROLE_LINE.exec(line);
    if (m && LABEL_TO_ROLE[m[1]]) {
      flush();
      role = LABEL_TO_ROLE[m[1]];
      continue;
    }
    if (!role) continue; // 첫 화자 마커 이전의 잡음
    if (line.startsWith(">")) buf.push(line.replace(/^> ?/, ""));
    // 인용 아닌 줄(포매팅용 빈 줄)은 버린다. 발화 내부 빈 줄은 `>` 로 저장되므로 여기 안 걸린다.
  }
  flush();
  return turns;
}

/**
 * 본문과 기록을 분리한다. 기록이 없으면 { body: md, sessions: [], unparsed: [] }.
 *
 * 읽을 수 없는 세션 블록은 **버리지 않고** unparsed 에 원문 그대로 담는다. at/verdict 를
 * 못 읽는 것과 사용자 발화를 잃는 것은 전혀 다른 문제다 — 복기가 이 기능의 존재 이유인데,
 * md 를 앱 밖에서 손대다 헤더 한 줄이 깨졌다고 대화가 증발하면 안 된다.
 * joinFeynmanSection 이 그대로 되돌려 쓴다.
 */
export function splitFeynmanSection(md: string): { body: string; sessions: FeynmanSession[]; unparsed: string[] } {
  const at = locate(md);
  if (!at) return { body: md, sessions: [], unparsed: [] };
  const [from, to] = at;
  // CRLF: /\n+$/ 만 쓰면 잘린 자리가 `…\r\n\r\n` 일 때 \r 이 남는다.
  const body = (md.slice(0, from) + md.slice(to)).replace(/(\r?\n)+$/, "");
  const inner = md.slice(from, to).split("\n").slice(1); // `## 파인만 기록` 줄 제거

  const sessions: FeynmanSession[] = [];
  const unparsed: string[] = [];
  let header: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (header === null) {
      // 첫 세션 헤더 이전의 내용 — 우리가 쓴 적 없는 모양이지만 사용자 것일 수 있다.
      const stray = buf.join("\n").trim();
      if (stray) unparsed.push(stray);
      buf = [];
      return;
    }
    const parts = header.split(" · ").map((s) => s.trim());
    const verdict = LABEL_TO_VERDICT[parts[1] ?? ""];
    if (parts.length >= 2 && verdict) {
      sessions.push({ at: parts[0], verdict, bodyHash: parts[2] ?? "", turns: parseTurns(buf) });
    } else {
      // 헤더를 못 읽어도 발화는 사용자 것이다 — 글자 그대로 되돌려 쓴다.
      unparsed.push([`### ${header}`, ...buf].join("\n").trimEnd());
    }
    buf = [];
  };
  for (const raw of inner) {
    const line = dropCr(raw);
    const m = SESSION_LINE.exec(line);
    if (m) {
      flush();
      header = m[1];
      continue;
    }
    buf.push(raw);
  }
  flush();
  return { body, sessions, unparsed };
}

/** 본문 + 기록 → md. 쓸 게 하나도 없으면 섹션을 만들지 않는다. */
export function joinFeynmanSection(body: string, sessions: FeynmanSession[], unparsed: string[] = []): string {
  if (!sessions.length && !unparsed.length) return body;
  const out: string[] = [body.replace(/(\r?\n)+$/, ""), "", `## ${SECTION_TITLE}`, ""];
  for (const s of sessions) {
    out.push(`### ${s.at} · ${VERDICT_TO_LABEL[s.verdict]} · ${s.bodyHash}`, "");
    for (const t of s.turns) {
      out.push(`**${ROLE_TO_LABEL[t.role]}:**`, "");
      // 빈 줄은 `>` — 후행 공백을 쓰면 포매터가 지워 발화 경계와 구분이 사라진다.
      for (const line of t.text.split("\n")) out.push(line ? `> ${line}` : ">");
      out.push("");
    }
  }
  // 읽을 수 없는 블록은 섹션 끝에 원문 그대로. body 에 섞으면 개념 문서가 오염되고
  // LLM 병합 입력(llmApply)에도 들어간다 — 섹션 안에 머물러야 한다.
  for (const raw of unparsed) out.push(raw, "");
  return out.join("\n").replace(/\n+$/, "\n");
}

/** 표시·LLM 입력용 — 기록을 걷어낸 본문. */
export function stripFeynmanSection(md: string): string {
  return splitFeynmanSection(md).body;
}

/**
 * 기록 제외 본문의 해시(djb2, 8자). "이 설명 이후 문서 바뀜" 판정의 기준.
 *
 * updatedAt 을 쓰지 않는 이유: commands/wiki.rs:70 이 저장마다 무조건 updated_at 을 now 로
 * 덮으므로, 기록을 저장하는 행위 자체가 updatedAt 을 밀어 배지가 100% 오탐이 된다.
 * 해시는 기록을 걷어낸 뒤 계산하므로 세션 append 에 반응하지 않는다(자기 자극 없음).
 */
export function bodyHash(md: string): string {
  const b = stripFeynmanSection(md).replace(/\r\n/g, "\n");
  let h = 5381;
  for (let i = 0; i < b.length; i++) h = ((h << 5) + h + b.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/lib/feynmanSection.test.ts`
Expected: PASS — 전부 통과.

실패하면 **구현이 아니라 포맷 가정**을 의심하라. 특히 `splitFeynmanSection` 의 `body` 끝 개행 처리와 `joinFeynmanSection` 의 `body.replace(/\n+$/, "")` 가 라운드트립에서 맞물려야 한다.

- [ ] **Step 6: 기존 테스트가 안 깨지는지 확인한다**

Run: `npx vitest run src/lib/noteSections.test.ts`
Expected: PASS — export 승격은 동작을 안 바꾼다.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/feynmanSection.ts src/lib/feynmanSection.test.ts src/lib/noteSections.ts
git commit -m "feat(feynman): 위키 본문의 파인만 기록 섹션 분리/합성 모듈

화자 마커를 인용 밖에 두어 사용자 발화가 포맷을 위조할 수 없게 했다.
발화의 모든 줄이 '> ' 로 시작하므로 인용 안 붙은 줄은 우리만 만든다.

bodyHash 는 기록을 걷어낸 뒤 계산한다 — 세션 append 가 해시를 바꾸면
'이후 문서 바뀜' 배지가 자기 자신에 반응한다.

scanHeadings/sectionEnd 를 export 로 승격해 재사용한다. 복붙하면
펜스 토글 로직이 두 벌이 되어 갈라진다."
```

---

### Task 2: 병합·정리글 경로에서 기록 보존

**이 태스크가 이 작업의 급소다.** 안 하면 위키가 재생성될 때마다 사용자 기록이 LLM에게 통째로 전송되고, LLM이 다시 쓴 본문으로 조용히 사라진다. `src/llm/mergeWiki.ts:5-6` 주석이 그 한계를 이미 자백하고 있다 — *"사용자가 위키 편집기로 직접 쓴 문단을 건드리지 말라고 프롬프트로 지시하지만, 그것은 지시일 뿐 보장이 아니다."* 프롬프트로 못 막으니 코드로 막는다.

**Files:**
- Modify: `src/lib/llmApply.ts:87-115` (`synthesisPage`), `:171-180` (`mergeMarkdown`)
- Test: `src/lib/llmApply.test.ts` (기존 병합 describe 안에 추가)

**Interfaces:**
- Consumes: `splitFeynmanSection`, `joinFeynmanSection` (Task 1)
- Produces: 없음 — 기존 시그니처 불변.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/llmApply.test.ts` 에 새 describe 를 추가한다. 이 파일에 **이미 있는** 픽스처를 쓴다 — `existingPage()`(`:175` 부근, 기본 `markdown: "# 교착 상태\n\n1주차에 배운 내용"`) · `applyOnto(existing, title, subjectIds?, deps?)`(`:198`) · `NOTE`(`:77`) · `synthesisPage`. 새 픽스처 체계를 발명하지 마라.

파일 상단 import 에 추가:

```ts
import { joinFeynmanSection, splitFeynmanSection, type FeynmanSession } from "./feynmanSection";
```

`describe("applyLlmResult 병합 …")`(`:206`) 블록 **안**, 마지막 `it` 뒤에 추가:

```ts
  // ── 파인만 기록 보존 — LLM 이 본문을 다시 써도 코드가 지킨다 ──
  const FEYNMAN: FeynmanSession = {
    at: "2026-07-16T12:00:00.000Z",
    verdict: "understood",
    bodyHash: "a1b2c3d4",
    turns: [{ role: "user", text: "내가 쓴 설명" }],
  };
  const OLD_BODY = "# 교착 상태\n\n1주차에 배운 내용";
  const withRecord = () => existingPage({ markdown: joinFeynmanSection(OLD_BODY, [FEYNMAN]) });

  it("병합 후에도 파인만 기록이 글자 그대로 남는다", async () => {
    const applied = await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => "# 교착 상태\n\n통합된 새 본문",
    });
    const { body, sessions } = splitFeynmanSection(applied.pages[0].markdown);
    expect(sessions).toEqual([FEYNMAN]);
    expect(body).toBe("# 교착 상태\n\n통합된 새 본문");
  });

  it("LLM 에 넘기는 본문에 파인만 기록이 없다 — 답 유출·판정 누출 차단", async () => {
    let seen = "";
    await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async (existingMd) => {
        seen = existingMd;
        return "# 교착 상태\n\n통합된 새 본문";
      },
    });
    expect(seen).toBe(OLD_BODY); // 기록을 걷어낸 본문만 간다
    expect(seen).not.toContain("내가 쓴 설명");
    expect(seen).not.toContain("이해함");
  });

  it("mergeMarkdown 미주입 폴백 — 기록이 중복되지 않는다", async () => {
    const applied = await applyOnto([withRecord()], "교착 상태");
    expect(splitFeynmanSection(applied.pages[0].markdown).sessions).toHaveLength(1);
  });

  it("mergeMarkdown 실패 폴백 — 기록이 중복되지 않는다", async () => {
    const applied = await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => {
        throw new Error("[mergeWiki] HTTP 429");
      },
    });
    expect(splitFeynmanSection(applied.pages[0].markdown).sessions).toHaveLength(1);
  });

  it("LLM 이 `## 파인만 기록` 을 뱉어도 진짜 기록이 body 로 새지 않는다", async () => {
    // locate() 는 첫 헤딩을 잡는다 — 가짜가 앞서면 sectionEnd 가 진짜 헤딩을 경계로 삼아
    // 진짜 세션이 통째로 body 가 되고, 다음 병합 때 LLM 에 유출된다.
    const applied = await applyOnto([withRecord()], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => "# 교착 상태\n\n새 본문\n\n## 파인만 기록\n\n### LLM 이 지어낸 것\n\n> 창작",
    });
    const { body, sessions } = splitFeynmanSection(applied.pages[0].markdown);
    expect(sessions).toEqual([FEYNMAN]); // 진짜 기록 하나뿐
    expect(body).toBe("# 교착 상태\n\n새 본문"); // 가짜 섹션은 버려진다 — LLM 창작이지 사용자 것이 아니다
    expect(body).not.toContain("내가 쓴 설명");
  });

  it("unparsed(읽을 수 없는 블록)도 병합을 건너 살아남는다", async () => {
    const ex = existingPage({ markdown: `${joinFeynmanSection(OLD_BODY, [FEYNMAN])}\n\n### 깨진 헤더\n\n> 잃으면 안 되는 말\n` });
    const applied = await applyOnto([ex], "교착 상태", ["subj-os"], {
      mergeMarkdown: async () => "# 교착 상태\n\n새 본문",
    });
    expect(applied.pages[0].markdown).toContain("잃으면 안 되는 말");
  });
```

`describe("synthesisPage")`(`:89`) 블록 **안**에 추가:

```ts
  it("재변환해도 파인만 기록은 살아남는다 — 본문은 새 출력으로 갈아탄다", () => {
    const session: FeynmanSession = {
      at: "2026-07-16T12:00:00.000Z",
      verdict: "understood",
      bodyHash: "a1b2c3d4",
      turns: [{ role: "user", text: "내가 쓴 설명" }],
    };
    const first = synthesisPage("sp-1", NOTE, "v1", []);
    const withRec = { ...first, markdown: joinFeynmanSection("v1", [session]) };
    const second = synthesisPage("sp-1", NOTE, "v2", [withRec]);
    const { body, sessions } = splitFeynmanSection(second.markdown);
    expect(sessions).toEqual([session]);
    expect(body).toBe("v2");
  });
```

> 기존 `it("재변환은 기존 페이지의 id/path/createdAt 을 보존하고 본문만 갱신")`(`:101`)의 `expect(second.markdown).toBe("v2")` 는 그대로 통과해야 한다 — `joinFeynmanSection(md, [])` 는 `md` 를 그대로 돌려준다. 이게 깨지면 Task 1 의 `joinFeynmanSection` 이 빈 세션에도 섹션을 만들고 있는 것이다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/lib/llmApply.test.ts -t "파인만 기록 보존"`
Expected: FAIL — 기록이 사라지거나(`sessions` 가 `[]`), LLM 에 넘어간 본문에 "내가 쓴 설명"이 들어 있다.

- [ ] **Step 3: `mergeMarkdown` 을 고친다**

`src/lib/llmApply.ts:169-180` 을 통째로 교체한다:

```ts
// 병합 본문 결정. 통합에 실패하면 기존 본문을 그대로 둔다 — 새 내용을 못 얹는 것보다
// 이미 쌓인 지식을 덮는 것이 훨씬 나쁘다(원본 불가침과 같은 철학). 출처·관계는 그래도 누적된다.
//
// 파인만 기록은 LLM 에 보내지 않고 코드로 되붙인다. mergeWiki 는 기존 본문을 통째로 넣고
// 통째로 다시 쓰게 하는 구조라(mergeWiki.ts:5-6 이 인정하듯) 프롬프트 지시로는 못 지킨다.
// 사용자가 자기 말로 쓴 설명이 "정답"으로 둔갑해 되물음에 인용되는 것도 함께 막는다.
async function mergeMarkdown(ex: WikiPage, c: LlmConcept, source: ImportSource, deps?: ApplyDeps): Promise<string> {
  if (!deps?.mergeMarkdown) return ex.markdown;
  const { body, sessions, unparsed } = splitFeynmanSection(ex.markdown);
  try {
    const md = await deps.mergeMarkdown(body, c, source);
    // 폴백 두 경로는 기록 포함 원본(ex.markdown)을 그대로 돌려준다 — 여기서만 되붙여야 중복이 없다.
    // LLM 출력을 한 번 훑는 이유: 돌려준 본문에 `## 파인만 기록` 이 섞여 있으면 재부착 뒤 그 헤딩이
    // 두 번 나타나고, 다음 split 의 locate() 가 앞선 가짜를 잡아 **진짜 기록을 body 로 흘려보낸다**.
    // 그러면 사용자 발화가 다음 병합의 LLM 입력이 된다 — 이 함수가 막으려던 바로 그 유출이다.
    // 우리는 기록 없는 body 만 보냈으므로 LLM 이 그 헤딩을 뱉었다면 그건 창작이다. 버려도 된다.
    return md.trim() ? joinFeynmanSection(splitFeynmanSection(md).body, sessions, unparsed) : ex.markdown;
  } catch (e) {
    console.warn(`[llmApply] 본문 통합 실패 — 기존 본문 유지: ${String(e)}`);
    return ex.markdown;
  }
}
```

파일 상단 import 에 추가 (`src/lib/llmApply.ts:4` 아래):

```ts
import { splitFeynmanSection, joinFeynmanSection } from "./feynmanSection";
```

> **순환 import 주의**: `noteSections.ts` 가 `llmApply.ts` 의 `normalizeTitle` 을 import 하고, `feynmanSection.ts` 가 `noteSections.ts` 를 import 하며, 이제 `llmApply.ts` 가 `feynmanSection.ts` 를 import 한다 → `llmApply → feynmanSection → noteSections → llmApply` 순환이 생긴다. Task 5 가 `noteSections.ts:1` 의 `normalizeTitle` import 를 제거하면서 이 고리를 끊는다. 그 전까지 vitest 는 통과하지만(ESM 순환은 함수 참조라 런타임에 해소됨), **Task 5 에서 반드시 끊어라.**

- [ ] **Step 4: `synthesisPage` 를 고친다**

`src/lib/llmApply.ts:111` 의 `markdown,` 한 줄을 바꾼다. `ex` 는 `:90` 에서 이미 찾아져 있다. 함수 상단(`:88` `const now = ...` 근처)에 한 줄 추가:

```ts
  const keep = ex ? splitFeynmanSection(ex.markdown) : null;
```

`:111`:

```ts
    // 재변환은 기존 본문을 참조조차 하지 않고 새 출력으로 갈아탄다 — 파인만 기록만 되살린다.
    // splitFeynmanSection(markdown).body: LLM 출력에 `## 파인만 기록` 이 섞이면 재부착 뒤 헤딩이
    // 두 번 나타나 다음 split 이 진짜 기록을 body 로 흘려보낸다(mergeMarkdown 과 같은 함정).
    markdown: joinFeynmanSection(splitFeynmanSection(markdown).body, keep?.sessions ?? [], keep?.unparsed ?? []),
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/lib/llmApply.test.ts`
Expected: PASS — 새 describe 5개 + 기존 케이스 전부.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/llmApply.ts src/lib/llmApply.test.ts
git commit -m "fix(feynman): 위키 병합·정리글 재생성에서 파인만 기록을 코드로 보존

mergeWiki 는 기존 본문을 통째로 LLM 에 넣고 통째로 다시 쓰게 한다.
mergeWiki.ts:5-6 주석이 인정하듯 프롬프트 지시는 보장이 아니므로
strip → 병합 → 재부착을 코드로 강제한다.

재부착은 성공 분기 한 곳에서만 한다 — 폴백 두 경로는 기록 포함
원본을 그대로 돌려주므로 거기서도 붙이면 중복된다.

정리글(synthesisPage)은 기존 본문을 읽지도 않고 폐기하므로
프롬프트로는 애초에 못 살린다."
```

---

### Task 3: 노트 파인만 진입점 제거

`feynmanStore.ts` 는 아직 건드리지 않는다 — 이 태스크는 **소비자만** 지운다. 스토어는 미사용 상태로 남고, 타입이 맞으므로 컴파일된다. Task 5 가 스토어를 재작성한다.

**Files:**
- Delete: `src/app/panes/useFeynmanEditor.tsx` · `src/app/panes/FeynmanPanel.tsx` · `src/lib/cmHeadingAction.ts` · `e2e/feynman-sections.spec.ts`
- Modify: `src/app/panes/DocView.tsx` · `src/app/PiecePoolApp.tsx:1054-1055` · `src/app/panes/InboxSection.tsx` · `src/lib/SlashBlockEditor.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `DocView` 의 `feynman` prop 이 사라진다. `SlashBlockEditor` 의 `headingAction`·`onSelect` prop 이 사라진다.

- [ ] **Step 1: 삭제하면 안 되는 것을 먼저 확인한다**

`e2e/feynman.spec.ts` 는 **이름만 feynman 이고 실제로는 `review_needed`(복습 표시) e2e 다.** 삭제 금지. 파일 `:6` 주석이 "파인만 본체는 sections spec" 이라 명시하고 있다. 열어서 확인하라:

Run: `npx playwright test e2e/feynman.spec.ts --list`
Expected: 3개 테스트가 나열된다. 이건 그대로 둔다.

- [ ] **Step 2: 파일 4개를 삭제한다**

```bash
git rm src/app/panes/useFeynmanEditor.tsx src/app/panes/FeynmanPanel.tsx src/lib/cmHeadingAction.ts e2e/feynman-sections.spec.ts
```

- [ ] **Step 3: `DocView.tsx` 에서 파인만을 걷어낸다**

지울 것 — `:7` `import type { FeynmanHandlers } from "./FeynmanPanel";` · `:8` `import { useFeynmanEditor } from "./useFeynmanEditor";` · `:42` 구조분해의 `feynman,` · `:74-75` prop 타입(주석 포함) · `:80-86` `const fy = useFeynmanEditor({...});` · `:138-139` `onSelect={feynman && fy.onSelect}` / `headingAction={feynman && fy.headingAction}` · `:239-240` 파인만 오버레이(주석 포함).

**남길 것**: `:5` `stripEvidenceSection` import 와 `:95` 그 사용 — 파인만과 무관한 위키 표시 전처리다. `bottomSlot`(`:38`, `:68`)도 남긴다 — Task 7 이 여기에 위키 패널을 넣는다.

- [ ] **Step 4: `PiecePoolApp.tsx` 의 유일한 주입부를 지운다**

`src/app/PiecePoolApp.tsx:1054-1055` 두 줄을 지운다 — 파인만 관련 주석 한 줄과 `feynman={{ noteId: note.sourceId, space }}` 한 줄이다. `sourceReader` 안에 있다.

- [ ] **Step 5: `InboxSection.tsx` 에서 파인만을 걷어낸다**

지울 것 — `:7` `import { draftNoteId } from "../../store/feynmanStore";` · `:8` `import { useFeynmanEditor } from "./useFeynmanEditor";` · `:243-245` `useFeynmanEditor({...})` 호출 · `:610` `feynmanNoteId: draftNoteId(draftKey),` · `:678-682` 파인만 pill · `:699-700` `onSelect={fy.onSelect}` / `headingAction={fy.headingAction}` · **`:727` `{fy.overlay}`** (이걸 빠뜨리면 컴파일 에러가 난다).

`:617-623` 토스트는 3항 → 2항으로 줄인다. `res.feynmanUsed ? "파인만에서 쓴 설명까지 위키에 반영됐어요 ✓" : ...` 가지를 제거하고 나머지 분기를 남긴다.

`:1105` 주석 `// 속성 토글 pill (AI 생성 · 파인만) — 기존 checkbox 대체.` → `// 속성 토글 pill (AI 생성 · 퀵메모) — 기존 checkbox 대체.`

**오삭제 주의 — 남길 것**: `PropertyPill` 컴포넌트(`:1141`, `:674` AI 생성 · `:684` 퀵메모가 계속 쓴다) · `Icons.HelpCircleIcon`(`Ribbon.tsx:70` 이 쓴다) · `FEYNMAN_FACTS`(`:62-77`) — 인물 파인만 소개 로딩 문구이고 위키 생성 로딩에 계속 쓰인다.

- [ ] **Step 6: `SlashBlockEditor.tsx` 의 고아 배선을 걷어낸다**

`cmHeadingAction.ts` 가 사라졌으므로 전부 컴파일 에러다. 지울 것 — `:13` import · `:245` `headingAction: heading,` · `:261` `headingAction?: HeadingAction;` · `:281-282` `headingRef` · `:304` `headingActionExt(...)` · `.pp-heading-action` CSS(`:32`, `:48-49`).

`onSelect` prop 과 `EditorSelection` 인터페이스도 소비자가 파인만뿐이었다 — 함께 제거한다. 제거 전에 확인하라:

Run: `npx rg -n "onSelect|EditorSelection" src/ --glob '!*.test.*'`
Expected: `SlashBlockEditor.tsx` 자기 정의만 남는다. 다른 소비자가 나오면 **멈추고 보고하라** — 계획이 틀린 것이다.

- [ ] **Step 7: 타입 체크로 고아를 잡는다**

Run: `npx tsc --noEmit`
Expected: 에러 0. 에러가 나면 그게 빠뜨린 참조다.

- [ ] **Step 8: 테스트를 돌린다**

Run: `npm test`
Expected: `feynmanStore.test.ts` 는 아직 통과한다(스토어 미변경). `noteSections.test.ts` 도 통과.

- [ ] **Step 9: 커밋**

```bash
git add -u
git add src/app/panes/DocView.tsx src/app/PiecePoolApp.tsx src/app/panes/InboxSection.tsx src/lib/SlashBlockEditor.tsx
git commit -m "refactor(feynman): 노트 파인만 진입점 제거

파인만의 대상이 위키로 옮겨간다. 노트 헤딩(##/###)은 필기 구조지
개념 구조가 아니라서 주제 경계로 부적합했다.

cmHeadingAction 은 존재 이유가 파인만 헤딩 진입뿐이라 함께 죽는다.
새 진입점은 위키 문서 하단 패널 하나라 되살아날 자리가 없다.

e2e/feynman.spec.ts 는 이름과 달리 review_needed 테스트라 유지한다."
```

> `git add -u` 는 **추적 중인 파일의 수정·삭제만** 스테이징한다. 미추적 파일(`test-pdfs/`)은 안 건드린다. 그래도 `git status` 로 확인하고 커밋하라.

---

### Task 4: 위키 생성 재료 배선 제거 (`importStore.ts`)

파인만이 위키 **이후**로 옮겨가므로 "파인만 설명이 위키 생성 재료가 된다"가 구조적으로 성립할 수 없다. 의도된 기능 삭제다.

**Files:**
- Modify: `src/store/importStore.ts`
- Test: `src/store/importStore.test.ts` (있으면)

**Interfaces:**
- Consumes: 없음
- Produces: `ImportJobView` 에서 `feynmanUsed` 가 사라진다. `runImport` 파라미터에서 `feynmanNoteId` 가 사라진다.

- [ ] **Step 1: 파인만 배선을 지운다**

지울 것 — `:10` `import { useFeynmanStore, type SectionStatus } from "./feynmanStore";` · `:16-19` 파인만 관련 주석 · `:37` `feynmanUsed?: boolean;` · `:63-64` `feynmanNoteId?: string;` · `:73-80` `feynmanTranscript` 함수 · `:188-192` `adopt` 호출 · `:201-203` transcript 주입(`input.sourceText += transcript`) · `:206` 의 `transcript ? { feynmanUsed: true } : undefined` 인자.

`:206` 은 이렇게 된다:

```ts
    return writeAndComplete(job, result, engine, note, p);
```

**남길 것**: `:7` `normalizeTitle` import (`buildInput`(`:112`)이 쓴다) · `:194-197` `if (!p.withLlm)` 블록 (adopt 를 안 쓴다).

- [ ] **Step 2: 고아가 된 `extra` 파라미터를 지운다**

`:206` 이 `extra` 의 유일한 전달부였다. 이제 `writeAndComplete` 의 6번째 파라미터가 죽는다 — `:139` `extra?: Partial<ImportJobView>,` 와 `:167` `...extra,` 를 함께 지운다. 안 지우면 호출자 없는 데드 파라미터가 남는다.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0. `feynmanUsed` 를 읽던 곳(`InboxSection.tsx:618-619`)은 Task 3 에서 이미 지웠다.

- [ ] **Step 4: 테스트**

Run: `npm test`
Expected: PASS. `importStore.test.ts` 에 `feynmanUsed`·`feynmanNoteId` 를 검증하는 케이스가 있으면 삭제한다 — 사라진 기능의 테스트다.

- [ ] **Step 5: 커밋**

```bash
git add src/store/importStore.ts
git commit -m "refactor(feynman): 파인만 설명을 위키 생성 재료로 덧대던 배선 제거

파인만이 위키 생성 이후로 옮겨가므로 생성 입력에 덧댈 수 없다.
writeAndComplete 의 extra 파라미터도 유일한 전달부가 사라져 함께 제거."
```

---

### Task 5: `feynmanStore` 를 위키 단일 주제로 재작성

**Files:**
- Modify: `src/store/feynmanStore.ts` (대폭 재작성)
- Modify: `src/lib/noteSections.ts` (노트 주제 분할 제거)
- Test: `src/store/feynmanStore.test.ts` (재작성) · `src/lib/noteSections.test.ts` (17개 삭제)

**Interfaces:**
- Consumes: `splitFeynmanSection` · `joinFeynmanSection` · `bodyHash` · `FeynmanSession` · `FeynmanTurn` (Task 1) · `ipc.saveWiki` · `probeExplanation` (`src/llm/feynman.ts`, 변경 없음)
- Produces:
  - `useFeynmanStore` — `session: WikiSession | null`, `dismissed: Record<string, string>`
  - `start(space: string, page: WikiPage): void`
  - `explain(text: string): Promise<void>` · `retryProbe(): Promise<void>`
  - `finish(understood: boolean): Promise<void>` — 저장까지 한다
  - `dismiss(): void` — "나중에"·닫기
  - `hasGeminiKey(): boolean` · `wikiKey(space: string, path: string): string`

- [ ] **Step 1: `noteSections.ts` 에서 노트 주제 분할을 제거한다**

지울 것 — `:1` `import { normalizeTitle } from "./llmApply";` · `:13-31` `SectionTopic` · `:36` `Heading.key` · `:60` `seen` Map · `:71-74` 의 slug 채번(`normalizeTitle` 호출과 `key` 필드) · `:90-100` `toTopic` · `:103` `isTopic` · `:109-116` `wholeNoteTopics` · `:127-160` `topicsForSelection`.

`scanHeadings` 의 push 는 이렇게 줄어든다:

```ts
      const m = ATX.exec(text);
      if (m) out.push({ level: m[1].length, title: cleanTitle(m[2] ?? ""), from: offset });
```

`Heading` 은 `key` 없이:

```ts
export interface Heading {
  level: number;
  title: string; // 빈 문자열일 수 있다(`## ` 만 있는 줄) — 섹션 경계이긴 하다
  from: number;
}
```

파일 상단 주석(`:3-11`)을 교체한다 — 이제 파인만 모듈이 아니다:

```ts
// ══ 마크다운 헤딩 스캔 + 위키 표시 전처리 ══
//
// 코드 펜스를 인식해 ATX 헤딩을 찾고(scanHeadings), 위키 표시에서 `## 근거`(PDF 임베드)를
// 걷어낸다(stripEvidenceSection). 저장 데이터는 건드리지 않는다 — 표시 전용이다.
//
// 순수 문자열 함수다. lezer syntaxTree 를 쓰지 않는 이유: 섹션 본문은 선택 범위 밖으로
// 뻗어나가는데 syntaxTree 는 뷰포트 밖에서 미완성 파스일 수 있다. 게다가 순수 함수여야
// vitest 에 EditorState 구성 없이 바로 걸린다.
```

> 이것이 Task 2 가 남긴 `llmApply → feynmanSection → noteSections → llmApply` 순환을 끊는다.

- [ ] **Step 2: `noteSections.test.ts` 를 정리한다**

`topicsForSelection` 관련 17개를 삭제하고 `stripEvidenceSection` 7개를 남긴다. 파일을 읽고 describe 단위로 판단하라.

Run: `npx vitest run src/lib/noteSections.test.ts`
Expected: PASS — 7개.

- [ ] **Step 3: 실패하는 스토어 테스트를 쓴다**

`src/store/feynmanStore.test.ts` 를 재작성한다. **반드시 살려야 할 5개**(stale 응답 3종 · 실패 시 설명 보존 · probing 중 판정 차단)는 기존 파일에서 가져와 새 API 에 맞게 고친다.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeynmanStore, wikiKey } from "./feynmanStore";
import { splitFeynmanSection, joinFeynmanSection, bodyHash } from "../lib/feynmanSection";
import type { WikiPage } from "../lib/types";

vi.mock("../llm/feynman", () => ({ probeExplanation: vi.fn() }));
// finish 는 디스크 최신본 기준이라 readWiki 도 탄다.
vi.mock("../lib/ipc", () => ({ saveWiki: vi.fn(), readWiki: vi.fn() }));
import { probeExplanation } from "../llm/feynman";
import * as ipc from "../lib/ipc";

const BODY = "# 스레드\n\n프로세스 안의 실행 단위.";
const page = (over: Partial<WikiPage> = {}): WikiPage =>
  ({
    id: "wiki-1",
    spaceId: "sp-1",
    conceptId: "concept-thread",
    title: "스레드",
    path: "thread.md",
    subjectIds: [],
    sourceIds: ["src-1"],
    sourceRefs: [],
    markdown: BODY,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...over,
  }) as WikiPage;

beforeEach(() => {
  vi.clearAllMocks();
  useFeynmanStore.setState({ session: null, dismissed: {} });
  localStorage.setItem("gemini-key", "test-key");
  vi.mocked(ipc.saveWiki).mockImplementation(async (_s, p) => p as WikiPage);
  vi.mocked(ipc.readWiki).mockImplementation(async () => page());
});

describe("start / explain", () => {
  it("probe 입력에 위키 본문을 주되 파인만 기록은 뺀다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "스택은요?", targetGap: "why" });
    const withRecord = page({
      markdown: joinFeynmanSection(BODY, [
        { at: "2026-07-01T00:00:00.000Z", verdict: "understood", bodyHash: "x", turns: [{ role: "user", text: "옛 설명" }] },
      ]),
    });
    useFeynmanStore.getState().start("sp", withRecord);
    await useFeynmanStore.getState().explain("스레드는…");
    const noteArg = vi.mocked(probeExplanation).mock.calls[0][1];
    expect(noteArg).toBe(BODY);
    expect(noteArg).not.toContain("옛 설명");
    expect(noteArg).not.toContain("이해함");
  });

  it("LLM 실패 시 사용자 설명이 history 에 남는다", async () => {
    vi.mocked(probeExplanation).mockRejectedValue(new Error("죽음"));
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("내 설명");
    const s = useFeynmanStore.getState().session!;
    expect(s.history).toEqual([{ role: "user", text: "내 설명" }]);
    expect(s.error).toBeTruthy();
    expect(s.probing).toBe(false);
  });

  it("stale 응답 — 세션이 닫혔으면 대화를 되살리지 않는다", async () => {
    let resolve!: (v: { probe: string; targetGap: string }) => void;
    vi.mocked(probeExplanation).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    useFeynmanStore.getState().start("sp", page());
    const p = useFeynmanStore.getState().explain("설명");
    useFeynmanStore.getState().dismiss();
    resolve({ probe: "늦은 되물음", targetGap: "why" });
    await p;
    expect(useFeynmanStore.getState().session).toBeNull();
  });

  it("stale 응답 — 다른 페이지로 갈아탄 세션을 오염시키지 않는다", async () => {
    let resolve!: (v: { probe: string; targetGap: string }) => void;
    vi.mocked(probeExplanation).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    useFeynmanStore.getState().start("sp", page());
    const p = useFeynmanStore.getState().explain("설명");
    useFeynmanStore.getState().start("sp", page({ path: "other.md", title: "다른 개념" }));
    resolve({ probe: "늦은 되물음", targetGap: "why" });
    await p;
    expect(useFeynmanStore.getState().session!.history).toEqual([]);
  });
});

describe("finish — 기록을 위키 본문에 저장한다", () => {
  it("세션이 본문 최하단에 append 되고 최신이 위로 온다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "스택은요?", targetGap: "why" });
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("스레드는 실행 단위");
    await useFeynmanStore.getState().finish(true);

    const saved = vi.mocked(ipc.saveWiki).mock.calls[0][1];
    const { body, sessions } = splitFeynmanSection(saved.markdown);
    expect(body).toBe(BODY);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].verdict).toBe("understood");
    expect(sessions[0].turns).toEqual([
      { role: "user", text: "스레드는 실행 단위" },
      { role: "probe", text: "스택은요?" },
    ]);
  });

  it("기록 직후에는 '문서 바뀜' 배지가 뜨지 않는다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("설명");
    await useFeynmanStore.getState().finish(true);

    const saved = vi.mocked(ipc.saveWiki).mock.calls[0][1];
    const { sessions } = splitFeynmanSection(saved.markdown);
    // 배지 판정식과 동일한 비교. 이게 깨지면 배지가 상시 점등한다.
    expect(sessions[0].bodyHash).toBe(bodyHash(saved.markdown));
  });

  it("probing 중에는 판정하지 않는다", async () => {
    vi.mocked(probeExplanation).mockReturnValue(new Promise(() => {}) as never);
    useFeynmanStore.getState().start("sp", page());
    void useFeynmanStore.getState().explain("설명");
    await useFeynmanStore.getState().finish(true);
    expect(ipc.saveWiki).not.toHaveBeenCalled();
  });

  it("저장 실패 시 세션을 날리지 않는다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    vi.mocked(ipc.saveWiki).mockRejectedValue(new Error("디스크 죽음"));
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("설명");
    await useFeynmanStore.getState().finish(true);
    const s = useFeynmanStore.getState().session;
    expect(s).not.toBeNull();
    expect(s!.error).toBeTruthy();
    expect(s!.history).toHaveLength(2);
  });
});

describe("dismiss — '나중에'", () => {
  it("세션을 닫고 이 페이지를 dismissed 에 기록한다", () => {
    useFeynmanStore.getState().start("sp", page());
    useFeynmanStore.getState().dismiss();
    expect(useFeynmanStore.getState().session).toBeNull();
    expect(useFeynmanStore.getState().dismissed[wikiKey("sp", "thread.md")]).toBeTruthy();
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/store/feynmanStore.test.ts`
Expected: FAIL — `wikiKey` 가 없고 `start` 시그니처가 다르다.

- [ ] **Step 5: 스토어를 재작성한다**

`src/store/feynmanStore.ts` 를 통째로 교체한다:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { probeExplanation, type Turn } from "../llm/feynman";
import { splitFeynmanSection, joinFeynmanSection, bodyHash, type FeynmanSession } from "../lib/feynmanSection";
import type { WikiPage } from "../lib/types";
import * as ipc from "../lib/ipc";

// ══ 위키 파인만 — 페이지 하나(=개념 하나)를 자기 말로 설명하게 한다 ══
//
// 위키 개념은 학습자가 만든 것이 아니다. 그래서 "이해했다"고 넘어가기 전에 자기 말로
// 설명하게 하고, 그 사고 과정을 개념과 같은 파일에 남긴다.
//
// 대화(session)는 메모리 전용이다. 진행 중인 설명은 미완이지 결과가 아니다.
// 디스크에 남는 것은 사용자가 판정을 내린 세션뿐 — 위키 .md 본문의 `## 파인만 기록`.
//
// dismissed 는 "이 페이지에서 나중에 하겠다고 했다"는 이 기기의 표시다. 계약
// (workspace-layout.md)에 없는 파일을 만들 수 없으므로 localStorage 에 둔다.
// 유실되면 자동 열기가 한 번 더 뜰 뿐이다 — 학습 보조 신호이지 보안 경계가 아니다.

interface WikiSession {
  /** 세션마다 새로 매기는 번호. 늦게 온 응답이 어느 세션의 것인지 가리는 유일한 근거다. */
  id: number;
  space: string;
  /** WikiPage.path — rename 에도 불변(commands/wiki.rs:106-107) */
  path: string;
  title: string;
  /** 기록을 걷어낸 본문. probe 입력이자 bodyHash 의 재료. */
  body: string;
  history: Turn[];
  probing: boolean;
  error?: string;
}

let sessionSeq = 0;

interface FeynmanState {
  session: WikiSession | null;
  /** key = wikiKey(space, path) → 표시한 시각(ISO). 값은 디버깅용이고 판정은 존재 여부로 한다. */
  dismissed: Record<string, string>;
  start: (space: string, page: WikiPage) => void;
  explain: (text: string) => Promise<void>;
  retryProbe: () => Promise<void>;
  /** 사용자 판정 → 위키 본문에 기록을 append 하고 저장. 저장 실패면 세션을 유지한다. */
  finish: (understood: boolean) => Promise<void>;
  /** [나중에]·[닫기] — 세션을 닫고 이 페이지의 자동 열기를 끈다. */
  dismiss: () => void;
}

export const wikiKey = (space: string, path: string) => `${space}::${path}`;

export function hasGeminiKey(): boolean {
  return !!(typeof localStorage !== "undefined" && localStorage.getItem("gemini-key"));
}

function apiKey(): string {
  return (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
}

export const useFeynmanStore = create<FeynmanState>()(
  persist(
    (set, get) => {
      // 되물음 1회. explain/retryProbe 공통.
      // 늦게 온 응답이 다른 페이지·다른 세션 위에 옛 대화를 되살리면 안 된다 → 세션 번호 대조.
      const runProbe = async (sid: number, s: WikiSession, history: Turn[]) => {
        const fresh = () => get().session?.id === sid;
        try {
          const { probe } = await probeExplanation(s.title, s.body, history, apiKey());
          if (!fresh()) return;
          set((c) => ({
            session: c.session && { ...c.session, history: [...history, { role: "probe", text: probe }], probing: false },
          }));
        } catch (e) {
          if (!fresh()) return;
          // 사용자가 쓴 설명은 history 에 남긴다 — retryProbe 로 재타이핑 없이 다시 시도한다.
          set((c) => ({ session: c.session && { ...c.session, history, probing: false, error: String(e) } }));
        }
      };

      return {
        session: null,
        dismissed: {},

        start: (space, page) => {
          set({
            session: {
              id: ++sessionSeq,
              space,
              path: page.path,
              title: page.title,
              // 기록을 걷어낸 본문만 넘긴다 — 옛 발화가 note 로 들어가면 conversation 과
              // 이중 노출되고, 과거의 옳은 설명을 되물음이 인용하면 그게 곧 답 유출이다.
              body: splitFeynmanSection(page.markdown).body,
              history: [],
              probing: false,
            },
          });
        },

        explain: async (text) => {
          const s = get().session;
          const said = text.trim();
          if (!s || !said || s.probing) return;
          const history: Turn[] = [...s.history, { role: "user", text: said }];
          set({ session: { ...s, history, probing: true, error: undefined } });
          await runProbe(s.id, s, history);
        },

        retryProbe: async () => {
          const s = get().session;
          const last = s?.history[s.history.length - 1];
          if (!s || s.probing || last?.role !== "user") return;
          set({ session: { ...s, probing: true, error: undefined } });
          await runProbe(s.id, s, s.history);
        },

        finish: async (understood) => {
          const s = get().session;
          if (!s || s.probing) return;
          // 디스크 최신본 기준 — 메모리 stale 본문이 그 사이 갱신된 본문을 덮지 않는다.
          try {
            const cur = await ipc.readWiki(s.space, s.path);
            const { body, sessions, unparsed } = splitFeynmanSection(cur.markdown);
            const session: FeynmanSession = {
              at: new Date().toISOString(),
              verdict: understood ? "understood" : "not_yet",
              bodyHash: bodyHash(body),
              turns: s.history.map((t) => ({ role: t.role, text: t.text })),
            };
            await ipc.saveWiki(s.space, { ...cur, markdown: joinFeynmanSection(body, [session, ...sessions], unparsed) });
            if (get().session?.id === s.id) set({ session: null });
          } catch (e) {
            // 설명을 잃지 않는다 — 세션을 유지하고 다시 시도하게 한다.
            if (get().session?.id === s.id) set((c) => ({ session: c.session && { ...c.session, error: String(e) } }));
          }
        },

        dismiss: () => {
          const s = get().session;
          set((c) => ({
            session: null,
            dismissed: s ? { ...c.dismissed, [wikiKey(s.space, s.path)]: new Date().toISOString() } : c.dismissed,
          }));
        },
      };
    },
    {
      name: "pp-feynman-dismissed",
      version: 1,
      // 진행 중인 대화는 복원하지 않는다 — 재시작 후 미완의 설명이 되살아나면 사용자가
      // 자기가 뭘 하던 중이었는지 알 수 없다. 판정된 기록은 위키 .md 가 갖는다.
      partialize: (s) => ({ dismissed: s.dismissed }),
    },
  ),
);
```

> **구 키 `pp-feynman-sections` 는 마이그레이션하지 않는다.** `statuses` 는 노트 단위(`sectionKey(noteId, topic.key)`)라 위키 페이지 키로 옮길 대응이 없고, 새 SSOT 는 위키 `.md` 본문이다. 구 키를 지우는 코드도 넣지 마라 — 사용자 localStorage 를 임의로 지우지 않는다.

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/store/feynmanStore.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: 에러 0. `DocView`/`InboxSection` 이 아직 `FeynmanPanel` 을 참조하면 Task 3 을 빠뜨린 것이다.

- [ ] **Step 7: 커밋**

```bash
git add src/store/feynmanStore.ts src/store/feynmanStore.test.ts src/lib/noteSections.ts src/lib/noteSections.test.ts
git commit -m "feat(feynman): 스토어를 위키 단일 페이지 세션으로 재작성

페이지 1개 = 주제 1개라 topics/idx 다중주제 구조가 사라진다.
판정의 SSOT 가 localStorage statuses 에서 위키 .md 본문으로 옮겨간다.

probe 입력에서 기록을 걷어낸다 — 옛 발화가 note 로 들어가면
conversation 과 이중 노출되고, 과거의 옳은 설명을 되물음이 인용하면
그게 곧 답 유출이다(feynman.ts:60 위반).

저장은 디스크 최신본 기준. 실패 시 세션을 유지해 설명을 잃지 않는다.

noteSections 는 위키 표시 전처리 모듈로 축소하고 llmApply 의존을
끊어 llmApply→feynmanSection→noteSections→llmApply 순환을 없앤다."
```

---

### Task 6: 위키용 `FeynmanPanel` 신규 작성

**Files:**
- Create: `src/app/panes/FeynmanPanel.tsx`

**Interfaces:**
- Consumes: `useFeynmanStore` · `hasGeminiKey` (Task 5) · `splitFeynmanSection` · `bodyHash` · `FeynmanSession` (Task 1) · `Button`/`cn` (`../../ds`)
- Produces: `<FeynmanPanel space={string} page={WikiPage} />` — Task 7 이 `wikiReader` 의 `bottomSlot` 에 넣는다.

- [ ] **Step 1: 패널을 만든다**

Create `src/app/panes/FeynmanPanel.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button, cn } from "../../ds";
import { useFeynmanStore, hasGeminiKey } from "../../store/feynmanStore";
import { splitFeynmanSection, bodyHash, type FeynmanSession, type FeynmanTurn } from "../../lib/feynmanSection";
import type { WikiPage } from "../../lib/types";

// ══ 위키 파인만 패널 — 이 개념을 자기 말로 설명하게 한다 ══
//
// 위키 본문 아래에 인라인으로 붙는다(모달이 아니다). 본문을 보면서 설명해야 하기
// 때문이다 — 가려버리면 파인만이 아니라 암기 시험이 된다.
//
// 과거 세션은 접힌 카드로 쌓인다. 3개월 전의 자신이 무엇을 알고 무엇을 몰랐는지가
// 복기의 재료다. "이후 문서 바뀜" 배지는 그때의 설명이 지금 본문과 어긋날 수 있음을 알린다.

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
};
const VERDICT_TEXT: Record<FeynmanSession["verdict"], string> = { understood: "이해함", not_yet: "아직 모르겠다고 표시" };

/** 대화 렌더 — 과거 카드와 진행 중 세션이 같은 모양을 쓴다. */
function Turns({ turns }: { turns: readonly FeynmanTurn[] }) {
  return (
    <>
      {turns.map((t, i) => (
        <p key={i} className={cn("whitespace-pre-wrap text-[13px] leading-relaxed", t.role === "user" ? "text-ink-2" : "font-medium text-ink")}>
          {t.role === "user" ? "나: " : "↳ "}
          {t.text}
        </p>
      ))}
    </>
  );
}

function SessionCard({ s, stale }: { s: FeynmanSession; stale: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-hairline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] text-ink-2 hover:bg-surface-soft"
      >
        <span className="text-ink-faint">{open ? "▾" : "▸"}</span>
        <span>{fmtDate(s.at)}</span>
        <span className="text-ink-faint">·</span>
        <span className={cn(s.verdict === "understood" ? "text-ink" : "text-danger")}>{VERDICT_TEXT[s.verdict]}</span>
        {stale && <span className="ml-auto shrink-0 text-ink-faint">이후 문서가 바뀌었어요</span>}
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-hairline px-2 py-2">
          <Turns turns={s.turns} />
        </div>
      )}
    </div>
  );
}

export function FeynmanPanel({ space, page }: { space: string; page: WikiPage }) {
  const session = useFeynmanStore((s) => s.session);
  const start = useFeynmanStore((s) => s.start);
  const explain = useFeynmanStore((s) => s.explain);
  const retryProbe = useFeynmanStore((s) => s.retryProbe);
  const finish = useFeynmanStore((s) => s.finish);
  const dismiss = useFeynmanStore((s) => s.dismiss);
  const [draft, setDraft] = useState("");

  // 세션은 앱 전역 싱글턴이다 — 다른 페이지의 세션이면 이 패널의 것이 아니다.
  const mine = session && session.space === space && session.path === page.path ? session : null;
  // 세션이 바뀌면 입력창을 비운다 — 이전 세션에 쓰던 설명이 다음 세션으로 새면 안 된다.
  useEffect(() => setDraft(""), [mine?.id ?? null]);

  const { sessions } = splitFeynmanSection(page.markdown);
  const now = bodyHash(page.markdown);
  const keyed = hasGeminiKey();

  const send = async () => {
    const said = draft.trim();
    if (!said || mine?.probing) return;
    setDraft("");
    await explain(said);
  };

  if (!mine) {
    return (
      <div className="mt-4 space-y-2">
        {sessions.map((s, i) => (
          <SessionCard key={`${s.at}-${i}`} s={s} stale={!!s.bodyHash && s.bodyHash !== now} />
        ))}
        <Button size="sm" variant="utility" disabled={!keyed} onClick={() => start(space, page)}>
          {!keyed ? "파인만 — API 키 필요" : sessions.length ? "다시 설명해보기" : "이 개념을 설명해보기"}
        </Button>
      </div>
    );
  }

  const { history, probing, error } = mine;
  const answered = history.some((t) => t.role === "user");

  return (
    <div className="mt-4 space-y-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">
          <span className="text-primary">{page.title}</span> — 처음 배우는 사람에게 설명해보세요
        </p>
        <button type="button" onClick={dismiss} className="shrink-0 text-[12px] text-ink-faint hover:text-ink" aria-label="파인만 닫기">
          닫기
        </button>
      </div>

      {history.length > 0 && (
        <div className="max-h-44 space-y-1.5 overflow-y-auto">
          <Turns turns={history} />
        </div>
      )}

      {probing && <p className="text-[13px] text-ink-faint">읽는 중…</p>}
      {error && (
        // 설명은 history 에 남아 있다 — 다시 타이핑하지 않고 그대로 재시도한다.
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-danger">문제가 생겼어요. 설명은 그대로 있어요.</p>
          <Button size="sm" variant="utility" onClick={retryProbe}>
            다시 시도
          </Button>
        </div>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
        }}
        disabled={probing}
        rows={3}
        placeholder={history.length ? "이어서 설명해보세요… (⌘Enter 로 보내기)" : `"${page.title}" 을(를) 아는 대로 설명해보세요 (⌘Enter 로 보내기)`}
        aria-label="개념 설명"
        className="w-full resize-none rounded border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus-visible:shadow-soft disabled:opacity-60"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="solid" disabled={!draft.trim() || probing} onClick={send}>
            {history.length ? "다시 설명" : "설명 보내기"}
          </Button>
          <Button size="sm" variant="utility" disabled={probing} onClick={dismiss}>
            나중에
          </Button>
        </div>
        {/* 이해 판정은 오직 사용자. LLM 은 채점하지 않는다(relation-types.md §review_needed).
            단 설명을 한 번도 안 했으면 판정할 근거가 없다 — [나중에] 로만 넘어간다. */}
        <div className="flex gap-2">
          <Button size="sm" variant="utility" disabled={probing || !answered} onClick={() => void finish(false)}>
            아직 모르겠어요
          </Button>
          <Button size="sm" variant="utility" disabled={probing || !answered} onClick={() => void finish(true)}>
            네, 이해했어요
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0. `ds` 의 `Button` variant 이름(`solid`/`utility`)이 안 맞으면 `src/ds` 를 읽고 실제 이름에 맞춰라 — 삭제 전 `FeynmanPanel.tsx` 가 쓰던 것과 같다.

- [ ] **Step 3: 커밋**

```bash
git add src/app/panes/FeynmanPanel.tsx
git commit -m "feat(feynman): 위키용 파인만 패널

과거 세션을 접힌 카드로 쌓아 복기할 수 있게 한다. 'N/M 주제' 카운터와
'건너뛰기'는 페이지=주제1개라 사라지고, '나중에'가 그 자리를 받는다.

'이후 문서가 바뀌었어요' 배지는 bodyHash 불일치로 판정한다."
```

---

### Task 7: `wikiReader` 배선 + 자동 열기 + 표시 strip

**Files:**
- Modify: `src/app/PiecePoolApp.tsx` (`wikiReader` `:894-956`)
- Modify: `src/app/panes/DocView.tsx:95`
- Modify: `src/app/panes/InboxSection.tsx:809`

**Interfaces:**
- Consumes: `FeynmanPanel` (Task 6) · `useFeynmanStore`/`wikiKey`/`hasGeminiKey` (Task 5) · `stripFeynmanSection` (Task 1)
- Produces: 없음

- [ ] **Step 1: 표시 경로 2곳에서 기록을 걷어낸다**

`src/app/panes/DocView.tsx:95`:

```ts
  const displayMd = docType === "wiki" ? stripFeynmanSection(stripEvidenceSection(savedMd)) : savedMd;
```

`:5` import 에 추가:

```ts
import { stripFeynmanSection } from "../../lib/feynmanSection";
```

`:93-94` 주석에 한 줄 덧붙인다:

```ts
  // 파인만 기록도 감춘다 — 하단 패널이 카드로 보여주므로 본문에 날것으로 찍히면 이중 노출이다.
```

`src/app/panes/InboxSection.tsx:809` — 참조 패널 위키 미리보기:

```tsx
          <Markdown source={stripFeynmanSection(stripEvidenceSection(refWiki.markdown))} embedSpace={targetSpace} />
```

import 를 추가한다.

- [ ] **Step 2: `wikiReader` 에 패널을 배선한다**

`src/app/PiecePoolApp.tsx:955` (`conflicts={sections.conflicts}`) 와 `:956` (`/>`) 사이에 넣는다:

```tsx
        conflicts={sections.conflicts}
        bottomSlot={<FeynmanPanel space={space} page={page} />}
      />
```

import 를 추가한다:

```ts
import { FeynmanPanel } from "./panes/FeynmanPanel";
```

- [ ] **Step 3: 자동 열기를 배선한다**

`wikiReader` 는 렌더 함수라 훅을 못 넣는다. 컴포넌트 본문(다른 `useEffect` 들이 있는 곳)에 넣는다. `activeTab` 이 위키일 때 대상 페이지를 구해 효과를 건다:

```tsx
  // 신규 개념(기록 0개)이면 파인만을 자동으로 연다 — 위키는 학습자가 만든 것이 아니므로
  // 그냥 읽고 넘어가면 이해했다는 착각만 남는다(IOED).
  //
  // 마운트가 아니라 문서 정체성에 건다: DocView 에 key 가 없어 위키A→위키B 전환 시
  // React 가 인스턴스를 재사용한다 → 마운트 훅은 열려야 할 때 안 열리고,
  // 위키→그래프→위키 재마운트 때는 안 열려야 할 때 열린다.
  const autoWiki = activeTab?.kind === "wiki" ? (wikiBySlug[activeTab.space] ?? []).find((w) => w.path === activeTab.file) : undefined;
  const autoSpace = activeTab?.kind === "wiki" ? activeTab.space : "";
  useEffect(() => {
    if (!autoWiki || !autoSpace) return;
    const st = useFeynmanStore.getState();
    // 진행 중인 세션을 파괴하지 않는다 — session 은 앱 전역 싱글턴이고 메모리 전용이라
    // 다른 페이지에서 쓰던 설명이 여기서 조용히 증발한다.
    if (st.session) return;
    if (st.dismissed[wikiKey(autoSpace, autoWiki.path)]) return;
    // 키가 없으면 begin 이 조용히 무시되어 빈 패널만 뜬다.
    if (!hasGeminiKey()) return;
    if (splitFeynmanSection(autoWiki.markdown).sessions.length) return;
    st.start(autoSpace, autoWiki);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpace, autoWiki?.path]);
```

import 를 추가한다:

```ts
import { useFeynmanStore, wikiKey, hasGeminiKey } from "../store/feynmanStore";
import { splitFeynmanSection } from "../lib/feynmanSection";
```

> `activeTab` 의 실제 필드명(`kind`/`space`/`file`)은 `PiecePoolApp.tsx:1097-1105` 의 `switch` 를 읽고 맞춰라.

- [ ] **Step 4: 타입 체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 0, 테스트 PASS.

- [ ] **Step 5: 앱을 띄워 눈으로 확인한다**

Run: `npm run tauri dev`

확인 목록:
1. 기록 없는 위키 문서를 연다 → 패널이 **자동으로** 열린다 (Gemini 키가 설정돼 있어야 함)
2. `[나중에]` 를 누른다 → 패널이 닫힌다
3. 다른 탭으로 갔다가 **같은 위키로 돌아온다** → 자동으로 안 열린다 (dismissed)
4. `[이 개념을 설명해보기]` → 설명 입력 → `⌘Enter` → 되물음이 온다
5. `[네, 이해했어요]` → 패널이 접힌 카드로 바뀐다. **"이후 문서가 바뀌었어요" 배지가 뜨면 안 된다** — 뜨면 `bodyHash` 배선이 틀린 것이다
6. 카드를 클릭 → 대화 전문이 펼쳐진다
7. 위키 본문에 `## 파인만 기록` 원문이 **안 보인다**
8. 워크스페이스의 `.md` 파일을 직접 연다 → 기록이 사람이 읽을 수 있는 형태로 있다

- [ ] **Step 6: 커밋**

```bash
git add src/app/PiecePoolApp.tsx src/app/panes/DocView.tsx src/app/panes/InboxSection.tsx
git commit -m "feat(feynman): 위키 문서 하단 패널 배선 + 신규 개념 자동 열기

자동 열기 조건 4개: 기록 0개 AND !dismissed AND session==null AND 키 있음.
session 가드가 없으면 다른 페이지에서 진행 중이던 설명이 증발한다
(session 은 앱 전역 싱글턴 + 메모리 전용).

트리거를 [space, page.path] 에 건다 — DocView 에 key 가 없어 마운트
기준은 열려야 할 때 안 열리고 안 열려야 할 때 열린다.

읽기 표시 2곳(위키 본문·인박스 참조 패널)에서 기록을 걷어낸다."
```

---

### Task 8: 편집 모드 — 기록 숨김 + 저장 시 재부착

이걸 안 하면 편집기를 열어둔 채 패널에서 세션을 끝냈을 때 저장이 그 세션을 통째로 날린다. `PiecePoolApp.tsx:729-730` 주석이 이 위험을 이미 알고 있지만 저장 **후** 정리라 진입~저장 사이 창을 못 막는다.

**Files:**
- Modify: `src/app/PiecePoolApp.tsx:717-736` (`toggleEdit`·`saveWikiDoc`) · `:936`·`:944`

**Interfaces:**
- Consumes: `splitFeynmanSection` · `joinFeynmanSection` (Task 1)
- Produces: 없음

- [ ] **Step 1: 편집기에 기록을 안 보여준다**

`src/app/PiecePoolApp.tsx:936`:

```tsx
        draft={drafts[key] ?? stripFeynmanSection(page.markdown)}
```

`:944` dirty 판정도 같은 기준으로 (안 맞추면 열자마자 dirty 로 뜬다):

```tsx
          setTabDirty(tabId, md !== stripFeynmanSection(page.markdown));
```

`:937` `onToggleEdit` 은 seed 를 넘긴다 — strip 한 것을 넘긴다:

```tsx
        onToggleEdit={() => toggleEdit(key, stripFeynmanSection(page.markdown))}
```

> `sourceReader`(archive) 의 `toggleEdit` 은 **건드리지 마라** — 노트에는 기록이 없다.

- [ ] **Step 2: 저장 시 기록을 되붙인다**

`src/app/PiecePoolApp.tsx:729-736` 의 `saveWikiDoc` 을 교체한다:

```ts
  // 저장 후에는 드래프트를 비운다 — 남겨두면 다음 편집 진입 시 stale 드래프트가 부활해
  // 그 사이 외부 갱신(AI 병합 등)된 내용을 덮어쓴다.
  //
  // 파인만 기록은 편집기에 안 보이므로(draft 는 strip 된 본문) 디스크 최신본에서 꺼내 되붙인다.
  // 메모리의 page.markdown 을 쓰면 편집 중에 끝낸 세션이 사라진다 — 그 세션은 디스크에만 있다.
  const saveWikiDoc = async (space: string, page: WikiPageT, md: string) => {
    const cur = await ipc.readWiki(space, page.path);
    const { sessions, unparsed } = splitFeynmanSection(cur.markdown);
    const saved = await ipc.saveWiki(space, { ...cur, markdown: joinFeynmanSection(md, sessions, unparsed) });
    setWikiBySlug((m) => ({ ...m, [space]: (m[space] ?? []).map((x) => (x.path === page.path ? saved : x)) }));
    clearDocState(docKey(space, page.path));
    setTabDirty(`wiki:${space}:${page.path}`, false);
  };
```

> `{ ...cur, ... }` 이지 `{ ...page, ... }` 가 아니다 — 디스크 최신본의 `subjectIds`·`sourceRefs` 를 메모리 stale 값으로 덮지 않는다. `toggleWikiSubject`(`:763`)가 이미 같은 이유로 `readWiki` 를 쓴다.

import 를 추가한다:

```ts
import { splitFeynmanSection, joinFeynmanSection, stripFeynmanSection } from "../lib/feynmanSection";
```

(Task 7 에서 `splitFeynmanSection` 은 이미 import 했다 — 한 줄로 합친다.)

- [ ] **Step 3: 타입 체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 0, PASS.

- [ ] **Step 4: 앱에서 stale draft 시나리오를 직접 재현한다**

Run: `npm run tauri dev`

1. 기록이 있는 위키 문서를 연다
2. `[편집]` 을 누른다 → **본문에 `## 파인만 기록` 이 안 보인다**
3. 편집기를 **열어둔 채로** 하단 패널에서 새 세션을 끝낸다(`[네, 이해했어요]`)
4. 편집기에서 아무 글자나 고치고 `[저장]`
5. **3번의 세션이 살아 있어야 한다.** 사라졌으면 재부착이 디스크 최신본을 안 읽고 있는 것이다

- [ ] **Step 5: 커밋**

```bash
git add src/app/PiecePoolApp.tsx
git commit -m "fix(feynman): 편집 모드에서 기록 숨김 + 저장 시 디스크 최신본에서 재부착

기록 섹션은 그 자체가 SSOT 다(근거 섹션은 sourceRefs 가 복구해 준다).
사용자가 편집기에서 헤딩을 건드리면 복구 원본이 없다.

재부착 소스는 메모리 page.markdown 이 아니라 readWiki 결과다 —
편집 중에 패널에서 끝낸 세션은 디스크에만 있기 때문이다.
이것이 stale draft 가 기록을 덮어쓰는 창도 함께 막는다."
```

---

### Task 9: e2e + 마무리

**Files:**
- Create: `e2e/feynman-wiki.spec.ts`
- Modify: `docs/30-llm/evals/feynman/README.md`

**Interfaces:**
- Consumes: 전부
- Produces: 없음

- [ ] **Step 1: e2e 를 쓴다**

Create `e2e/feynman-wiki.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// 위키 파인만 — LLM 이 만든 개념 문서를 자기 말로 설명하게 하고,
// 그 사고 과정을 위키 .md 본문의 `## 파인만 기록` 에 남긴다.

const chat = (payload: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gemini-key", "test-key");
    localStorage.removeItem("pp-feynman-dismissed");
  });
  await page.route("**generativelanguage.googleapis.com**", (route) =>
    route.fulfill(chat({ probe: "실행 중이라는 게 정확히 무슨 뜻인가요?", targetGap: "term" })),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "프로세스", exact: true })).toBeVisible();
});

/** seed 가 만든 위키 개념 문서를 연다. */
const openWiki = (page: Page) => page.getByRole("button", { name: "프로세스", exact: true }).click();

const box = (page: Page) => page.getByRole("textbox", { name: "개념 설명" });

/** 설명 한 번 + 되물음 + 판정까지. */
async function runSession(page: Page, said: string) {
  await box(page).fill(said);
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();
  await page.getByRole("button", { name: "네, 이해했어요" }).click();
}

test("기록 없는 위키를 열면 파인만이 자동으로 열린다", async ({ page }) => {
  await openWiki(page);
  await expect(box(page)).toBeVisible();
});

test("설명 → 되물음 → 판정 → 접힌 카드로 남고, 펼치면 대화 전문이 보인다", async ({ page }) => {
  await openWiki(page);
  await runSession(page, "프로세스는 실행 중인 프로그램이에요");

  // 대화창은 닫히고 카드가 생긴다
  await expect(box(page)).toHaveCount(0);
  const card = page.getByRole("button", { name: /이해함/ });
  await expect(card).toBeVisible();

  // 판정 직후에는 배지가 없다 — 뜨면 bodyHash 배선이 틀린 것이다(updatedAt 설계로 회귀)
  await expect(page.getByText("이후 문서가 바뀌었어요")).toHaveCount(0);

  await card.click();
  await expect(page.getByText("프로세스는 실행 중인 프로그램이에요")).toBeVisible();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();
});

test("위키 본문에 기록 원문이 노출되지 않는다", async ({ page }) => {
  await openWiki(page);
  await runSession(page, "프로세스는 실행 중인 프로그램이에요");
  // 본문 렌더에 `## 파인만 기록` 헤딩이 찍히면 패널과 이중 노출이다
  await expect(page.getByRole("heading", { name: "파인만 기록" })).toHaveCount(0);
});

test("[나중에] 를 누르면 재방문해도 자동으로 안 열린다", async ({ page }) => {
  await openWiki(page);
  await page.getByRole("button", { name: "나중에" }).click();
  await expect(box(page)).toHaveCount(0);

  // 다른 문서로 갔다가 돌아온다 — DocView 인스턴스가 재사용되는 경로
  await page.getByRole("button", { name: "스레드", exact: true }).click();
  await openWiki(page);
  await expect(box(page)).toHaveCount(0);
  // 대신 수동 버튼이 있다
  await expect(page.getByRole("button", { name: "이 개념을 설명해보기" })).toBeVisible();
});

test("진행 중인 세션은 다른 위키를 열어도 파괴되지 않는다", async ({ page }) => {
  await openWiki(page);
  await box(page).fill("쓰다 만 설명");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();

  // 다른 위키로 갔다 온다 — 자동 열기가 이 세션을 덮으면 안 된다
  await page.getByRole("button", { name: "스레드", exact: true }).click();
  await openWiki(page);
  await expect(page.getByText("쓰다 만 설명")).toBeVisible();
});
```

> **셀렉터는 실행해서 맞춰라.** `"프로세스"`·`"스레드"` 는 seed 위키 개념 이름이고 `e2e/feynman-sections.spec.ts` 가 쓰던 것이다. seed 에 `"스레드"` 가 없으면 실제 개념 이름으로 바꿔라 — `npx playwright test e2e/feynman-wiki.spec.ts --headed` 로 확인하는 게 빠르다. `aria-label`(`"개념 설명"`)은 Task 6 의 textarea 와 일치해야 한다.

- [ ] **Step 2: e2e 를 돌린다**

Run: `npx playwright test e2e/feynman-wiki.spec.ts`
Expected: PASS.

Run: `npx playwright test e2e/feynman.spec.ts`
Expected: PASS — 3개. 이건 review_needed 테스트이고 안 건드렸다.

- [ ] **Step 3: eval README 의 사전 오류를 고친다**

`docs/30-llm/evals/feynman/README.md:6-10` 이 안내하는 `--all` 은 `feynman-eval.ts` 가 파싱하지 않고(기본이 전체 실행이라 무해), `--case trap-wrong-fact` 의 fixture id 는 존재하지 않는다 — 실제는 `clarify-03-wrong-pvalue-trap` 이다. 실재하는 사용법으로 고친다.

> fixture 18개는 그대로 둔다. `note` 가 사용자 필기 파편이라 더 이상 프로덕션 입력(= LLM 이 쓴 위키 본문)을 대표하지 않지만, 러너와 `gate()` 는 안 깨진다. 위키형 fixture 추가는 후속 작업이다.

- [ ] **Step 4: 전체 검증**

```bash
npx tsc --noEmit && npm test && npx playwright test
```

Expected: 전부 통과.

- [ ] **Step 5: 죽은 참조를 훑는다**

Run: `npx rg -n "feynman|파인만|SectionTopic|topicsForSelection|getSectionStatus|feynmanTranscript|feynmanUsed|useFeynmanEditor|cmHeadingAction" src/ e2e/ --glob '!*feynmanSection*' --glob '!*FeynmanPanel*' --glob '!*feynmanStore*' --glob '!src/llm/feynman*'`

Expected: 남는 것은 `provider.ts:16` `features.clarify`(범위 밖), `InboxSection.tsx` 의 `FEYNMAN_FACTS`(인물 소개 문구), `e2e/feynman.spec.ts`(review_needed) 뿐이다. 그 외가 나오면 빠뜨린 것이다.

- [ ] **Step 6: 커밋 후 PR**

```bash
git add e2e/feynman-wiki.spec.ts docs/30-llm/evals/feynman/README.md
git commit -m "test(feynman): 위키 파인만 e2e + eval README 사용법 정정"
git push -u origin feat/feynman-wiki-only
```

PR 본문에 **Before / After 섹션을 넣고 사용자에게 스크린샷 첨부를 요청하라** — UI/UX 변경 PR 규칙이다(CLAUDE.md). 에이전트는 앱 스크린샷을 못 찍는다.

PR 본문에 반드시 적을 것:
- 파인만이 노트에서 위키로 옮겨간다
- **"파인만 설명이 위키 생성 재료가 된다" 기능이 의도적으로 삭제된다**
- 계약 변경 없음 / Rust 변경 없음
- 기존 localStorage `pp-feynman-sections`(노트 단위 판정)는 마이그레이션하지 않는다

---

## 리뷰어를 위한 요약 — 이 PR 에서 가장 위험한 곳

| 순위 | 지점 | 틀리면 |
|---|---|---|
| 1 | `llmApply.ts` `mergeMarkdown` 재부착 (Task 2) | 사용자 기록이 LLM 에 전송되고 조용히 사라진다. **폴백 2경로에서 재부착하면 중복된다** |
| 2 | `feynmanStore.finish` 의 `bodyHash(body)` (Task 5) | 배지가 상시 점등한다. `bodyHash(cur.markdown)` 로 쓰면 안 되는 게 아니라 — 둘이 같은 값이어야 정상이다. 테스트가 이걸 잡는다 |
| 3 | `saveWikiDoc` 의 `readWiki` (Task 8) | 편집 중에 끝낸 세션이 사라진다 |
| 4 | 자동 열기의 `if (st.session) return` (Task 7) | 다른 페이지에서 쓰던 설명이 증발한다 |
| 5 | `stripFeynmanSection` 의 펜스 인식 (Task 1) | 코드펜스에 `## 파인만 기록` 이 있는 위키의 본문이 통째로 잘린다 |
