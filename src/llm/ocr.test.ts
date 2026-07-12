import { describe, it, expect } from "vitest";
import { buildOcrRequest, runImageOcr } from "./ocr";

describe("buildOcrRequest (vision 요청 모양)", () => {
  it("image_url + 3-block 지시를 포함한다", () => {
    const req = buildOcrRequest("data:image/png;base64,AAAA");
    const user = req.messages.find((m) => m.role === "user")!;
    const content = user.content as Array<{ type: string; image_url?: { url: string }; text?: string }>;
    const img = content.find((c) => c.type === "image_url");
    const txt = content.find((c) => c.type === "text");
    expect(img?.image_url?.url).toBe("data:image/png;base64,AAAA");
    expect(txt?.text).toContain("## 원문");
    expect(txt?.text).toContain("## 요약");
  });
});

describe("runImageOcr", () => {
  it("키 없으면 오프라인 3-block 폴백(네트워크 호출 없음)", async () => {
    const r = await runImageOcr("data:image/png;base64,AAAA", "");
    expect(r.engine).toBe("none");
    expect(r.markdown).toContain("## 원문");
  });

  it("키 있으면 Chat Completions 를 호출하고 content 를 반환", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "## 원문\n\n필기 내용" } }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await runImageOcr("data:image/png;base64,AAAA", "sk-test", { fetchFn });
    expect(r.engine).toBe("gemini");
    expect(r.markdown).toContain("필기 내용");
  });

  it("lang='en' — 헤딩과 지시가 영어", () => {
    const req = buildOcrRequest("data:image/png;base64,x", undefined, "en");
    const txt = (req.messages[1].content as Array<{ type: string; text?: string }>).find((c) => c.type === "text");
    expect(txt?.text).toContain("## Original");
    expect(txt?.text).toContain("## Summary");
    expect(txt?.text).not.toContain("## 원문");
    expect(req.messages[0].content).toContain("OCR assistant");
  });
});
