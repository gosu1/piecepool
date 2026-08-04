// Gemini(OpenAI 호환 Chat Completions) 텍스트 스트리밍 수신 (SSE). SSOT: docs/30-llm/note-synthesis.md §3.
// delta.content 를 누적하고 finish_reason 으로 종결을 판단한다(`data: [DONE]` 프레임은 건너뛴다).
// 구조화 출력(단발 호출)은 gemini.ts 소관 — 본 모듈은 plain text 스트리밍 전용.

import { defaultEndpoint, extractChatText } from "./gemini";

export interface SseEvent {
  type: string;
  [k: string]: unknown;
}

/** 순수 파서: 청크 문자열 → 완성된 프레임의 data JSON 이벤트. 부분 프레임은 버퍼링, 비JSON은 무시. */
export function createSseParser(onEvent: (ev: SseEvent) => void) {
  let buf = "";
  return {
    push(chunk: string) {
      buf += chunk;
      let m: RegExpExecArray | null;
      while ((m = /\r?\n\r?\n/.exec(buf)) !== null) {
        const frame = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        try {
          onEvent(JSON.parse(data) as SseEvent);
        } catch {
          /* 부분/비JSON 프레임 무시 */
        }
      }
    },
  };
}

export interface StreamTextResult {
  text: string;
  incomplete?: string; // response.incomplete 사유(max_output_tokens 등) — 성공 취급, 경고 표시용
}

export interface StreamTextOptions {
  apiKey: string;
  body: object; // model/input 등 — stream:true 는 여기서 강제로 덧붙인다
  endpoint?: string;
  signal?: AbortSignal;
  onDelta?: (full: string) => void; // 누적 전체 텍스트를 전달
  fetchFn?: typeof fetch;
  stallMs?: number; // 청크 간 무수신 한계(기본 45s). 전체 타임아웃은 두지 않는다 — 긴 글은 정상.
}

export async function streamChatText(opts: StreamTextOptions): Promise<StreamTextResult> {
  const endpoint = opts.endpoint ?? defaultEndpoint();
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  const headers = { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` };

  const res = await fetchFn(`${endpoint}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...opts.body, stream: true }),
    signal: opts.signal,
  });
  // stream:true 여도 4xx/5xx 본문은 SSE 가 아닌 JSON 에러다 — 읽기 전에 분류(401/403 은 터미널: synthesize 가 재시도 중단).
  if (res.status === 401 || res.status === 403) throw new Error(`[stream] auth: HTTP ${res.status}`);
  if (!res.ok) throw new Error(`[stream] HTTP ${res.status}`);

  if (!res.body) {
    // 스트리밍 미지원 환경(body 미노출 webview) — stream:false 버퍼링 폴백, 전체 텍스트 1회 전달.
    const r2 = await fetchFn(`${endpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
    if (!r2.ok) throw new Error(`[stream] fallback HTTP ${r2.status}`);
    const text = extractChatText(await r2.json());
    opts.onDelta?.(text);
    return { text };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8"); // stream:true decode — 한글 멀티바이트가 청크 경계에서 잘린다
  let full = "";
  let done: StreamTextResult | null = null;
  let failure: string | null = null;
  const parser = createSseParser((ev) => {
    // Chat Completions 스트림 청크: { choices: [{ delta: { content }, finish_reason }] }
    const choice = (ev.choices as Array<{ delta?: { content?: string }; finish_reason?: string | null }> | undefined)?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta) {
      full += delta;
      opts.onDelta?.(full);
    }
    const fr = choice?.finish_reason;
    if (fr) done = fr === "length" ? { text: full, incomplete: "length" } : { text: full };
    // OpenAI 호환 에러 이벤트: { error: { message } }
    if (ev.error) failure = `[stream] error: ${eventMessage(ev)}`;
  });

  const stallMs = opts.stallMs ?? 45000;
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const resetStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      void reader.cancel();
    }, stallMs);
  };
  resetStall();
  try {
    for (;;) {
      const { value, done: eof } = await reader.read();
      if (eof) break;
      resetStall();
      parser.push(decoder.decode(value, { stream: true }));
      if (failure) throw new Error(failure);
      if (done) {
        void reader.cancel();
        return done;
      }
    }
  } finally {
    clearTimeout(stallTimer);
  }
  if (stalled) throw new Error(`[stream] stall: ${stallMs}ms 동안 수신 없음`);
  if (done) return done;
  if (failure) throw new Error(failure);
  // finish_reason 종결 이벤트 없이 연결 절단 — 부분 텍스트는 저장하지 않는다(synthesize 가 판단).
  throw new Error("[stream] 종결 이벤트 없이 스트림 종료");
}

function eventMessage(ev: SseEvent): string {
  const err = ev.error as { message?: string } | undefined;
  return err?.message ?? "unknown";
}
