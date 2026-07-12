// Obsidian 위키링크/embed 파싱 + 자체 remark 플러그인.
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
  return parseWikilinks(value).map((t) =>
    t.kind === "text"
      ? { type: "text", value: t.value }
      : {
          type: "link",
          url: (t.kind === "embed" ? "embed:" : "wiki:") + t.value,
          title: null,
          children: [{ type: "text", value: t.alias ?? t.value }],
        },
  );
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

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/** 본문의 첫 pdf/image 임베드 → 그 노트의 대표 원본. 없으면 null.
 *  노트↔원본은 1:1 이다(sanitizeSourceRefs 의 sourceId→file 맵이 1:1). */
export function firstEmbedFile(markdown: string): { file: string; type: "pdf" | "image" } | null {
  for (const t of parseWikilinks(markdown)) {
    if (t.kind !== "embed") continue;
    const { file } = parseEmbedTarget(t.value);
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "pdf") return { file, type: "pdf" };
    if (IMAGE_EXTS.has(ext)) return { file, type: "image" };
  }
  return null;
}
