import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "./gemini";

// 위키 제목 일괄 정리 — 음차 제목("어텐션")을 관례 표기("Attention")로 고칠 후보를 고른다.
// 방향은 위키 생성 프롬프트의 제목 규칙(gemini.ts buildMessages)과 같다: 영어 통용 용어의
// 한글 음차 금지. 다만 여기 입력은 "이미 저장된 제목"이라 원문 노트가 없으므로 분야 관례가 기준이다.
//
// 철자 교정만 한다 — 개념 병합·분리·의역은 rename 의 일이 아니다. 제안은 후보일 뿐이고
// 실제 변경은 사용자가 다이얼로그에서 행마다 고른다(RetitleWikisDialog).

export interface RetitleSuggestion {
  /** 입력 제목과 정확히 일치 — 아니면 버린다 */
  from: string;
  to: string;
}

export interface RetitleDeps {
  fetchFn?: typeof fetch;
  endpoint?: string;
  model?: string;
  maxRetries?: number; // gemini.ts 와 같은 규약(기본 2)
  backoffMs?: number; // 0 = 즉시(테스트용)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 429·5xx·네트워크만 재시도한다. 401/400 은 재시도해도 같은 답이라 즉시 던진다. (feynman.ts 와 동일 규약)
const isRetriable = (status: number) => status === 429 || status >= 500;

const RETITLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["changes"],
  properties: {
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to"],
        properties: { from: { type: "string" }, to: { type: "string" } },
      },
    },
  },
} as const;

const SYSTEM = [
  "You review wiki page titles from a study app and fix ONLY their spelling convention.",
  "Rule: a technical term whose field convention is English must use its canonical English spelling",
  "('어텐션' → 'Attention', '멀티 헤드 어텐션' → 'Multi-Head Attention', '트랜스포머' → 'Transformer').",
  "Terms where Korean is the standard stay Korean ('미분', '수요곡선'). Long-naturalized loanwords that",
  "Korean textbooks themselves write in Hangul may stay as they are.",
  "HARD RULES:",
  "1. Spelling conversion only. Never reword, translate meaning, expand, merge or split concepts",
  "   ('어텐션' → 'Attention', NEVER 'Attention Mechanism').",
  "2. 'from' must EXACTLY equal one of the input titles. Include ONLY titles that must change.",
  "3. When in doubt, leave the title out.",
  "Respond ONLY with JSON conforming to the schema.",
].join("\n");

/** 규칙에 어긋나는 제목만 골라 관례 표기를 제안한다. 바꿀 게 없으면 빈 배열. */
export async function suggestRetitles(titles: string[], apiKey: string, deps?: RetitleDeps): Promise<RetitleSuggestion[]> {
  const key = apiKey?.trim();
  if (!key) throw new Error("[provider=gemini] retitle: API key 필요 — 설정에서 Gemini 키를 등록하세요");
  if (!titles.length) return [];

  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const endpoint = deps?.endpoint ?? GEMINI_OPENAI_ENDPOINT;
  const maxRetries = deps?.maxRetries ?? 2;
  const backoffMs = deps?.backoffMs ?? 250;

  const body = JSON.stringify({
    model: deps?.model ?? GEMINI_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify({ titles }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "RetitleResult", strict: false, schema: RETITLE_SCHEMA } },
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
  if (!res?.ok) throw new Error(`[provider=gemini] retitle: ${lastErr}`);

  const parsed = extractChatJson(await res.json()) as { changes?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.changes)) throw new Error("[provider=gemini] retitle: no structured output");

  // LLM 출력을 그대로 믿지 않는다 — 입력에 없는 from·빈 to·제자리 제안·중복 from 은 버린다.
  const input = new Set(titles);
  const seen = new Set<string>();
  const out: RetitleSuggestion[] = [];
  for (const c of parsed.changes as Array<{ from?: unknown; to?: unknown }>) {
    const from = typeof c?.from === "string" ? c.from : "";
    const to = typeof c?.to === "string" ? c.to.trim() : "";
    if (!input.has(from) || !to || to === from || seen.has(from)) continue;
    seen.add(from);
    out.push({ from, to });
  }
  return out;
}
