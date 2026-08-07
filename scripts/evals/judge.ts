// LLM-as-judge 공용 호출부. temperature 0, JSON 스키마 강제, 지수 백오프 재시도.
// 재시도 대상은 세 가지다 — 429/5xx, 네트워크/타임아웃(응답 자체가 없음), 응답 본문 파싱 실패.
// 판정자가 관대해지는 것을 막는 장치는 각 어댑터의 system 프롬프트가 담당한다:
//   (1) 근거 인용 강제 (2) "의심스러우면 더 심한 쪽" (3) 강제 분류(중립 라벨로 도망 금지).
// 규약 출처: scripts/feynman-eval.ts (판정 실패가 지표를 갉아먹으므로 재시도한다)
import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "../../src/llm/gemini";
import { errMsg } from "../../src/llm/http";

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

// 재시도 대기(ms). 순수 함수로 뺀 이유는 타이머 목킹 없이 스케줄 자체를 테스트하기 위해서다.
// 기본 스케줄 5s → 20s. 250·500ms 였던 구 스케줄은 PIE-55 실측에서 503("high demand") 혼잡
// 구간을 그대로 관통해 3회 시도가 몇백 ms 안에 소진됐다 — 재시도가 있으나 마나였다.
// Retry-After(초)는 max(기본 스케줄, min(Retry-After, 60s)) 로 섞는다 — 서버 값이 기본보다
// 길면 채택하고(60초 캡), 짧으면 기본 스케줄을 유지한다. 짧은 재시도를 연발하면 혼잡 구간에서
// 한도만 태우기 때문이다.
// 60초 캡은 **대기 1회당** 이지 호출 전체 상한이 아니다 — 최악은 3시도 × 30s 타임아웃 +
// 대기 최대 120s ≈ 210s/콜이고, pdfsummary fixture 4종을 직렬로 돌리면 최악 ~14분이다.
// 로컬에서 사람이 돌리는 러너라 이 상한을 수용한다(CI 에 걸 것이면 다시 재야 한다).
export function judgeRetryDelayMs(attempt: number, retryAfterSec?: number): number {
  const base = 5000 * 4 ** (attempt - 1);
  if (retryAfterSec === undefined || !Number.isFinite(retryAfterSec)) return base;
  return Math.max(base, Math.min(retryAfterSec * 1000, 60_000));
}

// Retry-After 는 숫자(초)와 HTTP-date 두 형태가 있는데 숫자만 읽는다.
// HTTP-date 는 서버·클라이언트 시계 차가 그대로 대기 시간 오차가 되므로 무시하고 기본 스케줄로 간다.
function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const sec = Number(raw.trim());
  return Number.isFinite(sec) && sec >= 0 ? sec : undefined;
}

// 시도 횟수는 3회 그대로다 — 늘리는 대신 대기만 늘렸다. judge 무료 한도가 20콜/일이고
// pdfsummary fixture 4개 × 최대 3콜 = 최악 12콜이라, 이 예산 안에서 러너 1회 실행이
// 재시도까지 포함해 완주한다(PIE-59 합격 조건). 시도를 4회로 올리면 최악 16콜이 되어
// 같은 날 두 번째 실행이 불가능해진다.
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
  let tried = 0;
  let retryAfterSec: number | undefined; // 직전 실패 응답의 Retry-After
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(judgeRetryDelayMs(attempt, retryAfterSec));
    tried++;
    let res: Response;
    try {
      res = await fetch(`${GEMINI_OPENAI_ENDPOINT}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      // 타임아웃(AbortSignal)·네트워크 오류도 심판 과부하의 한 얼굴이다 — PIE-55 실측에서
      // 혼잡은 503 뿐 아니라 응답 지연으로도 왔다. 5xx 와 같게 다루고 다음 시도로 넘긴다.
      // 응답 자체가 없으니 서버 힌트(Retry-After)도 없다 — 기본 스케줄로 기다린다.
      last = errMsg(e);
      retryAfterSec = undefined;
      continue;
    }
    if (res.ok) {
      let v: T | null;
      try {
        v = extractChatJson(await res.json()) as T | null;
      } catch (e) {
        // 200 인데 본문이 산문이거나 깨진 JSON 인 경우. 빈 응답("no structured output")과 같은
        // 사고인데 여기서 예외가 루프를 관통하면 그것만 1회에 포기하고 "(N회 시도 소진)" 접미사도
        // 안 붙는다 — 재시도 비대칭이 생긴다. src/llm/gemini.ts 의 retriable("parse", ...) 와 같은 판단이다.
        last = `bad body (${errMsg(e)})`;
        retryAfterSec = undefined; // 응답은 왔다 — 혼잡 힌트가 아니다
        continue;
      }
      if (v) return v;
      last = "no structured output";
      retryAfterSec = undefined; // 정상 응답이었다 — 혼잡 힌트가 아니다
      continue;
    }
    last = `HTTP ${res.status}`;
    retryAfterSec = parseRetryAfter(res);
    if (res.status !== 429 && res.status < 500) break;
  }
  // 이 문자열이 run JSON 의 samples[].judge.error 로 남아 사람이 읽는다 — 마지막 상태와
  // 몇 번 시도하고 포기했는지가 같이 있어야 "한도 소진" 과 "즉시 거절" 을 가를 수 있다.
  throw new Error(`judge: ${last} (${tried}회 시도 소진)`);
}
