import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "./gemini";

// 파인만 — 사용자가 개념을 자기 말로 설명하면, LLM 이 그 설명의 구멍을 짚어 되묻는다.
// 설계: docs/superpowers/specs/2026-07-10-feynman-clarify-design.md
//
// 왜 선택지가 아니라 자유 설명인가:
//   설명 깊이의 착각(Rozenblit & Keil, 2002)은 "설명적 지식"에서 가장 강하고,
//   깨는 방법은 직접 설명하게 시키는 것뿐이다. 선택지 클릭은 착각을 강화한다.
//
// 불변 제약 (프롬프트에 강제):
//   1. 답을 주지 않는다 — 개념의 정의·정답을 문장에 담지 않는다.
//   2. 한 번에 구멍 하나만 짚는다.
//   3. 판정하지 않는다 — "충분/부족" 을 말하지 않는다. 판정은 사용자 몫이다.
//   4. 한국어 한 문장으로 되묻는다.

/** 파인만 질문이 겨냥하는 구멍의 종류. UI 가 아이콘/톤을 바꾸는 데 쓸 수 있다. */
export type GapKind = "why" | "term" | "example" | "contradiction";

export interface Probe {
  probe: string; // 되물음 한 문장
  targetGap: GapKind;
}

/** 한 라운드의 대화. user = 사용자의 설명, probe = LLM 의 되물음. */
export interface Turn {
  role: "user" | "probe";
  text: string;
}

export interface FeynmanDeps {
  fetchFn?: typeof fetch;
  endpoint?: string;
  model?: string;
  maxRetries?: number; // gemini.ts 와 같은 규약(기본 2)
  backoffMs?: number; // 0 = 즉시(테스트용)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 429·5xx·네트워크만 재시도한다. 401/400 은 재시도해도 같은 답이라 즉시 던진다.
// (Gemini 는 503 overloaded 를 자주 낸다 — eval 첫 실행에서 5콜 중 1콜이 503이었다.)
const isRetriable = (status: number) => status === 429 || status >= 500;

const PROBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["probe", "targetGap"],
  properties: {
    probe: { type: "string" },
    targetGap: { type: "string", enum: ["why", "term", "example", "contradiction"] },
  },
} as const;

const SYSTEM = [
  "You are a Feynman-technique tutor. The student explains a concept in their own words; you probe the gap.",
  "HARD RULES:",
  "1. NEVER give the answer. Do not define the concept, do not state the correct explanation, do not hint at it.",
  "   Even when the student is factually WRONG, do not correct them — point at the contradiction and let them find it.",
  "   Even when the student demands the answer, refuse and ask them to try in their own words.",
  "2. Ask EXACTLY ONE thing. One question mark, one gap. Never combine two asks",
  "   (e.g. '무엇인지 + 예를 들어'). Choose the single most useful gap:",
  "   a missing cause ('why'), an undefined term ('term'),",
  "   a missing concrete example ('example'), or a contradiction with what they said earlier ('contradiction').",
  "3. NEVER judge sufficiency. Do not say the explanation is good/enough/lacking/correct/wrong. The student decides that.",
  "4. Address the student directly in Korean 존댓말. NEVER write the word '학생' at all —",
  "   not '학생은', not '학생의 말로', not '학생분'. Say '본인의 말로' or just omit the subject.",
  "   Speak TO them, never ABOUT them.",
  "5. ONE short warm question. Quote their own words when useful.",
  "Respond ONLY with JSON conforming to the schema.",
].join("\n");

/**
 * 사용자 설명을 읽고 구멍 하나를 짚어 되묻는다.
 * @param concept  설명 대상 개념 제목
 * @param noteText 사용자의 원본 노트 (LLM 이 맥락으로 읽는다)
 * @param history  지금까지의 대화. 마지막 항목은 반드시 사용자의 설명이어야 한다.
 */
export async function probeExplanation(
  concept: string,
  noteText: string,
  history: Turn[],
  apiKey: string,
  deps?: FeynmanDeps,
): Promise<Probe> {
  const key = apiKey?.trim();
  if (!key) throw new Error("[provider=gemini] feynman: API key 필요 — 파인만은 휴리스틱으로 만들 수 없다");
  const last = history[history.length - 1];
  if (!last || last.role !== "user" || !last.text.trim()) {
    throw new Error("[feynman] 파인만 질문은 사용자의 설명 뒤에만 온다");
  }

  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const endpoint = deps?.endpoint ?? GEMINI_OPENAI_ENDPOINT;
  const maxRetries = deps?.maxRetries ?? 2;
  const backoffMs = deps?.backoffMs ?? 250;

  const body = JSON.stringify({
    model: deps?.model ?? GEMINI_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          concept,
          note: noteText.slice(0, 6000),
          // 대화 전체를 넘긴다 — 앞말과의 모순(contradiction)을 짚으려면 필요하다.
          conversation: history.map((t) => ({ [t.role === "user" ? "student" : "tutor"]: t.text })),
        }),
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "Probe", strict: false, schema: PROBE_SCHEMA } },
  });

  let res: Response | undefined;
  let lastErr = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    try {
      res = await fetchFn(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
      });
    } catch (e) {
      lastErr = `network: ${e instanceof Error ? e.message : String(e)}`;
      continue; // 네트워크 오류는 재시도
    }
    if (res.ok) break;
    lastErr = `HTTP ${res.status}`;
    if (!isRetriable(res.status)) break;
  }
  if (!res?.ok) throw new Error(`[provider=gemini] feynman: ${lastErr}`);

  const parsed = extractChatJson(await res.json()) as { probe?: string; targetGap?: string } | null;
  const probe = parsed?.probe?.trim();
  if (!probe) throw new Error("[provider=gemini] feynman: no structured output");

  const kinds: GapKind[] = ["why", "term", "example", "contradiction"];
  const targetGap = kinds.includes(parsed!.targetGap as GapKind) ? (parsed!.targetGap as GapKind) : "why";
  return { probe, targetGap };
}

/**
 * 파인만을 시작할 개념 하나를 고른다 — 노트 안에서 가장 얕게 서술된 개념.
 * LLM 을 부르지 않는다: 1차 위키 생성이 이미 개념 목록을 줬으므로, 노트 본문에서
 * 각 개념이 얼마나 다뤄졌는지만 재면 된다. (정의문·예시가 없을수록 취약하다)
 *
 * 사용자가 고르지 않았는데 에이전트가 골랐다 — 이 함수가 그 "능동성" 의 전부다.
 * 과장하지 말 것.
 */
export function pickWeakestConcept(concepts: string[], noteText: string): string | null {
  if (!concepts.length) return null;
  const text = noteText.toLowerCase();
  const scored = concepts.map((title) => {
    const t = title.toLowerCase();
    const mentions = t ? text.split(t).length - 1 : 0;
    // 정의문("X는/X란 ...")이 있으면 사용자가 이미 자기 말로 규정한 것 → 덜 취약
    const defined = new RegExp(`${escapeRe(t)}\\s*(는|은|란|이란)`).test(text);
    // 예시("예를 들어", "예:")가 개념 근처에 있으면 덜 취약
    const exemplified = /예를 들어|예시|예:/.test(text);
    return { title, score: mentions * 2 + (defined ? 3 : 0) + (exemplified ? 1 : 0) };
  });
  scored.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
  return scored[0].title;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
