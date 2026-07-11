import { describe, it, expect } from "vitest";
import { probeExplanation, type Turn } from "./feynman";

const NOTE = "# 운영체제 3주차\n\n임계 구역에는 락을 건다. 프로세스는 실행 중인 프로그램이다.\n프로세스란 코드·데이터·스택으로 구성된다. 예를 들어 크롬 탭 하나가 프로세스다.";

function geminiOk(payload: unknown) {
  return async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
}

const askedOnce: Turn[] = [{ role: "user", text: "여러 스레드가 동시에 들어가면 안 되는 코드 부분이요" }];

describe("probeExplanation", () => {
  it("구조화 출력을 파싱한다", async () => {
    const p = await probeExplanation("임계 구역", NOTE, askedOnce, "k", {
      fetchFn: geminiOk({ probe: "왜 동시에 들어가면 안 되나요?", targetGap: "why" }) as unknown as typeof fetch,
    });
    expect(p).toEqual({ probe: "왜 동시에 들어가면 안 되나요?", targetGap: "why" });
  });

  it("알 수 없는 targetGap 은 why 로 떨어진다", async () => {
    const p = await probeExplanation("임계 구역", NOTE, askedOnce, "k", {
      fetchFn: geminiOk({ probe: "예를 들면요?", targetGap: "만들어낸값" }) as unknown as typeof fetch,
    });
    expect(p.targetGap).toBe("why");
  });

  it("대화 전체를 프롬프트에 담는다 — 앞말과의 모순을 짚으려면 필요하다", async () => {
    let sent = "";
    const history: Turn[] = [
      { role: "user", text: "락을 걸면 됩니다" },
      { role: "probe", text: "왜 걸어야 하나요?" },
      { role: "user", text: "값이 꼬여서요" },
    ];
    await probeExplanation("임계 구역", NOTE, history, "k", {
      fetchFn: (async (_u: string, init: RequestInit) => {
        sent = String(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"probe":"어떻게 꼬이나요?","targetGap":"example"}' } }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(sent).toContain("락을 걸면 됩니다");
    expect(sent).toContain("값이 꼬여서요");
    expect(sent).toContain("왜 걸어야 하나요?");
  });

  it("프롬프트가 '답 금지·판정 금지·구멍 하나' 를 강제한다", async () => {
    let sent = "";
    await probeExplanation("임계 구역", NOTE, askedOnce, "k", {
      fetchFn: (async (_u: string, init: RequestInit) => {
        sent = String(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"probe":"q","targetGap":"why"}' } }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(sent).toContain("NEVER give the answer");
    expect(sent).toContain("NEVER judge sufficiency");
    expect(sent).toContain("Ask EXACTLY ONE thing");
    // eval 이 잡은 회귀 둘 — 프롬프트에서 사라지면 다시 새어 나온다(docs/30-llm/evals/feynman)
    expect(sent).toContain("do not correct them"); // 사실 오류를 정답으로 고쳐주지 않는다
    expect(sent).toContain("NEVER write the word '학생'"); // 3인칭 호칭 금지
  });

  it("키가 없으면 던진다 — 파인만은 휴리스틱으로 만들 수 없다", async () => {
    await expect(probeExplanation("임계 구역", NOTE, askedOnce, "  ")).rejects.toThrow(/API key/);
  });

  it("사용자 설명 없이는 되묻지 않는다", async () => {
    const f = geminiOk({ probe: "q", targetGap: "why" }) as unknown as typeof fetch;
    await expect(probeExplanation("임계 구역", NOTE, [], "k", { fetchFn: f })).rejects.toThrow(/설명 뒤에만/);
    await expect(
      probeExplanation("임계 구역", NOTE, [{ role: "probe", text: "q" }], "k", { fetchFn: f }),
    ).rejects.toThrow(/설명 뒤에만/);
  });

  it("HTTP 실패는 재시도 소진 후 던진다", async () => {
    await expect(
      probeExplanation("임계 구역", NOTE, askedOnce, "k", {
        fetchFn: (async () => new Response("", { status: 429 })) as unknown as typeof fetch,
        backoffMs: 0,
      }),
    ).rejects.toThrow(/HTTP 429/);
  });

  it("503(overloaded)은 재시도해서 성공한다 — Gemini 가 자주 낸다", async () => {
    let calls = 0;
    const p = await probeExplanation("임계 구역", NOTE, askedOnce, "k", {
      backoffMs: 0,
      fetchFn: (async () => {
        calls++;
        return calls < 3
          ? new Response("", { status: 503 })
          : new Response(JSON.stringify({ choices: [{ message: { content: '{"probe":"왜요?","targetGap":"why"}' } }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(3);
    expect(p.probe).toBe("왜요?");
  });

  it("401 은 재시도하지 않는다 — 같은 답이 온다", async () => {
    let calls = 0;
    await expect(
      probeExplanation("임계 구역", NOTE, askedOnce, "k", {
        backoffMs: 0,
        fetchFn: (async () => {
          calls++;
          return new Response("", { status: 401 });
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 401/);
    expect(calls).toBe(1);
  });

  it("네트워크 오류도 재시도한다", async () => {
    let calls = 0;
    const p = await probeExplanation("임계 구역", NOTE, askedOnce, "k", {
      backoffMs: 0,
      fetchFn: (async () => {
        calls++;
        if (calls < 2) throw new TypeError("fetch failed");
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"probe":"왜요?","targetGap":"why"}' } }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(2);
    expect(p.probe).toBe("왜요?");
  });

  it("구조화 출력이 비면 던진다", async () => {
    await expect(
      probeExplanation("임계 구역", NOTE, askedOnce, "k", {
        fetchFn: geminiOk({ targetGap: "why" }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/no structured output/);
  });
});
