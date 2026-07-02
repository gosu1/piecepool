// OpenAI Responses API 텍스트 스트리밍 수신 (SSE). SSOT: docs/30-llm/note-synthesis.md §3.
// Chat Completions 와 달리 `data: [DONE]` 센티널이 없다 — 타입 있는 이벤트(response.*)로 종결을 판단한다.
// 구조화 출력(단발 호출)은 openai.ts 소관 — 본 모듈은 plain text 스트리밍 전용.

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

export async function streamResponsesText(opts: StreamTextOptions): Promise<StreamTextResult> {
  const endpoint = opts.endpoint ?? "https://api.openai.com/v1";
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const headers = { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` };

  const res = await fetchFn(`${endpoint}/responses`, {
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
    const r2 = await fetchFn(`${endpoint}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
    if (!r2.ok) throw new Error(`[stream] fallback HTTP ${r2.status}`);
    const text = outputText(await r2.json());
    opts.onDelta?.(text);
    return { text };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8"); // stream:true decode — 한글 멀티바이트가 청크 경계에서 잘린다
  let full = "";
  let done: StreamTextResult | null = null;
  let failure: string | null = null;
  const parser = createSseParser((ev) => {
    if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
      full += ev.delta;
      opts.onDelta?.(full);
    } else if (ev.type === "response.completed") {
      done = { text: full };
    } else if (ev.type === "response.incomplete") {
      done = { text: full, incomplete: incompleteReason(ev) };
    } else if (ev.type === "response.failed" || ev.type === "error") {
      failure = `[stream] ${ev.type}: ${eventMessage(ev)}`;
    }
    // 그 외(created/in_progress/output_item.*/content_part.*/output_text.done/미지 타입)는 무시 — 전방 호환
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
  // 종결 이벤트 없이 연결 절단 — 부분 텍스트는 onDelta 로 이미 전달됐고, 저장은 하지 않는다(synthesize 가 판단).
  throw new Error("[stream] 종결 이벤트 없이 스트림 종료");
}

function incompleteReason(ev: SseEvent): string {
  const r = ev.response as { incomplete_details?: { reason?: string } } | undefined;
  return r?.incomplete_details?.reason ?? "incomplete";
}

function eventMessage(ev: SseEvent): string {
  if (typeof ev.message === "string") return ev.message;
  const r = ev.response as { error?: { message?: string } } | undefined;
  return r?.error?.message ?? "unknown";
}

// 버퍼링 폴백용 — 단발 응답에서 텍스트 추출 (ocr.ts 와 동일한 응답 모양).
function outputText(data: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }): string {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = (data.output ?? []).flatMap((o) => o.content ?? []);
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}
