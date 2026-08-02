// LLM-as-judge 공용 호출부. temperature 0, JSON 스키마 강제, 429/5xx 지수 백오프.
// 판정자가 관대해지는 것을 막는 장치는 각 어댑터의 system 프롬프트가 담당한다:
//   (1) 근거 인용 강제 (2) "의심스러우면 더 심한 쪽" (3) 강제 분류(중립 라벨로 도망 금지).
// 규약 출처: scripts/feynman-eval.ts (판정 실패가 지표를 갉아먹으므로 재시도한다)
import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "../../src/llm/gemini";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 심판 모델은 채점 **대상**(subject) 모델과 분리된 축이다. `--model` 로 대상을 바꿨는데
// 심판까지 같이 바뀌면 점수 차이가 대상 모델 차이인지 심판 차이인지 가를 수 없어
// 모델 간 비교 자체가 성립하지 않는다. 그래서 여기서는 RunCtx.model / RunCtx.baseUrl 을
// **보지 않는다** — 엔드포인트도 GEMINI_OPENAI_ENDPOINT 고정이다(--base-url 을 안 따라간다).
// 심판을 바꾸려면 --judge-model / PIECEPOOL_JUDGE_MODEL 로 명시해야 한다.
// (구 이름 `GEMINI_MODEL` env 에서 교체했다 — src/llm 은 `PIECEPOOL_LLM_MODEL` 을 읽는데
//  이 이름만 홀로 달라 대상/심판 중 무엇을 가리키는지 알 수 없었다. 별개 러너인
//  scripts/feynman-eval.ts 는 아직 `GEMINI_MODEL` 을 읽는다 — 이번 범위 밖이다.)
export function resolveJudgeModel(explicit?: string): string {
  return explicit || process.env.PIECEPOOL_JUDGE_MODEL || GEMINI_MODEL;
}

export async function judgeJson<T>(
  system: string,
  payload: unknown,
  schema: object,
  apiKey: string,
  judgeModel?: string,
): Promise<T> {
  const body = JSON.stringify({
    model: resolveJudgeModel(judgeModel),
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
