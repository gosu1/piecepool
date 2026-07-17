import { describe, it, expect } from "vitest";
import { analogyHint, probeExplanation, type Turn } from "./feynman";

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

  it("deps.lang='en' → system이 영어 톤, 존댓말 지시 없음", async () => {
    let sent = "";
    const ok = new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ probe: "Why?", targetGap: "why" }) } }] }),
      { status: 200 },
    );
    await probeExplanation("TCP", "note", [{ role: "user", text: "설명" }], "k", {
      lang: "en",
      backoffMs: 0,
      fetchFn: (async (_u: unknown, init: { body: string }) => {
        sent = init.body;
        return ok;
      }) as unknown as typeof fetch,
    });
    const body = JSON.parse(sent);
    expect(body.messages[0].content).toContain("Write all prose in English");
    expect(body.messages[0].content).not.toContain("존댓말");
  });

  it("기본(ko) → system에 존댓말 + 혼용 규칙", async () => {
    let sent = "";
    const ok = new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ probe: "왜죠?", targetGap: "why" }) } }] }),
      { status: 200 },
    );
    await probeExplanation("TCP", "note", [{ role: "user", text: "설명" }], "k", {
      backoffMs: 0,
      fetchFn: (async (_u: unknown, init: { body: string }) => {
        sent = init.body;
        return ok;
      }) as unknown as typeof fetch,
    });
    const body = JSON.parse(sent);
    expect(body.messages[0].content).toContain("존댓말");
    expect(body.messages[0].content).toContain("원문 표기를 그대로");
  });
});

describe("analogyHint", () => {
  it("비유 한 문장 + 힌트 키워드를 파싱한다", async () => {
    const h = await analogyHint("single-head attention", NOTE, "k", {
      fetchFn: geminiOk({
        analogy: "single-head attention을 탐정 한 명에 비유해보세요",
        keywords: ["탐정", "사건 현장", "단서", "혼자서"],
      }) as unknown as typeof fetch,
    });
    expect(h).toEqual({
      analogy: "single-head attention을 탐정 한 명에 비유해보세요",
      keywords: ["탐정", "사건 현장", "단서", "혼자서"],
    });
  });

  it("keywords 가 깨져 있으면 정리한다 — 비유 한 문장만으로도 힌트는 성립한다", async () => {
    const h = await analogyHint("c", NOTE, "k", {
      fetchFn: geminiOk({ analogy: "a", keywords: [1, " 탐정 ", "", "탐정"] }) as unknown as typeof fetch,
    });
    expect(h.keywords).toEqual(["탐정"]); // 비문자열·공백 제거 + 중복 제거
    const none = await analogyHint("c", NOTE, "k", {
      fetchFn: geminiOk({ analogy: "a" }) as unknown as typeof fetch,
    });
    expect(none.keywords).toEqual([]);
  });

  it("keywords 가 넘치면 6개로 자른다 — strict:false 라 스키마 maxItems 를 못 믿는다", async () => {
    const h = await analogyHint("c", NOTE, "k", {
      fetchFn: geminiOk({ analogy: "a", keywords: ["a", "b", "c", "d", "e", "f", "g", "h"] }) as unknown as typeof fetch,
    });
    expect(h.keywords).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("analogy 가 비면 던진다", async () => {
    await expect(
      analogyHint("c", NOTE, "k", { fetchFn: geminiOk({ keywords: ["탐정"] }) as unknown as typeof fetch }),
    ).rejects.toThrow(/no structured output/);
  });

  it("키가 없으면 던진다 — 힌트도 휴리스틱으로 만들 수 없다", async () => {
    await expect(analogyHint("c", NOTE, "  ")).rejects.toThrow(/API key/);
  });

  it("프롬프트가 '답 금지·비유만' 을 강제하고 개념·노트를 맥락으로 담는다", async () => {
    let sent = "";
    await analogyHint("임계 구역", NOTE, "k", {
      fetchFn: (async (_u: string, init: RequestInit) => {
        sent = String(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"analogy":"a","keywords":["b"]}' } }] }), {
          status: 200,
        });
      }) as unknown as typeof fetch,
    });
    expect(sent).toContain("NEVER give the answer");
    expect(sent).toContain("no analogy-to-concept mapping");
    expect(sent).toContain("비유해보세요");
    expect(sent).toContain("임계 구역");
    expect(sent).toContain("락을 건다"); // 노트 본문이 맥락으로 들어간다
  });

  it("503(overloaded)은 재시도해서 성공한다 — 재시도 규약은 probe 와 같다", async () => {
    let calls = 0;
    const h = await analogyHint("c", NOTE, "k", {
      backoffMs: 0,
      fetchFn: (async () => {
        calls++;
        return calls < 3
          ? new Response("", { status: 503 })
          : new Response(JSON.stringify({ choices: [{ message: { content: '{"analogy":"a","keywords":["b"]}' } }] }), {
              status: 200,
            });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(3);
    expect(h.analogy).toBe("a");
  });
});
