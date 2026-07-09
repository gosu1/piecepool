import { describe, it, expect } from "vitest";
import { buildOutlineRequest, runOutline, OUTLINE_MAX_CHARS } from "./outline";

describe("buildOutlineRequest (요청 모양)", () => {
  it("목차 지시 + 추출 텍스트를 포함한다", () => {
    const req = buildOutlineRequest("CPU 스케줄링은 프로세스에 CPU를 할당한다.");
    const user = req.messages.find((m) => m.role === "user")!;
    expect(user.content).toContain("목차");
    expect(user.content).toContain("## 대주제");
    expect(user.content).toContain("### 소주제");
    expect(user.content).toContain("CPU 스케줄링");
  });

  it("상한 초과 입력은 잘리고 잘림 표시가 붙는다", () => {
    const req = buildOutlineRequest("가".repeat(OUTLINE_MAX_CHARS + 1000));
    const user = req.messages.find((m) => m.role === "user")!;
    expect((user.content as string).length).toBeLessThan(OUTLINE_MAX_CHARS + 500);
    expect(user.content).toContain("잘림");
  });
});

describe("runOutline", () => {
  it("키 없으면 목차 없이(\"\") 폴백 — 네트워크 호출 없음", async () => {
    const r = await runOutline("원문 텍스트", "");
    expect(r.engine).toBe("none");
    expect(r.markdown).toBe("");
  });

  it("빈 텍스트면 키 있어도 호출하지 않는다", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runOutline("  ", "sk-test", { fetchFn });
    expect(called).toBe(false);
    expect(r.engine).toBe("none");
  });

  it("키 있으면 Chat Completions 를 호출하고 목차 content 를 반환", async () => {
    const fetchFn = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "## 스케줄링\n### 선점형\n### 비선점형" } }] }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const r = await runOutline("추출 텍스트", "sk-test", { fetchFn });
    expect(r.engine).toBe("gemini");
    expect(r.markdown).toContain("## 스케줄링");
    expect(r.markdown).toContain("### 선점형");
  });

  it("48k 초과 입력이면 truncated=true", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "## 대주제" } }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await runOutline("가".repeat(OUTLINE_MAX_CHARS + 1), "sk-test", { fetchFn });
    expect(r.truncated).toBe(true);
    const short = await runOutline("짧은 텍스트", "sk-test", { fetchFn });
    expect(short.truncated).toBe(false);
  });

  it("HTTP 오류는 throw — 호출부(importPdf)가 목차 없이 폴백", async () => {
    const fetchFn = (async () => new Response("err", { status: 500 })) as unknown as typeof fetch;
    await expect(runOutline("추출 텍스트", "sk-test", { fetchFn })).rejects.toThrow("HTTP 500");
  });
});
