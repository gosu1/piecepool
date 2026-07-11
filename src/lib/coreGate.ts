import { topicsForSelection, type SectionTopic } from "./noteSections";
import { getSectionStatus } from "../store/feynmanStore";
import { classifyCoreSections, type CoreTopicsDeps } from "../llm/coretopics";
import type { ArchiveNote } from "./types";

// ══ 핵심 주제 게이트 ══
//
// 핵심 주제는 사용자가 파인만에 **답하고 "이해했다" 고 해야** 위키가 된다.
// 설명하지 못한 개념이 위키가 되면, 그 위키는 "내가 아는 것" 이 아니라 "AI 가 아는 것" 이다.
//
// 무엇이 핵심인지는 Gemini 가 판단한다(coretopics.ts). 그 판정은 노트 내용의 해시로 캐시한다 —
// 같은 글을 볼 때마다 모델이 다르게 말하면 게이트가 변덕스러워지고, 사용자는 이유를 알 수 없다.
// 노트를 고치면 해시가 바뀌어 다시 판별한다(그때는 다시 묻는 게 맞다).
//
// 막지 못하는 것보다 잘못 막는 것이 나쁘다 → 판정을 못 받으면(키 없음·호출 실패) 걸지 않는다.

export interface GateVerdict {
  blocked: boolean;
  /** 아직 답하지 않은 핵심 주제 제목들 — 사용자에게 어디로 가야 하는지 알려준다 */
  missing: string[];
  engine: "gemini" | "cache" | "none";
}

const CACHE_PREFIX = "core-topics:";
const PASS: GateVerdict = { blocked: false, missing: [], engine: "none" };

interface Cached {
  hash: string;
  core: boolean[];
}

/** djb2 — 노트 내용이 그대로면 다시 묻지 않는다. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function ls(storage?: Pick<Storage, "getItem" | "setItem">) {
  return storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
}

function readCache(store: ReturnType<typeof ls>, sourceId: string, h: string, n: number): boolean[] | null {
  try {
    const raw = store?.getItem(CACHE_PREFIX + sourceId);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (c?.hash !== h || !Array.isArray(c.core) || c.core.length !== n) return null;
    return c.core.map((v) => v === true);
  } catch {
    return null; // 손상된 캐시는 없는 것과 같다
  }
}

/**
 * 게이트가 보는 주제들 = 노트의 **최상위 섹션**.
 * 보통은 `##` 이고, 하위 `###` 는 그 안에 딸린다(`##` 하나를 파인만하면 소주제까지 함께 묻는다).
 * 다만 `##` 없이 `###` 만 쓴 노트도 있다 — 그때는 그 `###` 들이 최상위다.
 * `##` 만 보면 그런 노트는 게이트가 통째로 비어 무조건 통과한다.
 */
export function coreCandidates(markdown: string): SectionTopic[] {
  const all = topicsForSelection(markdown, 0, markdown.length);
  const h2 = all.filter((t) => t.level === 2);
  const orphans = all.filter((t) => t.level === 3 && !h2.some((p) => p.from <= t.from && t.from < p.to));
  return [...h2, ...orphans].sort((a, b) => a.from - b.from);
}

export async function checkCoreGate(
  note: ArchiveNote,
  apiKey: string,
  deps?: { storage?: Pick<Storage, "getItem" | "setItem">; llm?: CoreTopicsDeps },
): Promise<GateVerdict> {
  const topics = coreCandidates(note.markdown);
  if (!topics.length) return PASS; // `##` 이 없는 노트 — 나눌 주제가 없으니 막을 것도 없다

  const store = ls(deps?.storage);
  const h = hash(note.markdown);
  let core = readCache(store, note.sourceId, h, topics.length);
  let engine: GateVerdict["engine"] = "cache";

  if (!core) {
    const r = await classifyCoreSections(
      note.title,
      topics.map((t) => ({ heading: t.title, excerpt: t.text })),
      apiKey,
      deps?.llm,
    );
    if (r.engine === "none") return PASS; // 판정을 못 받았다 — 걸지 않는다
    core = r.core;
    engine = "gemini";
    try {
      store?.setItem(CACHE_PREFIX + note.sourceId, JSON.stringify({ hash: h, core } satisfies Cached));
    } catch {
      /* 캐시 실패는 무해 — 다음에 다시 묻는다 */
    }
  }

  // 답했고(answered) 이해했다고 선언한(understood) 핵심 주제만 통과. 판정은 오직 사용자.
  const missing = topics
    .filter((_, i) => core![i])
    .filter((t) => {
      const st = getSectionStatus(note.sourceId, t.key);
      return !(st.answered && st.understood);
    })
    .map((t) => t.title);

  return { blocked: missing.length > 0, missing, engine };
}

/**
 * 사용자에게 보여줄 한 줄 — 어느 주제가 막고 있는지, 어디로 가야 하는지 말해준다.
 * 파인만 버튼은 **편집 모드 에디터**의 제목 줄에만 뜬다. 읽기 모드에서 "제목에 마우스를 올리라"고
 * 하면 없는 버튼을 찾게 만든다 — 안내는 사실이어야 한다.
 */
export function gateMessage(missing: string[]): string {
  const head = missing
    .slice(0, 2)
    .map((m) => `"${m}"`)
    .join(", ");
  const rest = missing.length > 2 ? ` 외 ${missing.length - 2}개` : "";
  return `핵심 주제를 먼저 설명해보세요 — ${head}${rest} ([편집] 을 누르고 제목에 마우스를 올리면 파인만 버튼이 떠요)`;
}
