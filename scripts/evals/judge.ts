// LLM-as-judge 공용 호출부. temperature 0, JSON 스키마 강제, 429/5xx 지수 백오프.
// 판정자가 관대해지는 것을 막는 장치는 각 어댑터의 system 프롬프트가 담당한다:
//   (1) 근거 인용 강제 (2) "의심스러우면 더 심한 쪽" (3) 강제 분류(중립 라벨로 도망 금지).
// 규약 출처: scripts/feynman-eval.ts (판정 실패가 지표를 갉아먹으므로 재시도한다)
import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "../../src/llm/gemini";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function judgeJson<T>(system: string, payload: unknown, schema: object, apiKey: string): Promise<T> {
  const body = JSON.stringify({
    model: process.env.GEMINI_MODEL || GEMINI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "Verdict", strict: false, schema } },
  });

  let last = "";
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(250 * 2 ** (attempt - 1));
    const res = await fetch(`${GEMINI_OPENAI_ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const v = extractChatJson(await res.json()) as T | null;
      if (v) return v;
      last = "no structured output";
      continue;
    }
    last = `HTTP ${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(`judge: ${last}`);
}
