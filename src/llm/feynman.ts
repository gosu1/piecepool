import { chatJsonWithRetry, GEMINI_MODEL } from "./gemini";
import { languageDirective, getOutputLanguage, type OutputLanguage } from "./language";

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
  lang?: OutputLanguage; // 미지정 시 설정값(getOutputLanguage)
}

const PROBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["probe", "targetGap"],
  properties: {
    probe: { type: "string" },
    targetGap: { type: "string", enum: ["why", "term", "example", "contradiction"] },
  },
} as const;

const buildSystem = (lang: OutputLanguage) =>
  [
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
    ...(lang === "en"
      ? [
          "4. Address the student directly in a polite, encouraging tone. NEVER use the word 'student' —",
          "   never 'the student said'. Speak TO them, never ABOUT them.",
        ]
      : [
          "4. Address the student directly in Korean 존댓말. NEVER write the word '학생' at all —",
          "   not '학생은', not '학생의 말로', not '학생분'. Say '본인의 말로' or just omit the subject.",
          "   Speak TO them, never ABOUT them.",
        ]),
    "5. ONE short warm question. Quote their own words when useful.",
    "Probe language rule:",
    languageDirective(lang),
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

  const lang = deps?.lang ?? getOutputLanguage();

  const body = JSON.stringify({
    model: deps?.model ?? GEMINI_MODEL,
    messages: [
      { role: "system", content: buildSystem(lang) },
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

  const parsed = (await chatJsonWithRetry("feynman", key, body, deps)) as { probe?: string; targetGap?: string } | null;
  const probe = parsed?.probe?.trim();
  if (!probe) throw new Error("[provider=gemini] feynman: no structured output");

  const kinds: GapKind[] = ["why", "term", "example", "contradiction"];
  const targetGap = kinds.includes(parsed!.targetGap as GapKind) ? (parsed!.targetGap as GapKind) : "why";
  return { probe, targetGap };
}

// ── [아직 모르겠어요] 힌트 — 설명을 시작조차 못 할 때 비유 하나로 출발점을 준다 ──
//
// 파인만의 불변 제약(답 금지)은 그대로다. 주는 것은 두 가지뿐:
//   1) "X 을(를) Y 에 비유해보세요" 한 문장 — 큰 그림을 잡을 비유 프레임
//   2) 비유 세계의 유도 질문 2~3개 — 순서대로 답하다 보면 설명이 조립된다
// 키워드(명사 나열)로는 뭘 해야 할지 몰랐다 — 질문은 할 일 자체다. 질문이라서
// 답 노출도 구조적으로 없다: 대응 관계를 묻지, 말하지 않는다.

export interface AnalogyHint {
  /** "single-head attention 을 탐정에 비유해보세요" 꼴의 권유 한 문장 */
  analogy: string;
  /** 비유 세계의 유도 질문 — 순서대로 답하면 설명이 된다 (예: "탐정은 왜 혼자 모든 단서를 볼까요?") */
  questions: string[];
}

const HINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["analogy", "questions"],
  properties: {
    analogy: { type: "string" },
    questions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
  },
} as const;

const buildHintSystem = (lang: OutputLanguage) =>
  [
    "You are a Feynman-technique tutor. The student cannot even START explaining the concept.",
    "Give them a starting frame — an analogy — WITHOUT giving the answer.",
    "Do this silently first: compose a Feynman-style explanation of the concept for a complete beginner,",
    "built on ONE concrete everyday analogy (a person, object, or situation anyone knows).",
    "Then output ONLY:",
    "- analogy: ONE short sentence inviting the student to try that analogy",
    "  (Korean pattern: '<개념>을(를) <비유 대상>에 비유해보세요'). Never explain HOW the analogy maps.",
    "- questions: 2-3 short guiding questions set INSIDE the analogy's world, ordered so that answering",
    "  them one by one rebuilds your silent explanation (e.g. why the analogy is set up this way →",
    "  what each part does → how it comes together). One question may ask what a thing in the analogy",
    "  corresponds to in the concept ('비유 속 X는 <개념>에서 무엇에 해당할까요?').",
    "HARD RULES:",
    "1. NEVER give the answer. No definition, no explanation of the concept, no analogy-to-concept mapping —",
    "   questions ASK for the mapping, they never state it.",
    "2. Each question is ONE short sentence with ONE question mark.",
    "3. Pick an analogy that fits THIS concept and note.",
    "Output language rule:",
    languageDirective(lang),
    "Respond ONLY with JSON conforming to the schema.",
  ].join("\n");

/**
 * 설명을 시작 못 하는 사용자에게 비유 프레임 + 유도 질문을 준다.
 * @param concept  설명 대상 개념 제목
 * @param noteText 사용자의 원본 노트 (LLM 이 맥락으로 읽는다)
 */
export async function analogyHint(
  concept: string,
  noteText: string,
  apiKey: string,
  deps?: FeynmanDeps,
): Promise<AnalogyHint> {
  const key = apiKey?.trim();
  if (!key) throw new Error("[provider=gemini] feynman-hint: API key 필요 — 힌트는 휴리스틱으로 만들 수 없다");

  const lang = deps?.lang ?? getOutputLanguage();
  const body = JSON.stringify({
    model: deps?.model ?? GEMINI_MODEL,
    messages: [
      { role: "system", content: buildHintSystem(lang) },
      { role: "user", content: JSON.stringify({ concept, note: noteText.slice(0, 6000) }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "AnalogyHint", strict: false, schema: HINT_SCHEMA } },
  });

  const parsed = (await chatJsonWithRetry("feynman-hint", key, body, deps)) as
    | { analogy?: string; questions?: unknown }
    | null;
  const analogy = parsed?.analogy?.trim();
  if (!analogy) throw new Error("[provider=gemini] feynman-hint: no structured output");

  // 질문은 부분 실패를 허용한다 — 비유 한 문장만으로도 힌트는 성립한다.
  // strict:false 라 스키마의 maxItems 를 못 믿는다 — 중복 제거 후 3개로 자른다.
  const questions = Array.isArray(parsed!.questions)
    ? [
        ...new Set(
          parsed!.questions.filter((q): q is string => typeof q === "string" && !!q.trim()).map((q) => q.trim()),
        ),
      ].slice(0, 3)
    : [];
  return { analogy, questions };
}
