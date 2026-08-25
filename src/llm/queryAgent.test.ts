import { describe, expect, it, vi } from "vitest";
import { askQuery, MAX_ROUNDS } from "./queryAgent";

// 도구 실행은 실제 runTool 을 태우고, 그 아래 IPC 만 가짜로 둔다 — 배선까지 함께 본다.
vi.mock("../lib/ipc", () => ({
  listSpaces: vi.fn(async () => [{ id: "s1", name: "프로젝트", slug: "프로젝트", rootPath: "", createdAt: "", updatedAt: "" }]),
  listWiki: vi.fn(async () => [{ path: "브랜치 보호.md", title: "브랜치 보호", markdown: "# 브랜치 보호\n\n요약." }]),
  readWiki: vi.fn(async () => ({ title: "브랜치 보호", markdown: "# 브랜치 보호\n\nmain 에 직접 올리지 않는다." })),
  getGraph: vi.fn(async () => ({ nodes: [], relations: [] })),
}));

const KEY = { apiKey: "test-key" };

/** OpenAI 형식 응답 — 도구 요청 없이 바로 답. */
const answer = (text: string) => ({ choices: [{ message: { role: "assistant", content: text } }] });

/** OpenAI 형식 응답 — 도구 요청. */
const toolCall = (name: string, args: Record<string, unknown>, id = "c1") => ({
  choices: [
    {
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
      },
    },
  ],
});

/** 미리 정해둔 응답을 순서대로 돌려주는 가짜 fetch. */
function fakeFetch(...responses: unknown[]) {
  const bodies: any[] = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = responses.shift() ?? answer("(응답 없음)");
    return { ok: true, status: 200, json: async () => next, text: async () => "" } as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, bodies };
}

describe("askQuery", () => {
  it("도구를 안 부르면 그 답을 그대로 돌려준다", async () => {
    const { fn } = fakeFetch(answer("브랜치는 이렇습니다."));
    const r = await askQuery([{ role: "user", text: "브랜치 규칙?" }], { ...KEY, fetchFn: fn });
    expect(r.text).toBe("브랜치는 이렇습니다.");
    expect(r.rounds).toBe(1);
    expect(r.hitLimit).toBe(false);
  });

  it("도구 요청이 오면 실행하고 결과를 돌려준 뒤 이어서 답한다", async () => {
    const { fn, bodies } = fakeFetch(
      toolCall("list_spaces", {}),
      toolCall("read_wiki", { space: "프로젝트", file: "브랜치 보호.md" }),
      answer("main 에 직접 올리지 않습니다."),
    );
    const r = await askQuery([{ role: "user", text: "브랜치 규칙?" }], { ...KEY, fetchFn: fn });

    expect(r.text).toBe("main 에 직접 올리지 않습니다.");
    expect(r.rounds).toBe(3);
    // 도구 결과가 role:"tool" 로 되돌아갔는가
    const sent = bodies[2].messages;
    expect(sent.filter((m: any) => m.role === "tool")).toHaveLength(2);
    expect(sent.find((m: any) => m.role === "tool").content).toContain("프로젝트");
    // 실제 위키 본문이 실려 갔는가
    expect(sent.at(-1).content).toContain("main 에 직접 올리지 않는다");
  });

  it("열어 본 위키를 출처로 모은다 — 같은 파일은 한 번만", async () => {
    const { fn } = fakeFetch(
      toolCall("read_wiki", { space: "프로젝트", file: "브랜치 보호.md" }),
      toolCall("read_wiki", { space: "프로젝트", file: "브랜치 보호.md" }, "c2"),
      answer("답"),
    );
    const r = await askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn });
    expect(r.citedWiki).toEqual(["프로젝트/브랜치 보호.md"]);
  });

  it("도구만 계속 부르면 상한에서 멈춘다", async () => {
    const { fn } = fakeFetch(...Array.from({ length: 10 }, () => toolCall("list_spaces", {})));
    const r = await askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn, maxRounds: 3 });
    expect(r.hitLimit).toBe(true);
    expect(r.rounds).toBe(3);
    expect(r.text).toContain("답을 만들지 못했어요");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("기본 상한은 6회다", () => {
    expect(MAX_ROUNDS).toBe(6);
  });

  it("인자가 깨져 와도 멈추지 않고 무엇이 필요한지 알려준다", async () => {
    const { fn, bodies } = fakeFetch(
      { choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "read_wiki", arguments: "{깨진" } }] } }] },
      answer("답"),
    );
    const r = await askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn });
    expect(r.text).toBe("답");
    expect(bodies[1].messages.at(-1).content).toContain("space");
  });

  it("이전 대화를 그대로 실어 보낸다", async () => {
    const { fn, bodies } = fakeFetch(answer("답"));
    await askQuery(
      [
        { role: "user", text: "첫 질문" },
        { role: "assistant", text: "첫 답" },
        { role: "user", text: "이어서" },
      ],
      { ...KEY, fetchFn: fn },
    );
    const roles = bodies[0].messages.map((m: any) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
  });

  it("답할 때의 규칙을 시스템 자리에 실어 보낸다", async () => {
    const { fn, bodies } = fakeFetch(answer("답"));
    await askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn });
    const sys = bodies[0].messages[0];
    expect(sys.role).toBe("system");
    // 위키에 없어도 답한다 — 라벨로 구분하는 것이 규칙이다
    expect(sys.content).toContain("[추론]");
    expect(sys.content).toContain("답을 거부하지 마라");
    // 위키에서 온 문장은 라벨이 없다는 규칙이 함께 있어야 라벨이 뜻을 갖는다
    expect(sys.content).toContain("안 붙은 문장은 반드시 위키에서 온 것");
    // 위키는 형식이 채워져야 만들어진다 — 대화 중 즉석 생성 제안은 시키지 않는다
    expect(sys.content).toContain("추가하자거나 저장하자는 제안은 하지 마라");
    // 사용자 어휘와 위키 어휘가 다를 수 있다(제1종 오류 vs FP)
    expect(sys.content).toContain("다른 이름도 함께 떠올려");
  });

  it("도구 설명서를 함께 보낸다", async () => {
    const { fn, bodies } = fakeFetch(answer("답"));
    await askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn });
    expect(bodies[0].tools.map((t: any) => t.function.name)).toEqual([
      "list_spaces",
      "list_wiki",
      "read_wiki",
      "get_relations",
    ]);
  });

  it("키가 없으면 무엇을 해야 하는지 알려준다", async () => {
    await expect(askQuery([{ role: "user", text: "?" }], { apiKey: "  " })).rejects.toThrow("API key 필요");
  });

  it("401 은 재시도하지 않고 바로 던진다", async () => {
    const fn = vi.fn(async () => ({ ok: false, status: 401, text: async () => "bad key" }) as unknown as Response);
    await expect(askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn as unknown as typeof fetch })).rejects.toThrow(
      "HTTP 401",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("429 는 재시도한 뒤 성공하면 답을 돌려준다", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n === 1) return { ok: false, status: 429, text: async () => "rate" } as unknown as Response;
      return { ok: true, status: 200, json: async () => answer("답") } as unknown as Response;
    });
    const r = await askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn as unknown as typeof fetch });
    expect(r.text).toBe("답");
    expect(n).toBe(2);
  });

  it("창이 닫혀 요청이 끊기면 재시도하지 않고 던진다", async () => {
    const fn = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    await expect(askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn as unknown as typeof fetch })).rejects.toThrow(
      "aborted",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("진행 표시를 회차마다 알려준다", async () => {
    const steps: string[] = [];
    const { fn } = fakeFetch(toolCall("list_spaces", {}), answer("답"));
    await askQuery([{ role: "user", text: "?" }], { ...KEY, fetchFn: fn, onProgress: (s) => steps.push(s) });
    expect(steps).toEqual(["위키를 찾는 중", "위키를 찾는 중 (2)"]);
  });
});
