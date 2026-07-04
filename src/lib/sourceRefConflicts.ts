import { parseWikilinks, parseEmbedTarget } from "./wikilink";
import type { SourceRef } from "./types";

// sourceRefs(frontmatter) ↔ 본문 embed 동기화 점검 (수용기준 §2.3, wikilink-embed 규약).
// 감지만 한다 — 자동 삭제/재작성 금지. 표시 책임은 UI(DocView 경고 배너).

export interface RefConflict {
  kind: "missing-embed" | "unregistered-embed"; // frontmatter에만 / 본문에만
  file: string;
  page?: number;
}

const key = (file: string, page?: number) => `${file}#${page ?? ""}`;

export function detectSourceRefConflicts(sourceRefs: SourceRef[], markdown: string): RefConflict[] {
  const bodyEmbeds = new Map<string, { file: string; page?: number }>();
  for (const t of parseWikilinks(markdown)) {
    if (t.kind !== "embed") continue;
    const { file, page } = parseEmbedTarget(t.value);
    bodyEmbeds.set(key(file, page), { file, page });
  }

  const refEmbeds = new Map<string, { file: string; page?: number }>();
  for (const r of sourceRefs) {
    if (r.embed) refEmbeds.set(key(r.file, r.page), { file: r.file, page: r.page });
  }

  const out: RefConflict[] = [];
  for (const [k, r] of refEmbeds) {
    if (!bodyEmbeds.has(k)) out.push({ kind: "missing-embed", ...r });
  }
  // 본문에만 있는 embed 는 sourceRefs 를 실제로 쓰는 페이지에서만 충돌로 본다 —
  // 수동 작성 페이지(refs 자체가 없음)의 이미지 embed 까지 경고로 도배하지 않기 위함.
  if (sourceRefs.length > 0) {
    for (const [k, e] of bodyEmbeds) {
      if (!refEmbeds.has(k)) out.push({ kind: "unregistered-embed", ...e });
    }
  }
  return out;
}
