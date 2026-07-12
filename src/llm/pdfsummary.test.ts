import { describe, it, expect } from "vitest";
import { runPdfSummary, buildPdfSummaryBody, SUMMARY_MAX_CHARS, PdfSummaryStreamError } from "./pdfsummary";
import { GEMINI_MODEL } from "./gemini";

function frame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}
function sseRes(...frames: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f));
      c.close();
    },
  });
  return new Response(body, { status: 200 });
}

const INPUT = { sourceTitle: "Attention Is All You Need", sourceText: "The Transformer uses self-attention. d_model = 512." };

describe("buildPdfSummaryBody", () => {
  it("번역·요약 규칙 + 콜아웃/수식/구조 지시 + 파라미터를 포함한다", () => {
    const b = buildPdfSummaryBody(INPUT);
    expect(b.model).toBe(GEMINI_MODEL); // 하드코딩 금지 — 단종 시 거짓 실패
    const sys = b.messages[0].content;
    expect(sys).toContain("한국어"); // 번역 지시
    expect(sys).toContain("지어내지 않는다"); // 반환각(anti-hallucination)
    expect(sys).toContain("# 요약");
    expect(sys).toContain("[!easy]");
    expect(sys).toContain("$...$"); // KaTeX 수식
    expect(b.messages[1].content).toContain("Attention Is All You Need");
    expect(b.max_tokens).toBeGreaterThan(0);
    expect(b.temperature).toBeGreaterThanOrEqual(0);
  });

  it("lang='en' — 영어 요약 지시, 한국어 번역 지시 없음, 콜아웃·수식 규칙 유지", () => {
    const b = buildPdfSummaryBody(INPUT, undefined, "en");
    const sys = b.messages[0].content;
    expect(sys).toContain("# Summary");
    expect(sys).toContain("[!easy]");
    expect(sys).toContain("$...$");
    expect(sys).not.toContain("한국어");
    expect(b.messages[1].content).toContain("English summary note");
  });

  it("SUMMARY_MAX_CHARS 초과 입력은 잘리고 '잘림' 마커가 붙는다", () => {
    const long = "x".repeat(SUMMARY_MAX_CHARS + 100);
    const b = buildPdfSummaryBody({ sourceTitle: "T", sourceText: long });
    expect(b.messages[1].content).toContain("잘림");
    expect(b.messages[1].content.length).toBeLessThan(long.length + 500);
  });
});

describe("runPdfSummary — 스트리밍", () => {
  it("스트림 성공 → markdown + delta 누적, truncated=false", async () => {
    const seen: string[] = [];
    const r = await runPdfSummary(INPUT, "sk-test", {
      fetchFn: (async () =>
        sseRes(
          frame({ choices: [{ delta: { content: "# 요약\n" } }] }),
          frame({ choices: [{ delta: { content: "트랜스포머 설명" } }] }),
          frame({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        )) as unknown as typeof fetch,
      onDelta: (t) => seen.push(t),
      backoffMs: 0,
    });
    expect(r.markdown).toBe("# 요약\n트랜스포머 설명");
    expect(r.truncated).toBe(false);
    expect(r.warning).toBeUndefined();
    expect(seen[seen.length - 1]).toBe("# 요약\n트랜스포머 설명");
  });

  it("finish_reason=length → warning '일부만 생성됨'", async () => {
    const r = await runPdfSummary(INPUT, "sk-test", {
      fetchFn: (async () =>
        sseRes(
          frame({ choices: [{ delta: { content: "부분" } }] }),
          frame({ choices: [{ delta: {}, finish_reason: "length" }] }),
        )) as unknown as typeof fetch,
      backoffMs: 0,
    });
    expect(r.warning).toContain("일부만 생성됨");
  });

  it("긴 입력이면 truncated=true", async () => {
    const r = await runPdfSummary(
      { sourceTitle: "T", sourceText: "y".repeat(SUMMARY_MAX_CHARS + 1) },
      "sk-test",
      {
        fetchFn: (async () =>
          sseRes(
            frame({ choices: [{ delta: { content: "요약" } }] }),
            frame({ choices: [{ delta: {}, finish_reason: "stop" }] }),
          )) as unknown as typeof fetch,
        backoffMs: 0,
      },
    );
    expect(r.truncated).toBe(true);
  });

  it("첫 delta 이전 실패는 재시도 후 throw (부분 없음)", async () => {
    let calls = 0;
    await expect(
      runPdfSummary(INPUT, "sk-test", {
        fetchFn: (async () => {
          calls++;
          throw new Error("network down");
        }) as unknown as typeof fetch,
        maxRetries: 2,
        backoffMs: 0,
      }),
    ).rejects.toThrow("network down");
    expect(calls).toBe(3); // 1 + 재시도 2
  });

  it("첫 delta 이후 실패는 PdfSummaryStreamError", async () => {
    await expect(
      runPdfSummary(INPUT, "sk-test", {
        fetchFn: (async () =>
          sseRes(
            frame({ choices: [{ delta: { content: "반쯤" } }] }),
            frame({ error: { message: "connection reset" } }),
          )) as unknown as typeof fetch,
        backoffMs: 0,
      }),
    ).rejects.toBeInstanceOf(PdfSummaryStreamError);
  });

  it("auth 실패는 재시도 없이 즉시 throw", async () => {
    let calls = 0;
    await expect(
      runPdfSummary(INPUT, "sk-test", {
        fetchFn: (async () => {
          calls++;
          return new Response("{}", { status: 401 });
        }) as unknown as typeof fetch,
        maxRetries: 2,
        backoffMs: 0,
      }),
    ).rejects.toThrow(/auth/);
    expect(calls).toBe(1);
  });

  it("AbortError 는 그대로 전파", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    await expect(
      runPdfSummary(INPUT, "sk-test", {
        fetchFn: (async () => {
          throw abort;
        }) as unknown as typeof fetch,
        backoffMs: 0,
      }),
    ).rejects.toBe(abort);
  });

  it("키 없으면 throw (오프라인 폴백 없음 — 번역 불가)", async () => {
    await expect(runPdfSummary(INPUT, "")).rejects.toThrow(/auth|키/);
  });
});
