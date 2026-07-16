// ══ 마크다운 헤딩 스캔 + 위키 표시 전처리 ══
//
// 코드 펜스를 인식해 ATX 헤딩을 찾고(scanHeadings), 위키 표시에서 `## 근거`(PDF 임베드)를
// 걷어낸다(stripEvidenceSection). 저장 데이터는 건드리지 않는다 — 표시 전용이다.
//
// 순수 문자열 함수다. lezer syntaxTree 를 쓰지 않는 이유: 섹션 본문은 선택 범위 밖으로
// 뻗어나가는데 syntaxTree 는 뷰포트 밖에서 미완성 파스일 수 있다. 게다가 순수 함수여야
// vitest 에 EditorState 구성 없이 바로 걸린다.

export interface Heading {
  level: number;
  title: string; // 빈 문자열일 수 있다(`## ` 만 있는 줄) — 섹션 경계이긴 하다
  from: number;
}

// CommonMark: ATX 헤딩은 앞 공백 3칸까지 허용된다(4칸이면 코드 블록). 에디터도 그렇게 렌더한다.
const ATX = /^ {0,3}(#{1,6})(?:\s+(.*))?$/;
export const FENCE = /^ {0,3}(```|~~~)/;
// 한 줄 전체가 PDF 임베드인 경우 — `![[….pdf]]`·`![[….pdf#page=N]]`. 이미지 임베드(png 등)는 제외.
const PDF_EMBED_LINE = /^[ \t]*!\[\[[^\]]*\.pdf(?:#page=\d+)?\]\][ \t]*$/i;

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

/** 문서의 모든 ATX 헤딩. 코드 펜스 안의 `#` 는 헤딩이 아니다. Setext(`===`)는 비지원. */
export function scanHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  let offset = 0;
  let open: string | null = null;
  for (const line of md.split("\n")) {
    // CRLF: JS 정규식의 `.` 은 \r(줄 종결자)을 매치하지 않아 `$` 가 어긋난다 → 먼저 벗긴다.
    const text = line.endsWith("\r") ? line.slice(0, -1) : line;
    const marker = FENCE.exec(text)?.[1];
    if (marker) {
      // 여는 마커와 같은 종류만 닫는다 — 다른 종류는 코드블록 안의 내용일 뿐이다.
      if (!open) open = marker;
      else if (marker === open) open = null;
    } else if (!open) {
      const m = ATX.exec(text);
      if (m) out.push({ level: m[1].length, title: cleanTitle(m[2] ?? ""), from: offset });
    }
    offset += line.length + 1; // +1 = "\n" — 오프셋은 원본 기준(\r 포함)
  }
  return out;
}

/** 헤딩 h 의 섹션 끝 = level ≤ h.level 인 다음 헤딩의 시작. 없으면 EOF. */
export function sectionEnd(headings: Heading[], i: number, len: number): number {
  for (let j = i + 1; j < headings.length; j++) {
    if (headings[j].level <= headings[i].level) return headings[j].from;
  }
  return len;
}

/**
 * 위키 본문에서 원문 PDF 노출을 표시에서만 걷어낸다 — 저장 데이터는 건드리지 않는다.
 *
 * 두 경로를 모두 커버한다: ① LLM 경로가 만드는 `## 근거`(레벨2, 제목 "근거") 섹션 통째,
 * ② 휴리스틱(키 없음) 경로가 `## 근거` 없이 본문에 인라인으로 박는 단독 라인 PDF 임베드.
 * frontmatter sourceRefs 는 그대로라 sourceRefs↔embed 계약 점검(원본 마크다운 기준)에는
 * 영향이 없다. 코드펜스 안의 헤딩·임베드는 실제 콘텐츠가 아니므로 건드리지 않는다.
 */
export function stripEvidenceSection(md: string): string {
  // ① `## 근거` 섹션 통째 제거 — 뒤에서부터 잘라야 앞 구간 오프셋이 밀리지 않는다.
  const headings = scanHeadings(md);
  const cuts = headings
    .map((h, i): [number, number] | null =>
      h.level === 2 && h.title === "근거" ? [h.from, sectionEnd(headings, i, md.length)] : null,
    )
    .filter((x): x is [number, number] => x !== null)
    .reverse();
  let out = md;
  for (const [from, to] of cuts) out = out.slice(0, from) + out.slice(to);

  // ② 코드펜스 밖의 단독 라인 PDF 임베드 제거(이미지 임베드는 보존).
  let fenced = false;
  out = out
    .split("\n")
    .filter((line) => {
      const t = line.endsWith("\r") ? line.slice(0, -1) : line; // CRLF: \r 벗겨 판정
      if (FENCE.test(t)) {
        fenced = !fenced;
        return true;
      }
      return fenced || !PDF_EMBED_LINE.test(t);
    })
    .join("\n");

  // 아무것도 안 걷어냈으면 원문 그대로, 걷어냈으면 빈 줄 과다 정리(3+ → 2).
  return out === md ? md : out.replace(/\n{3,}/g, "\n\n");
}
