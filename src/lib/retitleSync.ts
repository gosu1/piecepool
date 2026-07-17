// ══ 위키 제목 변경 → 본문 동기화 ══
//
// rename_wiki 는 frontmatter title 만 바꾼다. 링크 해석(findWiki)은 제목 매칭이므로
// 다른 위키 본문의 [[옛제목]] 이 전부 고아가 되고, 해당 페이지 선두 H1 "# 옛제목" 은
// 새 제목과 이중 표시된다. 여기 헬퍼는 위키 본문만 고친다 — 노트(archive)는 사용자
// 원문이라 절대 수정하지 않는다(workspace-layout.md).

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 본문의 [[from]] → [[to]]. 정확 일치만(별칭·앵커 변형은 그대로).
 *  ![[...]] 임베드는 소스 파일 참조라 건드리지 않는다(wikilink-embed.md). */
export function retitleWikilinks(body: string, from: string, to: string): string {
  if (from === to) return body;
  const re = new RegExp(`(!?)\\[\\[${escapeRe(from)}\\]\\]`, "g");
  return body.replace(re, (m, bang: string) => (bang ? m : `[[${to}]]`));
}

/** 본문 선두(첫 비어있지 않은 줄) H1 이 "# from" 이면 "# to" 로 — 제목 이중 표시 방지.
 *  그 외 위치의 H1·다른 제목은 그대로 둔다. */
export function retitleLeadingH1(body: string, from: string, to: string): string {
  if (from === to) return body;
  const lines = body.split("\n");
  const i = lines.findIndex((l) => l.trim() !== "");
  if (i === -1 || lines[i].trim() !== `# ${from}`) return body;
  lines[i] = lines[i].replace(`# ${from}`, `# ${to}`);
  return lines.join("\n");
}
