import { normalizeTitle } from "./llmApply";

// ══ 노트의 ##/### 섹션 판별 — 파인만의 대상 단위 ══
//
// 파인만은 노트 전체가 아니라 "주제" 하나를 붙잡고 설명하게 한다. 그 주제의 경계를
// 마크다운 헤딩(제목2/제목3)으로 삼는다. 사용자가 에디터에서 헤딩이나 그 아래 본문을
// 드래그하면, 선택이 걸친 섹션들을 이 함수가 뽑아낸다.
//
// lezer syntaxTree 를 쓰지 않는 이유: 섹션 본문은 선택 범위 밖으로 뻗어나가는데
// syntaxTree 는 뷰포트 밖에서 미완성 파스일 수 있다. 게다가 순수 문자열 함수여야
// vitest 에 EditorState 구성 없이 바로 걸린다.

export interface SectionTopic {
  level: 2 | 3;
  /** 헤딩 텍스트(강조 마커 제거) */
  title: string;
  /** normalizeTitle(title) — 위키 개념 제목과 맞대볼 때 쓴다 */
  slug: string;
  /**
   * 학습 상태(statuses)의 키 성분. slug 와 다르다 — 한 노트에 같은 제목의 소주제가
   * 여럿 있는 건 흔하다("예시", "정리"). slug 만으로 키를 만들면 설명하지도 않은
   * 섹션이 "이해함"으로 조회된다. 같은 slug 의 n 번째 출현이면 `slug~n` 을 쓴다.
   */
  key: string;
  /** 헤딩 줄 시작 오프셋 */
  from: number;
  /** 섹션 끝(배타) — level 이 같거나 더 높은 다음 헤딩 직전, 없으면 EOF */
  to: number;
  /** md.slice(from, to) — `##` 이면 하위 `###` 본문을 전부 포함한다 */
  text: string;
}

interface Heading {
  level: number;
  title: string; // 빈 문자열일 수 있다(`## ` 만 있는 줄) — 주제는 아니지만 섹션 경계다
  key: string;
  from: number;
}

// CommonMark: ATX 헤딩은 앞 공백 3칸까지 허용된다(4칸이면 코드 블록). 에디터도 그렇게 렌더한다.
const ATX = /^ {0,3}(#{1,6})(?:\s+(.*))?$/;
const FENCE = /^ {0,3}(```|~~~)/;

/**
 * 헤딩에서 강조 마커만 벗긴다. `_` 는 건드리지 않는다 —
 * `max_pooling` 같은 식별자가 제목에 흔한데, 지우면 `maxpooling` 이 되어 개념이 어긋난다.
 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/[*`~]/g, "")
    .replace(/\s+#+\s*$/, "") // closing ATX (`## 제목 ##`)
    .trim();
}

/** djb2 — 같은 제목이 여럿일 때 그 섹션을 위치가 아니라 내용으로 가린다. */
function hash8(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** 문서의 모든 ATX 헤딩. 코드 펜스 안의 `#` 는 헤딩이 아니다. Setext(`===`)는 비지원. */
function scanHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  let offset = 0;
  let fenced = false;
  for (const line of md.split("\n")) {
    // CRLF: JS 정규식의 `.` 은 \r(줄 종결자)을 매치하지 않아 `$` 가 어긋난다 → 먼저 벗긴다.
    const text = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (FENCE.test(text)) fenced = !fenced;
    else if (!fenced) {
      const m = ATX.exec(text);
      if (m) {
        const title = cleanTitle(m[2] ?? "");
        out.push({ level: m[1].length, title, key: normalizeTitle(title), from: offset });
      }
    }
    offset += line.length + 1; // +1 = "\n" — 오프셋은 원본 기준(\r 포함)
  }

  // 제목이 겹치는 섹션은 slug 만으로 가릴 수 없다("예시", "정리"). 순번(`slug~0,1,2`)을 붙이면
  // 앞의 것을 지우거나 같은 제목을 끼워 넣을 때 번호가 밀려, 설명한 적 없는 섹션이 남의 판정을
  // 물려받거나(게이트가 헛되이 열린다) 이해했던 섹션이 판정을 잃는다.
  // → 겹칠 때만 그 섹션의 **내용**으로 가린다. 위치가 바뀌어도 흔들리지 않는다.
  const dup = new Map<string, number>();
  for (const h of out) dup.set(h.key, (dup.get(h.key) ?? 0) + 1);
  for (let i = 0; i < out.length; i++) {
    if ((dup.get(out[i].key) ?? 0) < 2) continue;
    const end = sectionEnd(out, i, md.length);
    out[i] = { ...out[i], key: `${out[i].key}~${hash8(md.slice(out[i].from, end))}` };
  }
  return out;
}

/** 헤딩 h 의 섹션 끝 = level ≤ h.level 인 다음 헤딩의 시작. 없으면 EOF. */
function sectionEnd(headings: Heading[], i: number, len: number): number {
  for (let j = i + 1; j < headings.length; j++) {
    if (headings[j].level <= headings[i].level) return headings[j].from;
  }
  return len;
}

function toTopic(h: Heading, to: number, md: string): SectionTopic {
  return {
    level: h.level as 2 | 3,
    title: h.title,
    slug: normalizeTitle(h.title),
    key: h.key,
    from: h.from,
    to,
    text: md.slice(h.from, to),
  };
}

/** 제목 없는 `## ` 줄은 섹션 경계이긴 하지만 설명할 주제가 못 된다. */
const isTopic = (h: Heading) => (h.level === 2 || h.level === 3) && !!h.title;

/**
 * 노트 전체를 파인만 대상으로 삼는다 — "이 글 전체를 설명해보겠다" 버튼용.
 * 헤딩이 없는 노트(막 쓴 메모)면 글 전체가 주제 하나다.
 */
export function wholeNoteTopics(md: string, noteTitle: string): SectionTopic[] {
  const ts = topicsForSelection(md, 0, md.length);
  if (ts.length) return ts;
  if (!md.trim()) return [];
  const title = noteTitle.trim() || "이 노트";
  const slug = normalizeTitle(title);
  return [{ level: 2, title, slug, key: slug, from: 0, to: md.length, text: md }];
}

/**
 * 선택 범위 [from, to] 가 걸친 파인만 주제 목록. 문서 순서.
 *
 * - `###` 하나가 선택 전체를 품으면 → 그 소주제 하나만.
 * - 그 외에는 선택과 겹치는 모든 `##` 을 [자신, 하위 `###`…] 로 펼친다.
 *   (`## attention` 을 드래그하면 attention + 소주제 전부가 대상이라는 뜻)
 * - `#`(H1)은 문서 루트이지 주제가 아니다. 헤딩 없는 서두만 선택하면 빈 배열.
 * - 빈 선택(드래그 없이 우클릭)은 그 지점을 품는 최내곽 섹션.
 */
export function topicsForSelection(md: string, from: number, to: number): SectionTopic[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const headings = scanHeadings(md);
  const ends = headings.map((_, i) => sectionEnd(headings, i, md.length));

  // 빈 선택(드래그 없이 우클릭)은 "점을 품는 섹션", 그 외는 "구간이 겹치는 섹션".
  // 경계에서 끝나는 선택이 다음 섹션까지 삼키지 않도록 반열림 구간으로 판정한다.
  const empty = lo === hi;
  const point = Math.min(lo, Math.max(0, md.length - 1));
  const hits = (i: number) =>
    empty ? headings[i].from <= point && point < ends[i] : headings[i].from < hi && ends[i] > lo;

  // ### 하나가 선택 전체를 품으면 그것만 — 소주제만 드래그한 경우.
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].level !== 3 || !isTopic(headings[i]) || !hits(i)) continue;
    if (headings[i].from <= lo && hi <= ends[i]) return [toTopic(headings[i], ends[i], md)];
  }

  const out: SectionTopic[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (!isTopic(h) || !hits(i)) continue; // H1·H4+·제목 없는 헤딩은 주제가 아니다
    // ## 의 하위 ### 는 부모가 이미 펼쳐 담는다 — 중복 방지.
    if (h.level === 3 && out.some((t) => t.level === 2 && t.from <= h.from && h.from < t.to)) continue;
    out.push(toTopic(h, ends[i], md));
    if (h.level === 2) {
      for (let j = i + 1; j < headings.length && headings[j].level > 2; j++) {
        if (headings[j].level === 3 && isTopic(headings[j])) out.push(toTopic(headings[j], ends[j], md));
      }
    }
  }
  return out;
}
