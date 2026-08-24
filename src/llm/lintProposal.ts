// ══ /lint — 대화에서 위키에 넣을 내용을 뽑는다 ══
//
// 흐름은 셋이다. 후보 위키를 모으고(collectCandidates), AI 에게 정해진 틀로 한 번 물어보고,
// 돌아온 것을 실제 파일과 대조해 걸러낸다(validateProposals). 설계: "쿼리바 설계" §5.
//
// **AI 가 말한 파일명과 소제목을 그대로 믿지 않는다.** 없는 파일이나 없는 소제목을 대면
// 저장하는 순간에야 실패하는데, 그때는 사용자가 이미 체크박스를 고른 뒤다. 그래서 뽑아낸
// 직후에 후보 목록과 맞대보고 안 맞는 것은 화면에 올리기 전에 버린다.
//
// 새 위키 파일은 만들지 않는다(§2.6). 위키는 형식이 어느 정도 채워져야 만들어지는 문서라,
// 대화 도중 즉석으로 만들면 반쯤 빈 문서가 쌓인다. `/lint` 는 이미 있는 위키를 채우는 일만 한다.

import { chatJsonWithRetry, GEMINI_QUERY_MODEL, type ChatRetryDeps } from "./gemini";
import type { QueryTurn } from "./queryAgent";
import * as ipc from "../lib/ipc";
import { scanHeadings } from "../lib/noteSections";
import { appendSection, insertUnderSection, type InsertFailure } from "../lib/wikiInsert";

/** 글을 넣을 자리가 아닌 구역. 파인만은 자기 형식으로 읽고 쓰고, 근거는 PDF 임베드 목록이다. */
const CLOSED_SECTIONS = new Set(["파인만 기록", "근거"]);

/** 후보로 올릴 위키 수 상한. 넘으면 목록만으로 호출이 커진다(설계 §2.2 와 같은 이유). */
const CANDIDATE_LIMIT = 40;
/** AI 에게 넘길 대화 길이 상한 — 마지막 것부터 센다. */
const TURN_LIMIT = 12;
const TURN_CHARS = 2000;

const norm = (s: string): string => s.normalize("NFC").trim();

/** 넣을 자리를 고를 때 필요한 것은 본문이 아니라 소제목이다. 대화 내용은 이미 프롬프트에 있다. */
export interface LintCandidate {
  space: string;
  file: string;
  title: string;
  sections: string[];
}

export interface LintProposal {
  space: string;
  file: string;
  title: string;
  /** 넣을 소제목 */
  section: string;
  /** 넣을 글(마크다운 조각) */
  block: string;
  /** 왜 넣는지 — 체크박스 옆에 한 줄로 보여준다 */
  reason: string;
  /** 이미 있는 소제목 아래냐, 새로 만드는 소제목이냐 */
  kind: "under" | "new-section";
}

/** 문서에서 글을 넣을 수 있는 소제목만. */
function openSections(markdown: string): string[] {
  return scanHeadings(markdown)
    .filter((h) => h.level >= 2 && h.title && !CLOSED_SECTIONS.has(norm(h.title)))
    .map((h) => h.title);
}

/**
 * 후보 위키를 모은다.
 *
 * 이번 대화에서 실제로 열어 본 위키(`citedWiki`)가 있으면 그것만 본다. 대화가 다룬 주제가
 * 곧 그 위키들이기 때문이다. 비어 있으면 — AI 가 목록의 한 줄 요약만 보고 답한 경우다 —
 * 전체에서 고른다.
 */
export async function collectCandidates(citedWiki: string[] = []): Promise<LintCandidate[]> {
  const spaces = await ipc.listSpaces();
  const wanted = new Set(citedWiki.map(norm));
  const out: LintCandidate[] = [];

  for (const s of spaces) {
    const pages = await ipc.listWiki(s.slug).catch(() => []);
    for (const p of pages) {
      if (wanted.size > 0 && !wanted.has(norm(`${s.slug}/${p.path}`))) continue;
      out.push({ space: s.slug, file: p.path, title: p.title, sections: openSections(p.markdown) });
      if (out.length >= CANDIDATE_LIMIT) return out;
    }
  }
  return out;
}

const SYSTEM = [
  "너는 사용자의 개인 위키를 관리하는 편집자다.",
  "방금 나눈 대화에서 위키에 남길 가치가 있는 내용만 골라 어디에 넣을지 정해라.",
  "고를 것 — 대화에서 새로 확인된 사실, 사용자가 정한 결정, 헷갈리던 것을 가른 구분.",
  "고르지 말 것 — 이미 그 위키에 적혀 있는 내용, 잡담, 질문 자체, 출처 없는 추측.",
  "space 와 file 은 아래 위키 목록에 있는 값을 글자 그대로 써라. 목록에 없는 파일을 지어내지 마라.",
  "section 은 그 파일의 소제목 중 하나를 골라라. 마땅한 자리가 없을 때만 새 소제목 이름을 지어라.",
  "block 은 그 자리에 그대로 들어갈 마크다운이다. 한두 문장이나 짧은 목록으로 쓰고, 소제목(#)은 넣지 마라.",
  "reason 은 왜 넣는지 한 줄이다.",
  "넣을 것이 없으면 items 를 빈 배열로 둬라. 억지로 만들지 마라.",
  "한국어로 써라.",
].join(" ");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["space", "file", "section", "block", "reason"],
        properties: {
          space: { type: "string" },
          file: { type: "string" },
          section: { type: "string" },
          block: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s);

export function buildLintBody(turns: QueryTurn[], candidates: LintCandidate[], model = GEMINI_QUERY_MODEL) {
  const talk = turns
    .slice(-TURN_LIMIT)
    .map((t) => `${t.role === "user" ? "사용자" : "비서"}: ${clip(t.text, TURN_CHARS)}`)
    .join("\n");
  const list = candidates
    .map((c) => `${c.space}/${c.file} | ${c.title} | 소제목: ${c.sections.join(" · ") || "(없음)"}`)
    .join("\n");

  return JSON.stringify({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `[대화]\n${talk}\n\n[위키 목록]\n${list}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "LintProposals", strict: false, schema: SCHEMA } },
  });
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * 돌아온 제안을 후보와 맞대보고 걸러낸다.
 *
 * 여기를 지나온 제안은 반드시 진짜 있는 파일을 가리키고, `kind` 가 실제 소제목 유무와 맞는다.
 * 저장 단계에서 "그런 소제목이 없다"로 실패할 일이 없다는 뜻이다.
 */
export function validateProposals(raw: unknown, candidates: LintCandidate[]): LintProposal[] {
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];

  const byPath = new Map(candidates.map((c) => [norm(`${c.space}/${c.file}`), c]));
  const out: LintProposal[] = [];
  const seen = new Set<string>();

  for (const it of items) {
    const r = it as Record<string, unknown>;
    const c = byPath.get(norm(`${str(r.space)}/${str(r.file)}`));
    if (!c) continue; // 없는 파일을 지어냈다

    const section = str(r.section);
    const block = str(r.block);
    if (!section || !block) continue;
    if (CLOSED_SECTIONS.has(norm(section))) continue;

    const exists = c.sections.some((s) => norm(s) === norm(section));
    const key = `${c.space}/${c.file}#${norm(section)}\n${block}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      space: c.space,
      file: c.file,
      title: c.title,
      section,
      block,
      reason: str(r.reason),
      kind: exists ? "under" : "new-section",
    });
  }
  return out;
}

export interface LintDeps extends ChatRetryDeps {
  model?: string;
  /** 후보를 미리 구해 뒀을 때 — 화면이 두 번 읽지 않게 한다 */
  candidates?: LintCandidate[];
}

/** 대화에서 넣을 내용을 뽑는다. 넣을 것이 없으면 빈 배열이다. */
export async function proposeLint(
  turns: QueryTurn[],
  citedWiki: string[],
  apiKey: string,
  deps?: LintDeps,
): Promise<LintProposal[]> {
  const key = apiKey?.trim();
  if (!key) throw new Error("API key 필요 — 설정에서 Gemini 키를 넣어주세요");

  const candidates = deps?.candidates ?? (await collectCandidates(citedWiki));
  if (candidates.length === 0) return [];

  const raw = await chatJsonWithRetry("lint", key, buildLintBody(turns, candidates, deps?.model), deps);
  return validateProposals(raw, candidates);
}

const FAIL_MSG: Record<InsertFailure, string> = {
  "empty-block": "넣을 글이 비었습니다",
  "section-not-found": "그 소제목을 찾지 못했습니다",
  "feynman-section": "파인만 기록에는 넣지 않습니다",
  "section-exists": "같은 이름의 소제목이 이미 있습니다",
};

/**
 * 제안 하나를 위키에 반영한다.
 *
 * 원문을 고치는 경로가 없다 — `wikiInsert` 는 slice 로 자르고 사이에 넣기만 한다. 저장에
 * 실패하면 던진다. 화면은 성공한 것과 실패한 것을 나눠 보여준다.
 */
export async function applyProposal(p: LintProposal): Promise<void> {
  const page = await ipc.readWiki(p.space, p.file);
  const r =
    p.kind === "under"
      ? insertUnderSection(page.markdown, p.section, p.block)
      : appendSection(page.markdown, p.section, p.block);
  if (!r.ok) throw new Error(FAIL_MSG[r.reason]);
  await ipc.saveWiki(p.space, { ...page, markdown: r.markdown });
}
