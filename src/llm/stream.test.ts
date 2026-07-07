import { describe, it, expect } from "vitest";
import { createSseParser, streamChatText, type SseEvent } from "./stream";

// ── 헬퍼: SSE 프레임/스트림 Response 구성 ─────────────────────────

function frame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// Chat Completions 스트림 청크: choices[0].delta.content
function delta(d: string): string {
  return frame({ choices: [{ delta: { content: d } }] });
}

// 종결 청크: finish_reason 세팅
const COMPLETED = frame({ choices: [{ delta: {}, finish_reason: "stop" }] });

/** 바이트 청크 배열 → 스트리밍 Response */
function streamRes(chunks: Uint8Array[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
  return new Response(body, { status: 200 });
}

function textChunks(...parts: string[]): Uint8Array[] {
  const enc = new TextEncoder();
  return parts.map((p) => enc.encode(p));
}

function fetchOnce(res: Response | (() => Response)): typeof fetch {
  return (async () => (typeof res === "function" ? res() : res)) as unknown as typeof fetch;
}

// content(choices[0].delta.content) 읽기 — SseEvent 인덱스 시그니처 우회.
function contentOf(ev: SseEvent): unknown {
  return (ev as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content;
}

// ── createSseParser (순수 파서) ─────────────────────────

describe("createSseParser", () => {
  it("청크 경계에서 잘린 프레임을 버퍼링해 재조립한다", () => {
    const events: SseEvent[] = [];
    const p = createSseParser((e) => events.push(e));
    const f = delta("안녕");
    p.push(f.slice(0, 10));
    expect(events).toHaveLength(0);
    p.push(f.slice(10));
    expect(events).toHaveLength(1);
    expect(contentOf(events[0])).toBe("안녕");
  });

  it("event: 라인 무시, 멀티라인 data 병합, CRLF 처리", () => {
    const events: SseEvent[] = [];
    const p = createSseParser((e) => events.push(e));
    p.push('event: done\r\ndata: {"type":\r\ndata: "done"}\r\n\r\n');
    expect(events).toEqual([{ type: "done" }]);
  });

  it("[DONE]·비JSON 프레임은 무시한다", () => {
    const events: SseEvent[] = [];
    const p = createSseParser((e) => events.push(e));
    p.push("data: [DONE]\n\ndata: not-json\n\n" + delta("a"));
    expect(events).toHaveLength(1);
  });
});

// ── streamChatText ─────────────────────────

describe("streamChatText", () => {
  const base = { apiKey: "sk-test", body: { model: "m", messages: [] } };

  it("delta 누적 → finish_reason 에서 전체 텍스트 반환, onDelta 는 누적값 순서대로", async () => {
    const seen: string[] = [];
    const r = await streamChatText({
      ...base,
      fetchFn: fetchOnce(streamRes(textChunks(delta("파편이 "), delta("글이 된다"), COMPLETED))),
      onDelta: (t) => seen.push(t),
    });
    expect(r).toEqual({ text: "파편이 글이 된다" });
    expect(seen).toEqual(["파편이 ", "파편이 글이 된다"]);
  });

  it("한글 멀티바이트가 청크 경계에서 잘려도 재조립된다", async () => {
    const s = delta("한글") + COMPLETED;
    const bytes = new TextEncoder().encode(s);
    const cut = s.indexOf("한") + 1; // "한"(UTF-8 3바이트) 중간을 가른다(앞은 전부 ASCII → char index=byte offset)
    const r = await streamChatText({
      ...base,
      fetchFn: fetchOnce(streamRes([bytes.slice(0, cut), bytes.slice(cut)])),
    });
    expect(r.text).toBe("한글");
  });

  it("미지 이벤트/빈 delta 는 무시하고 진행한다", async () => {
    const r = await streamChatText({
      ...base,
      fetchFn: fetchOnce(
        streamRes(
          textChunks(
            frame({ id: "x" }),
            frame({ choices: [{ delta: {} }] }),
            delta("ok"),
            COMPLETED,
          ),
        ),
      ),
    });
    expect(r.text).toBe("ok");
  });

  it("finish_reason=length 는 부분 텍스트 + incomplete 로 성공 취급", async () => {
    const r = await streamChatText({
      ...base,
      fetchFn: fetchOnce(streamRes(textChunks(delta("부분"), frame({ choices: [{ delta: {}, finish_reason: "length" }] })))),
    });
    expect(r).toEqual({ text: "부분", incomplete: "length" });
  });

  it("error 이벤트는 reject", async () => {
    await expect(
      streamChatText({
        ...base,
        fetchFn: fetchOnce(streamRes(textChunks(delta("a"), frame({ error: { message: "boom" } })))),
      }),
    ).rejects.toThrow("boom");
  });

  it("종결(finish_reason) 없이 스트림이 끊기면 reject", async () => {
    await expect(
      streamChatText({ ...base, fetchFn: fetchOnce(streamRes(textChunks(delta("잘림")))) }),
    ).rejects.toThrow("종결 이벤트 없이");
  });

  it("HTTP 401 은 auth 에러로 즉시 reject", async () => {
    await expect(
      streamChatText({ ...base, fetchFn: fetchOnce(new Response("{}", { status: 401 })) }),
    ).rejects.toThrow("auth");
  });

  it("body 미노출 환경이면 stream:false 로 재요청해 전체 텍스트를 1회 전달", async () => {
    const calls: string[] = [];
    const fetchFn = (async (_url: unknown, init?: RequestInit) => {
      calls.push(String(init?.body));
      if (calls.length === 1) return new Response(null, { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "버퍼링 폴백" } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const seen: string[] = [];
    const r = await streamChatText({ ...base, fetchFn, onDelta: (t) => seen.push(t) });
    expect(r.text).toBe("버퍼링 폴백");
    expect(seen).toEqual(["버퍼링 폴백"]);
    expect(calls[0]).toContain('"stream":true');
    expect(calls[1]).not.toContain('"stream":true');
  });
});
