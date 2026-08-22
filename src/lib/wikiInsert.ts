// ══ 위키 본문에 글을 끼워 넣는다 — 원래 글자는 한 자도 바꾸지 않는다 ══
//
// 쿼리바 `/lint` 가 승인된 제안을 위키에 반영할 때 쓰는 유일한 경로다.
//
// 왜 따로 만드는가: 기존 병합 경로(mergeWiki.ts)는 원문 전체를 LLM 에게 주고 한 편의 글로
// 다시 쓰게 한다. 그 파일 주석이 한계를 이렇게 적어두었다 — "사용자가 위키 편집기로 직접 쓴
// 문단을 건드리지 말라고 프롬프트로 지시하지만, 그것은 지시일 뿐 보장이 아니다."
//
// 여기서는 지시가 아니라 구조로 막는다. 이 모듈은 LLM 을 부르지 않고, 원문을 slice 로 자르기만
// 한다. 결과는 언제나 `md.slice(0, at) + chunk + md.slice(at)` 이므로 원문 글자가 바뀔 수 있는
// 경로 자체가 없다. wikiInsert.test.ts 가 그 항등식을 자리 대조로 검증한다.
//
// SSOT: 설계 문서 "쿼리바 설계" §5.2~5.4.

import { scanHeadings, sectionEnd, type Heading } from "./noteSections";

/** 파인만 기능이 자기 형식으로 읽고 쓰는 구역. 다른 글이 섞이면 파싱이 깨진다. */
const FEYNMAN_SECTION = "파인만 기록";

export type InsertFailure =
  | "empty-block" // 넣을 글이 비었다
  | "section-not-found" // 그런 소제목이 없다
  | "feynman-section" // 파인만 기록 구역은 대상이 아니다
  | "section-exists"; // (새 섹션 추가) 같은 이름이 이미 있다

export type InsertResult =
  | {
      ok: true;
      /** 끼워 넣은 결과 */
      markdown: string;
      /** 원문에서 끼워 넣은 지점(문자 오프셋) */
      at: number;
      /** 실제로 끼워 넣은 덩어리. 줄바꿈 포함 — 테스트 항등식의 기준 */
      chunk: string;
    }
  | { ok: false; reason: InsertFailure };

/** 제목 비교용 정규화 — NFC + 앞뒤 공백 제거. 대소문자는 건드리지 않는다(한글 제목이 기본). */
const norm = (s: string): string => s.normalize("NFC").trim();

/** 문서가 쓰는 줄바꿈. 원문에 CRLF 가 하나라도 있으면 CRLF 로 맞춘다. */
const eolOf = (md: string): string => (md.includes("\r\n") ? "\r\n" : "\n");

/** 섹션 끝(다음 헤딩 시작)에서 뒤로 물러나, 마지막 내용 글자 바로 뒤를 찾는다. */
function lastContentOffset(md: string, end: number): number {
  let at = end;
  while (at > 0 && /\s/.test(md[at - 1])) at--;
  return at;
}

/** 헤딩 목록에서 제목이 일치하는 소제목(level ≥ 2)을 찾는다. */
function findSection(headings: Heading[], section: string): number {
  const want = norm(section);
  return headings.findIndex((h) => h.level >= 2 && norm(h.title) === want);
}

/**
 * `section` 소제목의 마지막 내용 줄 뒤에 `block` 을 끼워 넣는다.
 *
 * 끼워 넣는 자리는 그 섹션의 마지막 글자 바로 뒤다 — 다음 소제목 앞의 빈 줄은 그대로 남으므로
 * 새 글과 다음 소제목 사이 간격이 유지된다.
 *
 * `block` 은 줄바꿈으로 감싸지 않은 상태로 넘긴다. 앞에 줄바꿈 하나만 붙여 새 줄에서 시작시킨다.
 */
export function insertUnderSection(md: string, section: string, block: string): InsertResult {
  const body = block.trim();
  if (!body) return { ok: false, reason: "empty-block" };
  if (norm(section) === FEYNMAN_SECTION) return { ok: false, reason: "feynman-section" };

  const headings = scanHeadings(md);
  const i = findSection(headings, section);
  if (i === -1) return { ok: false, reason: "section-not-found" };

  const at = lastContentOffset(md, sectionEnd(headings, i, md.length));
  const chunk = eolOf(md) + body;
  return { ok: true, markdown: md.slice(0, at) + chunk + md.slice(at), at, chunk };
}

/**
 * 문서 끝에 새 소제목(level 2)을 만들고 `block` 을 넣는다.
 *
 * `## 파인만 기록` 이 있으면 그 앞에 넣는다 — 기록은 항상 문서 맨 뒤에 남아야 파인만 기능이
 * 자기 구역을 잘라내고 붙이는 왕복이 어긋나지 않는다.
 */
export function appendSection(md: string, title: string, block: string): InsertResult {
  const body = block.trim();
  const name = norm(title);
  if (!body) return { ok: false, reason: "empty-block" };
  if (name === FEYNMAN_SECTION) return { ok: false, reason: "feynman-section" };

  const headings = scanHeadings(md);
  if (findSection(headings, name) !== -1) return { ok: false, reason: "section-exists" };

  const feynman = headings.find((h) => norm(h.title) === FEYNMAN_SECTION);
  const at = lastContentOffset(md, feynman ? feynman.from : md.length);
  const eol = eolOf(md);
  const chunk = `${eol}${eol}## ${name}${eol}${eol}${body}`;
  return { ok: true, markdown: md.slice(0, at) + chunk + md.slice(at), at, chunk };
}
