// ══ 쿼리바가 AI 를 부르는 유일한 곳 ══
//
// 질문을 보내고, AI 가 도구를 부르면 실행해서 결과를 돌려주고, 답이 나올 때까지 반복한다.
// 이 방식의 이름은 도구 호출(tool use) + 에이전트 루프다. 랭체인 같은 라이브러리가 이 반복을
// 대신 돌려주기도 하지만 우리 것은 이 파일 하나면 되므로 직접 짠다.
// 설계: "쿼리바 설계" §2 · §7.
//
// **나중에 Liner 나 로컬 AI 로 바꿀 때 갈아끼우는 자리가 여기다.** 그래서 AI 를 부르는 코드를
// 이 파일 하나에 모았다. 인터페이스 계층을 미리 만들지는 않았다 — 구현이 하나뿐인데 틀을
// 먼저 만들면 그 틀이 Gemini 모양으로 굳는다.

import { defaultEndpoint, GEMINI_MODEL } from "./gemini";
import { errMsg, isAbort, isRetriable, sleep } from "./http";
import { QUERY_TOOLS, runTool } from "./queryTools";
import { geminiKey } from "../lib/settings";

/** 대화 한 마디. 세션 JSON 에 그대로 저장되는 모양이다(설계 §6.2). */
export interface QueryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AskOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  fetchFn?: typeof fetch;
  /** 창이 닫히면 진행 중인 요청을 끊는다(설계 §1.5). */
  signal?: AbortSignal;
  /** 주고받기 상한. 넘으면 못 찾았다고 끝낸다. */
  maxRounds?: number;
  /** 진행 표시용 — "위키를 찾는 중" 같은 문구를 화면에 보여줄 때 쓴다. */
  onProgress?: (step: string) => void;
}

export interface AskResult {
  text: string;
  /** 이번 답을 만들며 실제로 열어 본 위키 — "폴더/파일명" 꼴. 출처 표기와 세션 저장에 쓴다. */
  citedWiki: string[];
  /** 실제로 주고받은 횟수. 비용·지연을 재는 데 쓴다. */
  rounds: number;
  /** 상한에 걸려 끝났는가. */
  hitLimit: boolean;
}

/**
 * 주고받기 상한. 넘으면 답을 못 만들고 끝낸다.
 *
 * 무한 반복을 막는 장치이자 비용 상한이다 — 주고받을 때마다 지금까지 오간 내용 전체를 다시
 * 보내므로 횟수가 곧 돈이다. 스파이크 실측에서는 3회로 끝났다(설계 §2.3).
 */
export const MAX_ROUNDS = 6;

const RETRIES = 2;
const BACKOFF_MS = 500;

const SYSTEM = [
  "너는 사용자의 개인 위키를 읽고 답하는 비서다.",
  "답을 지어내지 마라. 주어진 도구로 실제 위키를 찾아 읽고, 거기 있는 내용만 근거로 답해라.",
  "위키에서 근거를 못 찾으면 모른다고 말해라.",
  "근거로 쓴 위키는 답변 문장 안에 그 제목을 그대로 적어라. 따로 목록을 만들지 마라.",
  "한국어로, 사용자가 아는 말로 답해라.",
].join(" ");

type Msg = Record<string, unknown>;

/** 한 번 호출. 재시도는 429·5xx·네트워크만 — 401/400 은 다시 해도 같은 답이라 즉시 던진다. */
async function callOnce(url: string, key: string, body: unknown, opts: AskOptions): Promise<any> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  let lastErr = "";

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      if (isAbort(e)) throw e; // 창이 닫혔다 — 재시도하지 않는다
      lastErr = `network: ${errMsg(e)}`;
      continue;
    }
    if (res.ok) return await res.json();

    const text = await res.text().catch(() => "");
    lastErr = `HTTP ${res.status} ${text.slice(0, 200)}`;
    if (!isRetriable(res.status)) throw new Error(lastErr);
  }
  throw new Error(lastErr || "요청에 실패했습니다");
}

/**
 * 대화를 이어 답을 만든다. `turns` 의 마지막은 사용자의 질문이다.
 *
 * 도구를 부르는 동안에는 답이 없다 — 도구 요청이 오면 실행해서 결과를 돌려주고 다시 묻는다.
 * 도구 요청이 없으면 그게 최종 답이다.
 */
export async function askQuery(turns: QueryTurn[], opts: AskOptions = {}): Promise<AskResult> {
  const key = (opts.apiKey ?? geminiKey()).trim();
  if (!key) throw new Error("API key 필요 — 설정에서 Gemini 키를 넣어주세요");

  const url = `${opts.endpoint ?? defaultEndpoint()}/chat/completions`;
  const model = opts.model ?? GEMINI_MODEL;
  const limit = opts.maxRounds ?? MAX_ROUNDS;

  const messages: Msg[] = [
    { role: "system", content: SYSTEM },
    ...turns.map((t) => ({ role: t.role, content: t.text })),
  ];
  const citedWiki: string[] = [];

  for (let round = 1; round <= limit; round++) {
    opts.onProgress?.(round === 1 ? "위키를 찾는 중" : `위키를 찾는 중 (${round})`);

    const body = { model, messages, tools: QUERY_TOOLS, tool_choice: "auto" };
    const msg = (await callOnce(url, key, body, opts))?.choices?.[0]?.message;
    const calls = msg?.tool_calls;

    if (!Array.isArray(calls) || calls.length === 0) {
      const text = typeof msg?.content === "string" ? msg.content.trim() : "";
      return { text: text || "답을 만들지 못했어요.", citedWiki, rounds: round, hitLimit: false };
    }

    messages.push(msg);
    for (const c of calls) {
      const name = c?.function?.name ?? "";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c?.function?.arguments || "{}");
      } catch {
        // 인자가 깨져 와도 멈추지 않는다 — 빈 인자로 실행하면 runTool 이 무엇이 필요한지 알려준다
      }
      if (name === "read_wiki" && typeof args.space === "string" && typeof args.file === "string") {
        const cite = `${args.space}/${args.file}`;
        if (!citedWiki.includes(cite)) citedWiki.push(cite);
      }
      messages.push({ role: "tool", tool_call_id: c?.id, content: await runTool(name, args) });
    }
  }

  return {
    text: "위키를 찾아봤지만 답을 만들지 못했어요. 질문을 조금 더 좁혀서 다시 물어봐 주세요.",
    citedWiki,
    rounds: limit,
    hitLimit: true,
  };
}
