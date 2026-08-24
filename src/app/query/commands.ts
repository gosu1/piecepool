// ══ 쿼리바 슬래시 명령 네 개 ══
//
// 입력창은 인박스 캡처와 같은 것을 쓴다(`src/lib/SlashBlockEditor.tsx`). 한글 조합 중에 메뉴가
// 엉뚱하게 뜨는 문제와 `http://` 의 슬래시를 명령으로 잘못 읽는 문제가 거기서 이미 해결돼 있다.
// 여기서는 그 메뉴에 띄울 항목과, 보낼 때 첫 글자가 슬래시면 명령으로 읽는 규칙만 정한다.
// 설계: "쿼리바 설계" §4.
//
// 명령 이름은 영문이고 메뉴에 뜨는 이름은 한글이다. 한쪽만 알아도 찾히도록 항목에 `alias` 를
// 붙인다 — `/lint` 로도 `/위키` 로도 같은 항목이 나온다(§4.3).

import type { SlashItem, SlashSection } from "../../lib/SlashBlockEditor";

export type QueryCommandName = "lint" | "new" | "sessions" | "help";

export interface QueryCommandSpec {
  name: QueryCommandName;
  /** 메뉴에 뜨는 이름 — 기존 메뉴(구분선·출처 링크)와 결을 맞춘 한글이다 */
  label: string;
  /** 한 줄 설명. `/help` 와 메뉴에서 같이 쓴다 */
  help: string;
  icon: string;
}

export const QUERY_COMMANDS: QueryCommandSpec[] = [
  { name: "lint", label: "위키에 반영", help: "지금까지 대화에서 위키에 넣을 내용을 골라 보여줍니다", icon: "↥" },
  { name: "new", label: "새 대화", help: "지금 대화를 접고 새로 시작합니다", icon: "+" },
  { name: "sessions", label: "지난 대화", help: "지난 대화를 골라서 이어갑니다", icon: "≡" },
  { name: "help", label: "도움말", help: "쓸 수 있는 명령을 보여줍니다", icon: "?" },
];

const SEC_COMMAND: SlashSection = { name: "명령", rank: 0 };

/** 슬래시 메뉴에 건네줄 항목. 고르면 `/lint ` 같은 글자만 입력창에 들어간다(§4.2). */
export const QUERY_SLASH_ITEMS: SlashItem[] = QUERY_COMMANDS.map((c) => ({
  label: c.label,
  alias: c.name,
  detail: `/${c.name}`,
  insert: `/${c.name} `,
  icon: c.icon,
  section: SEC_COMMAND,
}));

/**
 * 보낸 글이 명령인지 읽는다.
 *
 * 아는 명령일 때만 명령으로 본다. 오타(`/lnt`)나 슬래시로 시작하는 보통 문장은 그냥 질문으로
 * 넘긴다 — 앱이 "그런 명령 없습니다"로 막아서는 것보다, 물어본 대로 답하는 쪽이 덜 놀랍다.
 */
export function parseCommand(text: string): QueryCommandName | null {
  const m = /^\/([A-Za-z]+)/.exec(text.trim());
  if (!m) return null;
  const name = m[1].toLowerCase();
  return QUERY_COMMANDS.some((c) => c.name === name) ? (name as QueryCommandName) : null;
}
