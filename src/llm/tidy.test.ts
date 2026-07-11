import { describe, it, expect } from "vitest";
import { runTidy, buildTidyBody, TidyNoKeyError, TidyStreamError } from "./tidy";
import { GEMINI_MODEL } from "./gemini";

// SSE 프레임 한 개 = delta.content 하나. stream.ts 는 finish_reason 을 만나야 정상 종결로 본다
// (없이 끊기면 "종결 이벤트 없이 스트림 종료" 에러 — 의도된 동작).
function frame(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}
function stop(): string {
  return `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`;
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

const MEMO = "어텐션 = 걍 어디를 볼지 정하는거\nsoftmax 때리면 확률됨\n근데 왜 루트dk로 나누지?";

describe("buildTidyBody — 문체 보존이 프롬프트의 계약이다", () => {
  it("학생의 문장·말투를 살리라고 지시한다", () => {
    const sys = buildTidyBody(MEMO).messages[0].content;
    expect(sys).toContain("표현 방식을 지운다면 그것은 실패다");
    expect(sys).toContain("말투");
    expect(sys).toContain("교과서 문체로 바꾸지 마라");
  });

  it("학생의 질문에 답을 채우지 말라고 지시한다 — 모르는 지점의 표식이므로", () => {
    const sys = buildTidyBody(MEMO).messages[0].content;
    expect(sys).toContain("질문 그대로 남긴다");
    expect(sys).toContain("답을 채우지 마라");
  });

  it("파편을 지어내거나 빼지 말라고 지시한다", () => {
    const sys = buildTidyBody(MEMO).messages[0].content;
    expect(sys).toContain("추가하지 않는다");
    expect(sys).toContain("빼지 않는다");
  });

  it("모델명은 상수를 쓴다 — 하드코딩 회귀 방지(gemini-2.5-flash 단종 전례)", () => {
    expect(buildTidyBody(MEMO).model).toBe(GEMINI_MODEL);
  });

  it("파편 원문을 user 메시지에 그대로 싣는다", () => {
    expect(buildTidyBody(MEMO).messages[1].content).toContain(MEMO);
  });
});

describe("runTidy — 스트리밍", () => {
  it("델타를 누적해 전체 텍스트를 만들고, onDelta 로 진행을 알린다", async () => {
    const seen: string[] = [];
    const text = await runTidy(MEMO, "k", {
      fetchFn: async () => sseRes(frame("# 어텐션\n"), frame("## 핵심\n"), frame("걍 어디를 볼지 정하는 거다."), stop()),
      onDelta: (full) => seen.push(full),
    });
    expect(text).toBe("# 어텐션\n## 핵심\n걍 어디를 볼지 정하는 거다.");
    expect(seen[seen.length - 1]).toBe(text);
    expect(seen.length).toBe(3); // 델타마다 누적본 전달
  });
});

describe("runTidy — 실패를 조용히 덮지 않는다 (폴백 금지)", () => {
  it("키가 없으면 호출하지 않고 TidyNoKeyError 를 던진다", async () => {
    let called = false;
    await expect(
      runTidy(MEMO, "", {
        fetchFn: async () => {
          called = true;
          return sseRes(frame("x"));
        },
      }),
    ).rejects.toBeInstanceOf(TidyNoKeyError);
    expect(called).toBe(false);
  });

  it("스트림 시작 전 실패는 재시도 후 에러를 던진다 — 오프라인 결과로 대체하지 않는다", async () => {
    let calls = 0;
    await expect(
      runTidy(MEMO, "k", {
        backoffMs: 0,
        fetchFn: async () => {
          calls++;
          throw new Error("503 UNAVAILABLE");
        },
      }),
    ).rejects.toThrow("503");
    expect(calls).toBe(3); // 최초 + 재시도 2
  });

  it("첫 델타 이후 끊기면 TidyStreamError — 받은 부분은 이미 화면에 있다", async () => {
    const seen: string[] = [];
    await expect(
      runTidy(MEMO, "k", {
        backoffMs: 0,
        onDelta: (full) => seen.push(full),
        fetchFn: async () => {
          // enqueue 직후 error() 를 부르면 큐가 통째로 버려진다 — 청크가 도착한 "뒤에" 끊겨야
          // 실제 도중 절단이 재현된다. pull 로 한 번 내보내고 다음 읽기에서 끊는다.
          const enc = new TextEncoder();
          let sent = false;
          return new Response(
            new ReadableStream<Uint8Array>({
              pull(c) {
                if (!sent) {
                  sent = true;
                  c.enqueue(enc.encode(frame("# 어텐션")));
                } else {
                  c.error(new Error("연결 끊김"));
                }
              },
            }),
            { status: 200 },
          );
        },
      }),
    ).rejects.toBeInstanceOf(TidyStreamError);
    expect(seen[seen.length - 1]).toBe("# 어텐션"); // 부분 텍스트는 보존된다
  });

  it("빈 응답도 실패다 — 성공인 척하지 않는다", async () => {
    await expect(runTidy(MEMO, "k", { backoffMs: 0, fetchFn: async () => sseRes() })).rejects.toThrow();
  });
});
