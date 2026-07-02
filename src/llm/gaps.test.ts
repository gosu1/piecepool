import { describe, it, expect } from "vitest";
import { buildGaps, heuristicGaps } from "./gaps";
import { LinerClient } from "./liner";

// buildGaps 3단 폴백: Liner(주) → OpenAI 소크라테스(보조) → 휴리스틱(오프라인).

type FetchFn = typeof fetch;
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const NOTE = "# 페이징\n\n페이징은 메모리를 고정 크기로 나눈다.\n\n# 세그멘테이션\n\n가변 크기로 나눈다.";

function liner(handler: () => Promise<Response>): LinerClient {
  return new LinerClient({ config: { apiKey: "liner-test", backoffMs: 0, maxRetries: 0 }, fetchFn: handler as FetchFn });
}

describe("buildGaps 폴백 체인", () => {
  it("키 없음 → 휴리스틱", async () => {
    const r = await buildGaps("OS", NOTE, {});
    expect(r.engine).toBe("heuristic");
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions[0].allowOther).toBe(true);
  });

  it("Liner 성공 → engine=liner, 출처·label 선택지 포함", async () => {
    const client = liner(async () => jsonRes({ answer: "정답 기준", sources: [{ title: "OSTEP", url: "https://o.io", snippet: "페이징은 고정 크기 블록." }] }));
    const r = await buildGaps("OS", NOTE, { liner: "k" }, { linerClient: client });
    expect(r.engine).toBe("liner");
    expect(r.questions[0].sources?.[0].url).toBe("https://o.io");
    expect(r.questions[0].choices.some((c) => c.startsWith("출처 기준:"))).toBe(true);
  });

  it("Liner 전체 실패 + OpenAI 키 없음 → 휴리스틱", async () => {
    const client = liner(async () => {
      throw new Error("down");
    });
    const r = await buildGaps("OS", NOTE, { liner: "k" }, { linerClient: client });
    expect(r.engine).toBe("heuristic");
  });

  it("Liner 실패 + OpenAI 성공 → engine=openai (소크라테스식)", async () => {
    const client = liner(async () => {
      throw new Error("down");
    });
    const openaiFetch: FetchFn = (async (url: string | URL | Request) => {
      expect(String(url)).toContain("/responses");
      return jsonRes({
        output_parsed: {
          questions: [{ context: "페이징", prompt: "페이지 크기가 왜 고정일까요?", choices: ["단편화 관리", "속도"] }],
        },
      });
    }) as FetchFn;
    const r = await buildGaps("OS", NOTE, { liner: "k", openai: "sk-x" }, { linerClient: client, fetchFn: openaiFetch });
    expect(r.engine).toBe("openai");
    expect(r.questions[0].prompt).toContain("왜");
    expect(r.questions[0].allowOther).toBe(true);
  });

  it("Liner + OpenAI 둘 다 실패 → 휴리스틱 (절대 throw 하지 않음)", async () => {
    const client = liner(async () => {
      throw new Error("down");
    });
    const openaiFetch: FetchFn = (async () => jsonRes({}, 500)) as FetchFn;
    const r = await buildGaps("OS", NOTE, { liner: "k", openai: "sk-x" }, { linerClient: client, fetchFn: openaiFetch });
    expect(r.engine).toBe("heuristic");
    expect(r.questions.length).toBeGreaterThan(0);
  });
});

describe("heuristicGaps (기존 동작 보존)", () => {
  it("헤딩 섹션당 질문 1개, 최대 3개, 선택지 ≤ 3", () => {
    const qs = heuristicGaps("OS", NOTE);
    expect(qs.length).toBe(2);
    for (const q of qs) {
      expect(q.choices.length).toBeLessThanOrEqual(3);
      expect(q.allowOther).toBe(true);
    }
  });
  it("헤딩 없으면 제목 기준 1개", () => {
    const qs = heuristicGaps("제목", "그냥 본문 한 줄.");
    expect(qs.length).toBe(1);
    expect(qs[0].context).toBe("제목");
  });
});
