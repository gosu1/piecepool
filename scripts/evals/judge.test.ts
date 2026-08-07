// judge 재시도 백오프 단위 테스트. 대기 계산(judgeRetryDelayMs)은 순수 함수라 타이머 목킹 없이 잰다.
// 루프 자체(어떤 응답에서 몇 번 시도하고 얼마나 기다리는가)는 fetch 스텁 + 가짜 타이머로 잰다.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { judgeRetryDelayMs, judgeJson } from "./judge";

describe("judgeRetryDelayMs", () => {
  it("기본 스케줄은 5s → 20s — 250·500ms 로는 503 혼잡 구간을 못 넘겼다", () => {
    expect(judgeRetryDelayMs(1)).toBe(5000);
    expect(judgeRetryDelayMs(2)).toBe(20000);
  });

  it("Retry-After 가 기본 스케줄보다 길면 그쪽을 따른다 — 서버가 말한 혼잡이 우선", () => {
    expect(judgeRetryDelayMs(1, 30)).toBe(30000);
    expect(judgeRetryDelayMs(2, 45)).toBe(45000);
  });

  it("Retry-After 가 기본보다 짧으면 기본을 쓴다 — 짧게 재시도해 한도만 태우지 않는다", () => {
    expect(judgeRetryDelayMs(1, 1)).toBe(5000);
    expect(judgeRetryDelayMs(2, 10)).toBe(20000);
  });

  it("60초로 캡한다 — 러너 한 번이 몇 분씩 멈추면 안 된다", () => {
    expect(judgeRetryDelayMs(1, 600)).toBe(60000);
    expect(judgeRetryDelayMs(2, 3600)).toBe(60000);
  });

  it("Retry-After 미지정·HTTP-date 형태는 기본 스케줄 — 파싱은 숫자(초)만 한다", () => {
    expect(judgeRetryDelayMs(1, undefined)).toBe(5000);
    expect(judgeRetryDelayMs(1, Number.NaN)).toBe(5000); // HTTP-date 를 Number() 로 읽은 결과
    expect(judgeRetryDelayMs(2, Number.NaN)).toBe(20000);
  });
});

// ── judgeJson 재시도 루프 ───────────────────────────────────
// 무엇을 시도로 세고 얼마나 기다리는지는 스케줄 함수가 아니라 루프가 정한다.
// fetch 를 스텁하고 가짜 타이머로 sleep 을 통과시켜, 호출 시각 차이로 실제 대기를 잰다.
describe("judgeJson 재시도 루프", () => {
  type Attempt = { waitedMs: number };

  // 응답을 attempt 순서대로 돌려주는 스텁. 값이 Error 면 reject(타임아웃·네트워크 오류 모사).
  async function callJudge(reply: (attempt: number) => Response | Error): Promise<{
    error: Error;
    attempts: Attempt[];
    calls: number;
  }> {
    const at: number[] = [];
    const fetchStub = vi.fn(async () => {
      at.push(Date.now());
      const r = reply(at.length - 1);
      if (r instanceof Error) throw r;
      return r;
    });
    vi.stubGlobal("fetch", fetchStub);

    const p = judgeJson("sys", { a: 1 }, {}, "key").then(
      () => new Error("판정이 성립했다 — 이 테스트는 전부 실패 경로다"),
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    );
    // 한 번에 60s 씩 밀어 준다 — 대기 최대치(캡)가 60s 라 시도마다 한 번이면 충분하고,
    // 여유를 둬 마지막 시도까지 확실히 소진시킨다.
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(60_000);

    return {
      error: await p,
      attempts: at.slice(1).map((t, i) => ({ waitedMs: t - at[i] })),
      calls: fetchStub.mock.calls.length,
    };
  }

  const fail = (status: number, headers?: Record<string, string>): Response =>
    new Response(null, { status, headers });

  // 200 인데 content 가 JSON 이 아닌 응답 — 모델이 스키마를 무시하고 산문으로 답한 경우.
  const okWithContent = (content: string): Response =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("503 이 계속 오면 5s → 20s 를 기다리고 3회에서 포기한다", async () => {
    const r = await callJudge(() => fail(503));
    expect(r.calls).toBe(3);
    expect(r.attempts.map((a) => a.waitedMs)).toEqual([5000, 20000]);
    expect(r.error.message).toContain("HTTP 503");
    expect(r.error.message).toContain("(3회 시도 소진)");
  });

  it("Retry-After: 30 이 오면 기본(5s)보다 길어 30s 를 기다린다", async () => {
    const r = await callJudge(() => fail(503, { "retry-after": "30" }));
    expect(r.attempts[0].waitedMs).toBe(30000);
  });

  it("Retry-After 가 HTTP-date 면 무시하고 기본 스케줄 — 시계 차가 대기 오차가 된다", async () => {
    const r = await callJudge(() => fail(503, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }));
    expect(r.attempts.map((a) => a.waitedMs)).toEqual([5000, 20000]);
  });

  it("재시도 대상이 아닌 4xx 는 1회로 끝난다 — 잘못된 요청을 세 번 보내도 답은 같다", async () => {
    const r = await callJudge(() => fail(400));
    expect(r.calls).toBe(1);
    expect(r.error.message).toContain("HTTP 400");
    expect(r.error.message).toContain("(1회 시도 소진)");
  });

  it("fetch 자체가 던져도(타임아웃·네트워크) 재시도한다 — 혼잡은 503 말고 지연으로도 온다", async () => {
    const r = await callJudge(() => new Error("The operation was aborted due to timeout"));
    expect(r.calls).toBe(3);
    expect(r.attempts.map((a) => a.waitedMs)).toEqual([5000, 20000]);
    expect(r.error.message).toContain("aborted due to timeout");
    expect(r.error.message).toContain("(3회 시도 소진)");
  });

  it("200 이어도 본문이 JSON 이 아니면 재시도한다 — 빈 응답은 3회인데 깨진 응답만 1회면 비대칭이다", async () => {
    const r = await callJudge(() => okWithContent("환각 여부를 판정하기 어렵습니다."));
    expect(r.calls).toBe(3);
    expect(r.attempts.map((a) => a.waitedMs)).toEqual([5000, 20000]);
    expect(r.error.message).toContain("bad body");
    expect(r.error.message).toContain("(3회 시도 소진)");
  });
});
