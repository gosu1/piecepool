// 위키링크/embed 파싱 + 자체 remark 플러그인.
// 규약: docs/10-contracts/wikilink-embed.md. markdown.tsx 와 테스트에서 공용.

export interface WikilinkToken {
  kind: "text" | "link" | "embed";
  value: string; // text: 원문, link/embed: 대상(target)
  alias?: string; // [[대상|별칭]] 의 별칭
}

const WIKILINK = /(!?)\[\[([^\]]+)\]\]/g;

/** 한 줄/텍스트를 text/link/embed 토큰으로 분해. */
export function parseWikilinks(value: string): WikilinkToken[] {
  const out: WikilinkToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  WIKILINK.lastIndex = 0;
  while ((m = WIKILINK.exec(value)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: value.slice(last, m.index) });
    const embed = m[1] === "!";
    const [target, alias] = m[2].split("|");
    out.push({ kind: embed ? "embed" : "link", value: target.trim(), alias: alias?.trim() });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ kind: "text", value: value.slice(last) });
  return out.length ? out : [{ kind: "text", value }];
}

/** `file#page=N` → { file, page }. page 는 1-indexed 정수만. */
export function parseEmbedTarget(target: string): { file: string; page?: number } {
  const [file, frag] = target.split("#");
  if (frag?.startsWith("page=")) {
    const n = Number(frag.slice(5));
    if (Number.isInteger(n) && n >= 1) return { file, page: n };
  }
  return { file };
}

// ── mdast 노드(react-markdown 용) — 텍스트의 [[..]]/![[..]] 를 link 노드(url 프로토콜 표식)로 치환 ──
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
  [k: string]: unknown;
}

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

function walk(node: MdNode): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string" && child.value.includes("[[")) {
      next.push(...expand(child.value));
    } else {
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

export function remarkWikilink() {
  return (tree: MdNode) => walk(tree);
}

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

/** 본문의 첫 pdf/image 임베드 → 그 노트의 대표 원본. 없으면 null.
 *  노트↔원본은 1:1 이다(sanitizeSourceRefs 의 sourceId→file 맵이 1:1). */
export function firstEmbedFile(markdown: string): { file: string; type: "pdf" | "image" } | null {
  for (const t of parseWikilinks(markdown)) {
    if (t.kind !== "embed") continue;
    const { file } = parseEmbedTarget(t.value);
    const ext = extOf(file);
    if (ext === "pdf") return { file, type: "pdf" };
    if (IMAGE_EXTS.has(ext)) return { file, type: "image" };
  }
  return null;
}

/** original-files 에 사는 원본(pdf + 이미지)인가 — firstEmbedFile 과 같은 확장자 규칙. */
function isOriginalFile(file: string): boolean {
  const ext = extOf(file);
  return ext === "pdf" || IMAGE_EXTS.has(ext);
}

/** 이 노트가 가진 원본 파일들 = 본문 임베드 대상 중 원본(pdf·이미지)인 것. 중복 제거, 등장 순.
 *  [[링크]]는 참조일 뿐 업로드가 아니므로 이동·삭제 대상이 아니다(이름만 따라 바뀐다).
 *  refSource(초안이 추적하는 PDF)는 방어적으로 포함 — 사용자가 임베드만 지웠어도 파일은 남아 있다.
 *  노트가 죽거나 옮겨갈 때 원본 전부가 따라가야 한다 — PDF 하나만 챙기면 이미지가 디스크에 샌다. */
export function noteOriginalFiles(body: string, refSource = ""): string[] {
  const out: string[] = [];
  for (const t of parseWikilinks(body)) {
    if (t.kind !== "embed") continue;
    const { file } = parseEmbedTarget(t.value);
    if (isOriginalFile(file) && !out.includes(file)) out.push(file);
  }
  if (refSource && !out.includes(refSource)) out.push(refSource);
  return out;
}

/** 본문에서 그 원본을 가리키는 모든 참조의 파일명을 바꾼다(원본 이동·충돌 리네임 시).
 *  네 형태 모두: ![[f]] · ![[f#page=N]] · [[f]] · [[f#page=N]] (별칭 [[f|별칭]] 포함).
 *  대괄호 토큰 전체를 맞춘다 — a.pdf 를 바꿔도 aa.pdf 는 건드리지 않는다.
 *  파일명은 백엔드가 slug 화하지만 믿지 않고 정규식 메타문자를 이스케이프한다. */
export function renameRefs(body: string, from: string, to: string): string {
  if (from === to) return body;
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(!?\\[\\[)${esc}((?:#[^\\]|]*)?(?:\\|[^\\]]*)?)\\]\\]`, "g");
  return body.replace(re, (_m, open: string, rest: string) => `${open}${to}${rest}]]`);
}
