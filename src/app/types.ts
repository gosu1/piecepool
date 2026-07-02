// PiecePoolApp 이 소유하던 공유 타입/헬퍼 — 섹션 · ⌘K 검색 항목 · 문서 키.

// 상단 섹션
export type Section = "inbox" | "wiki" | "source" | "graph";

// ⌘K 검색 항목 (제목 + 본문 전문 검색)
export interface SearchItem {
  kind: "wiki" | "archive";
  space: string;
  spaceName: string;
  file: string;
  title: string;
  body: string;
}

export const docKey = (space: string, path: string) => `${space}:${path}`;
