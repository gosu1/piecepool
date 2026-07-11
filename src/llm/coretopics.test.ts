import { describe, it, expect, vi } from "vitest";
import { classifyCoreSections } from "./coretopics";

const chat = (payload: unknown) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

const SECTIONS = [
  { heading: "어텐션", excerpt: "쿼리와 키의 유사도로 가중치를 만든다." },
  { heading: "참고 문헌", excerpt: "Vaswani et al., 2017." },
];

describe("classifyCoreSections", () => {
  it("Gemini 판정을 입력 순서에 맞춰 돌려준다", async () => {
    const f = vi.fn().mockResolvedValue(
      chat({ sections: [{ id: 0, isCore: true, reason: "모델의 뼈대" }, { id: 1, isCore: false }] }),
    ) as unknown as typeof fetch;

    const r = await classifyCoreSections("Transformer", SECTIONS, "k", { fetchFn: f });
    expect(r).toMatchObject({ core: [true, false], engine: "gemini" });
    expect(r.reasons[0]).toBe("모델의 뼈대");
  });

  it("없는 id 는 버린다 — 환각이 사용자를 막지 못한다", async () => {
    const f = vi.fn().mockResolvedValue(
      chat({ sections: [{ id: 7, isCore: true }, { id: -1, isCore: true }, { id: 1, isCore: true }] }),
    ) as unknown as typeof fetch;

    const r = await classifyCoreSections("T", SECTIONS, "k", { fetchFn: f });
    expect(r.core).toEqual([false, true]);
  });

  it("판정을 못 받은 섹션은 핵심이 아니다 — 잘못 막는 것보다 못 막는 게 낫다", async () => {
    const f = vi.fn().mockResolvedValue(chat({ sections: [{ id: 1, isCore: true }] })) as unknown as typeof fetch;
    const r = await classifyCoreSections("T", SECTIONS, "k", { fetchFn: f });
    expect(r.core).toEqual([false, true]); // id 0 은 응답에 없다 → false
  });

  it("키가 없으면 부르지 않고 engine=none — 게이트가 걸리지 않는다", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const r = await classifyCoreSections("T", SECTIONS, "  ", { fetchFn: f });
    expect(r).toEqual({ core: [false, false], reasons: ["", ""], engine: "none" });
    expect(f).not.toHaveBeenCalled();
  });

  it("호출이 끝내 실패해도 던지지 않는다 — 게이트가 사람을 잘못 막지 않는다", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    const r = await classifyCoreSections("T", SECTIONS, "k", { fetchFn: f, maxRetries: 1, backoffMs: 0 });
    expect(r.engine).toBe("none");
    expect(r.core).toEqual([false, false]);
    expect(f).toHaveBeenCalledTimes(2); // 503 은 재시도한다
  });

  it("멈춘 네트워크를 끊는다 — 게이트가 영원히 pending 이면 fail-open 이 아니라 영구 차단이다", async () => {
    // 응답이 오지 않는 fetch. 타임아웃이 없으면 이 Promise 는 영원히 안 끝난다.
    const f = vi.fn((_u: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))),
    ) as unknown as typeof fetch;

    const r = await classifyCoreSections("T", SECTIONS, "k", { fetchFn: f, timeoutMs: 20, maxRetries: 1, backoffMs: 0 });

    expect(r.engine).toBe("none"); // 끊고 fail-open
    expect(f).toHaveBeenCalledTimes(2);
  }, 5000);

  it("200 OK + 빈 sections 는 '핵심 없음' 이 아니다 — 게이트가 조용히 꺼지면 안 된다", async () => {
    const f = vi.fn().mockResolvedValue(chat({ sections: [] })) as unknown as typeof fetch;
    const r = await classifyCoreSections("T", SECTIONS, "k", { fetchFn: f });
    // engine:"gemini" 였다면 core=[false,false] 가 캐시돼 그 노트의 게이트가 영원히 꺼진다.
    expect(r.engine).toBe("none");
  });

  it("모두 isCore:false 는 정상 판정이다 — '핵심 없음' 도 답이다", async () => {
    const f = vi.fn().mockResolvedValue(
      chat({ sections: [{ id: 0, isCore: false }, { id: 1, isCore: false }] }),
    ) as unknown as typeof fetch;
    const r = await classifyCoreSections("T", SECTIONS, "k", { fetchFn: f });
    expect(r).toMatchObject({ core: [false, false], engine: "gemini" });
  });

  it("깨진 JSON 도 삼킨다", async () => {
    const f = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "쓰레기" } }] }) }) as unknown as typeof fetch;
    const r = await classifyCoreSections("T", SECTIONS, "k", { fetchFn: f });
    expect(r.engine).toBe("none");
  });
});
