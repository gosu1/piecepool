import { describe, it, expect } from "vitest";
import { buildPdfDigestRequest, runPdfDigest, DIGEST_MAX_CHARS } from "./pdfdigest";

describe("buildPdfDigestRequest (요청 모양)", () => {
  it("정리 지시 + 추출 텍스트를 포함한다", () => {
    const req = buildPdfDigestRequest("CPU 스케줄링은 프로세스에 CPU를 할당한다.");
    const user = req.messages.find((m) => m.role === "user")!;
    expect(user.content).toContain("## 정리");
    expect(user.content).toContain("## 요약");
    expect(user.content).toContain("CPU 스케줄링");
  });

  it("상한 초과 입력은 잘리고 잘림 표시가 붙는다", () => {
    const req = buildPdfDigestRequest("가".repeat(DIGEST_MAX_CHARS + 1000));
    const user = req.messages.find((m) => m.role === "user")!;
    expect((user.content as string).length).toBeLessThan(DIGEST_MAX_CHARS + 500);
    expect(user.content).toContain("잘림");
  });
});

describe("runPdfDigest", () => {
  it("키 없으면 원문 그대로 폴백(네트워크 호출 없음)", async () => {
    const r = await runPdfDigest("원문 텍스트", "");
    expect(r.engine).toBe("none");
    expect(r.markdown).toBe("원문 텍스트");
  });

  it("빈 텍스트면 키 있어도 호출하지 않는다", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runPdfDigest("  ", "sk-test", { fetchFn });
    expect(called).toBe(false);
    expect(r.engine).toBe("none");
  });

  it("키 있으면 Chat Completions 를 호출하고 content 를 반환", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "## 정리\n\n- 선점형과 비선점형" } }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await runPdfDigest("추출 텍스트", "sk-test", { fetchFn });
    expect(r.engine).toBe("gemini");
    expect(r.markdown).toContain("선점형과 비선점형");
  });

  it("48k 초과 입력이면 truncated=true (호출부가 잘림 안내 표시)", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "## 정리\n\n- 요약" } }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await runPdfDigest("가".repeat(DIGEST_MAX_CHARS + 1), "sk-test", { fetchFn });
    expect(r.truncated).toBe(true);
    const short = await runPdfDigest("짧은 텍스트", "sk-test", { fetchFn });
    expect(short.truncated).toBe(false);
  });

  it("HTTP 오류는 throw — 호출부(importPdf)가 원문 폴백", async () => {
    const fetchFn = (async () => new Response("err", { status: 500 })) as unknown as typeof fetch;
    await expect(runPdfDigest("추출 텍스트", "sk-test", { fetchFn })).rejects.toThrow("HTTP 500");
  });
});
