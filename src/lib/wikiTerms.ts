// 본문 속 위키 개념 키워드 매칭 — 표시 계층 전용(본문 비파괴).
// 에디터(cmWikiTerm)·읽기 모드(remarkWikiTerm)가 같은 규칙을 공유한다.
// 스펙: docs/superpowers/specs/2026-07-16-pdf-auto-pipeline-wiki-terms-design.md §4.

export interface TermMatch {
  from: number;
  to: number;
  title: string; // canonical 위키 제목 (매치 표면형이 대소문자 달라도 원 제목)
}

export interface TermMatcher {
  regex: RegExp; // 후보 "위치" 탐색용 — 확정은 titles 를 같은 위치에서 긴 것부터 대조
  titles: string[]; // canonical 제목, 길이 내림차순
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
  return { regex: new RegExp(`(?:${esc.join("|")})`, "gi"), titles: list };
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
  const lower = text.toLowerCase();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const from = m.index;
    const prev = text[from - 1];
    let hit: TermMatch | null = null;
    if (prev === undefined || !WORD.test(prev)) {
      // 정규식은 이 위치의 최장 후보만 알려준다 — 그 후보가 경계·제외에서 떨어져도
      // 같은 위치의 더 짧은 제목("스레드 풀링" 속 "스레드")은 유효할 수 있어 전부 대조한다.
      for (const t of matcher.titles) {
        const to = from + t.length;
        if (to > text.length || lower.slice(from, to) !== t.toLowerCase()) continue;
        if (!okAfter(text, to)) continue;
        if (excluded.some((r) => from < r.to && to > r.from)) continue;
        hit = { from, to, title: t };
        break; // titles 는 길이 내림차순 — 첫 통과가 최장 일치
      }
    }
    if (hit) {
      out.push(hit);
      re.lastIndex = hit.to;
    } else {
      re.lastIndex = from + 1;
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
