// Quick Memo 정리 — 강의 중 갈겨쓴 파편을 구조만 정리하고 문체는 지킨다.
// SSOT: docs/superpowers/specs/2026-07-11-quick-memo-design.md
//
// synthesize.ts 와 방향이 정반대다. synthesize 는 파편을 AI 문체의 완성된 글로 재작성한다
// ("걍 어디를 볼지 정하는 거" → "입력 시퀀스의 각 위치에 가중치를 부여하는 메커니즘").
// tidy 는 순서·제목·오탈자만 손대고 학생의 문장·말투·비유·질문을 그대로 남긴다.
// 사람은 자기 언어로 표현한 것만 진짜로 안다 — 표현의 소유권이 학습의 조건이다(feynman.ts 와 같은 원리).
//
// 폴백 없음(의도적). 키가 없거나 호출이 실패하면 그 사실을 던진다. 조용히 오프라인 결과로 덮으면
// 사용자는 AI가 돌지 않았다는 걸 모른다 — gemini-2.5-flash 단종을 팀이 몇 주간 몰랐던 전례가 있다.

import { streamChatText } from "./stream";
import { GEMINI_MODEL } from "./gemini";

export interface TidyOptions {
  onDelta?: (full: string) => void;
  signal?: AbortSignal;
  endpoint?: string;
  model?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number; // 기본 2 (synthesize.ts 미러)
  backoffMs?: number; // 기본 250 (0=즉시, 테스트용)
}

/** 키 없음 — 호출조차 하지 않았다. 설정으로 안내한다. */
export class TidyNoKeyError extends Error {}
/** 스트림 도중(첫 delta 이후) 실패 — 받은 부분은 화면에 유지, 원문은 그대로. */
export class TidyStreamError extends Error {}

const SYSTEM_PROMPT =
  "너는 학생의 강의 메모를 정리하는 편집자다.\n" +
  "학생의 표현 방식을 지운다면 그것은 실패다.\n" +
  "[반드시 지킬 것]\n" +
  "1. 학생이 쓴 문장·어휘·말투·비유를 그대로 살린다. \"걍\", \"때리면\", \"임\", \"->\" 같은 표현을 교과서 문체로 바꾸지 마라.\n" +
  "2. 학생이 던진 질문(\"왜 ~?\", \"근데 ~?\")은 질문 그대로 남긴다. 답을 채우지 마라 — 그것은 학생이 모르는 지점의 표식이다.\n" +
  "3. 파편에 없는 내용을 추가하지 않는다. 일반 지식으로 보충하지 않는다.\n" +
  "4. 어떤 사실도 빼지 않는다.\n" +
  "[해도 되는 것]\n" +
  "- 순서를 논리적으로 재배열\n" +
  "- ## 헤딩으로 주제 묶기\n" +
  "- 오탈자·명백한 비문만 다듬기\n" +
  "- 목록/번호로 구조화, **볼드** 강조\n" +
  "[출력]\n" +
  "- 순수 마크다운만. 첫 줄은 '# {주제}' 한 줄이다(주제는 파편에서 추론한다).\n" +
  "- 코드펜스로 감싸지 마라. 설명 문장을 덧붙이지 마라.\n" +
  "- [[위키링크]]와 ![[임베드]]는 글자 그대로 유지한다.";

const MAX_OUTPUT_TOKENS = 4096;

export function buildTidyBody(memo: string, model = GEMINI_MODEL) {
  return {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `[강의 중 갈겨쓴 파편]\n${memo}\n\n위 파편을 규칙대로 정리하라.` },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
  };
}

/**
 * 파편 → 정리본 (스트리밍). 실패는 던진다 — 폴백하지 않는다.
 * @throws TidyNoKeyError  키 없음
 * @throws TidyStreamError 첫 delta 이후 실패(부분 텍스트는 onDelta 로 이미 전달됨)
 * @throws Error           스트림 시작 전 실패(재시도 소진)
 */
export async function runTidy(memo: string, apiKey?: string, opts?: TidyOptions): Promise<string> {
  const key = apiKey?.trim();
  if (!key) throw new TidyNoKeyError("AI 정리를 하려면 설정에서 Gemini 키를 넣어주세요");

  const maxRetries = opts?.maxRetries ?? 2;
  const backoffMs = opts?.backoffMs ?? 250;
  let gotDelta = false;
  const onDelta = (full: string) => {
    gotDelta = true;
    opts?.onDelta?.(full);
  };

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    try {
      const r = await streamChatText({
        apiKey: key,
        body: buildTidyBody(memo, opts?.model),
        endpoint: opts?.endpoint,
        signal: opts?.signal,
        onDelta,
        fetchFn: opts?.fetchFn,
      });
      if (!r.text.trim()) throw new Error("빈 응답");
      return r.text;
    } catch (e) {
      if (isAbort(e)) throw e; // 사용자 취소 — 재시도 없음
      if (gotDelta) throw new TidyStreamError(errMsg(e)); // 도중 실패 — 부분 유지
      lastError = errMsg(e);
      if (lastError.includes("auth")) break; // 401/403 터미널 (gemini.ts 와 동일 정책)
    }
  }
  throw new Error(lastError || "정리에 실패했어요");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
