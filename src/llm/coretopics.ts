import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "./gemini";

// 핵심 주제 판별 — 이 노트에서 "모르면 나머지가 무너지는" 섹션이 어느 것인가.
//
// 판단 기준은 Gemini 에게 맡긴다. 우리가 규칙을 박아 넣으면(길이·단어 수 …) 어떤 노트에서는
// 반드시 틀린다. 대신 무엇이 핵심인지의 **정의**만 주고 판단은 모델이 한다.
//
// 결과는 게이트가 쓴다: 핵심 주제는 사용자가 파인만에 답하고 "이해했다" 고 해야 위키가 된다.
// 그러므로 이 판정은 사용자를 막는 힘을 갖는다 → 틀렸을 때 덜 해로운 쪽으로 기운다:
//   - 응답을 못 알아들으면 그 섹션은 핵심이 아니다(막지 않는다)
//   - 호출 자체가 실패하면 게이트를 걸지 않는다(engine: "none")
// 사람을 못 막는 것보다 사람을 잘못 막는 것이 나쁘다.

export interface CoreTopicsInput {
  heading: string;
  /** 섹션 본문 발췌 — 제목만으로는 핵심 여부를 알 수 없다 */
  excerpt: string;
}

export interface CoreTopicsResult {
  /** 입력과 같은 순서·길이. 판정 못 받은 섹션은 false(막지 않는다). */
  core: boolean[];
  reasons: string[];
  engine: "gemini" | "none";
}

export interface CoreTopicsDeps {
  fetchFn?: typeof fetch;
  endpoint?: string;
  model?: string;
  maxRetries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

// 멈춘 네트워크가 게이트를 영원히 pending 으로 만들면, 판별을 못 했을 뿐인데 사용자는
// 아무것도 못 하게 된다(버튼이 busy 로 잠긴 채). fail-open 의 정반대다 — 반드시 끊는다.
const TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRetriable = (status: number) => status === 429 || status >= 500;

const MAX_SECTIONS = 30;
const EXCERPT_CHARS = 400;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "isCore"],
        properties: {
          id: { type: "integer" },
          isCore: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = [
  "너는 학습 노트의 섹션 목록을 보고 어느 섹션이 이 노트의 '핵심 주제' 인지 가린다.",
  "",
  "핵심 주제란:",
  "- 노트 제목이 다루는 대상을 직접 구성하는 개념",
  "- 다른 섹션들이 전제로 삼는 개념",
  "- 이해하지 못하면 노트 전체가 무너지는 주제",
  "",
  "핵심이 아닌 것: 단순 예시·여담·행정 메모·참고 문헌·용어 나열·앞뒤 인사말.",
  "세부 판단 기준은 너에게 맡긴다.",
  "",
  "규칙:",
  "1. 입력의 각 섹션 id 를 그대로 쓴다. 없는 id 를 지어내지 않는다.",
  "2. 모든 섹션을 핵심이라고 하지 마라. 전부 핵심이면 아무것도 핵심이 아니다.",
  "3. reason 은 한국어 한 문장.",
  "스키마에 맞는 JSON 만 출력한다.",
].join("\n");

/**
 * 섹션들 중 어느 것이 핵심 주제인지 판별한다.
 * @param sections 노트의 `##` 섹션들 (문서 순서)
 */
export async function classifyCoreSections(
  noteTitle: string,
  sections: CoreTopicsInput[],
  apiKey: string,
  deps?: CoreTopicsDeps,
): Promise<CoreTopicsResult> {
  const none = (): CoreTopicsResult => ({
    core: sections.map(() => false),
    reasons: sections.map(() => ""),
    engine: "none",
  });
  const key = apiKey?.trim();
  if (!key || !sections.length) return none();

  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const endpoint = deps?.endpoint ?? GEMINI_OPENAI_ENDPOINT;
  const maxRetries = deps?.maxRetries ?? 2;
  const backoffMs = deps?.backoffMs ?? 250;
  const timeoutMs = deps?.timeoutMs ?? TIMEOUT_MS;

  const asked = sections.slice(0, MAX_SECTIONS);
  const body = JSON.stringify({
    model: deps?.model ?? GEMINI_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          noteTitle,
          sections: asked.map((s, id) => ({ id, heading: s.heading, excerpt: s.excerpt.slice(0, EXCERPT_CHARS) })),
        }),
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "CoreTopics", strict: false, schema: SCHEMA } },
    temperature: 0,
  });

  let res: Response | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      res = await fetchFn(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        signal: ac.signal,
      });
    } catch {
      res = undefined;
      continue; // 네트워크 오류·타임아웃 → 재시도, 끝내 안 되면 none()
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) break;
    if (!isRetriable(res.status)) break;
  }
  // 실패해도 던지지 않는다 — 게이트는 판정을 못 받으면 그냥 걸리지 않는다(사람을 잘못 막지 않는다).
  if (!res?.ok) return none();

  // extractChatJson 은 깨진 응답에 JSON.parse 로 던진다. 여기서 던지면 게이트를 부르는 쪽이
  // 통째로 실패한다 — 판별을 못 했을 뿐인데 위키 생성이 막히면 안 된다.
  type Row = { id?: unknown; isCore?: unknown; reason?: unknown };
  let rows: Row[] = [];
  try {
    const parsed = extractChatJson(await res.json()) as { sections?: unknown } | null;
    if (!Array.isArray(parsed?.sections)) return none();
    rows = parsed.sections as Row[];
  } catch {
    return none();
  }

  const core = sections.map(() => false);
  const reasons = sections.map(() => "");
  let understood = 0; // 우리가 알아들은 섹션 판정 수
  for (const r of rows) {
    // 없는 id·범위 밖 id 는 버린다(환각 거부). 못 알아들은 섹션은 false 로 남는다.
    if (typeof r.id !== "number" || !Number.isInteger(r.id) || r.id < 0 || r.id >= asked.length) continue;
    if (typeof r.isCore !== "boolean") continue;
    understood++;
    if (!r.isCore) continue;
    core[r.id] = true;
    reasons[r.id] = typeof r.reason === "string" ? r.reason : "";
  }
  // 아무 섹션도 알아듣지 못했다면 그건 판정이 아니다. "핵심 없음" 으로 캐시되면
  // 게이트가 그 노트에서 영원히 조용히 꺼진다 — 판별 실패로 다뤄 다시 묻게 한다.
  if (understood === 0) return none();
  return { core, reasons, engine: "gemini" };
}
