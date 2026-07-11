// 콜아웃(> [!easy] …) 파서 + remark 플러그인 — CM6(cmCallout)·markdown.tsx·테스트에서 공용.
// 문법: 첫 줄 `> [!타입] 제목?`, 이어지는 `> ` 줄들. 규약: docs/40-frontend/markdown-callout-math.md

export const CALLOUT_TYPES = { easy: "쉬운 설명", note: "노트" } as const;
export type CalloutType = keyof typeof CALLOUT_TYPES;

export interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
  [k: string]: unknown;
}

const MARKER = /^\[!(\w+)\]\s*(.*)$/;

export function parseCalloutMarker(firstLine: string): { type: CalloutType; title: string } | null {
  const m = MARKER.exec(firstLine.trim());
  if (!m || !(m[1] in CALLOUT_TYPES)) return null;
  const type = m[1] as CalloutType;
  return { type, title: m[2] || CALLOUT_TYPES[type] };
}

// ── mdast 변환(react-markdown 용) — [!easy] 인용문을 details/summary 로 (hName 힌트, rehype-raw 불필요) ──

function transform(quote: MdNode): void {
  const firstPara = quote.children?.[0];
  const firstText = firstPara?.children?.[0];
  if (firstPara?.type !== "paragraph" || firstText?.type !== "text" || typeof firstText.value !== "string") return;
  const nl = firstText.value.indexOf("\n");
  const firstLine = nl === -1 ? firstText.value : firstText.value.slice(0, nl);
  const marker = parseCalloutMarker(firstLine);
  if (!marker) return;

  // 마커 줄 제거 — 남는 내용이 없으면 첫 문단 자체를 비운다
  if (nl === -1) {
    firstPara.children!.shift();
    if (firstPara.children!.length === 0) quote.children!.shift();
  } else {
    firstText.value = firstText.value.slice(nl + 1);
  }

  const summary: MdNode = {
    type: "paragraph",
    data: { hName: marker.type === "easy" ? "summary" : "div", hProperties: { className: ["pp-callout-title"] } },
    children: [{ type: "text", value: marker.title }],
  };
  quote.children!.unshift(summary);
  quote.data = {
    hName: marker.type === "easy" ? "details" : "div",
    hProperties: { className: ["pp-callout", `pp-callout-${marker.type}`] },
  };
}

function walk(node: MdNode): void {
  if (node.type === "blockquote") transform(node);
  node.children?.forEach(walk);
}

export function remarkCallout() {
  return (tree: MdNode) => walk(tree);
}
