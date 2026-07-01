import { describe, it, expect } from "vitest";
import { buildOcrRequest, runImageOcr } from "./ocr";

describe("buildOcrRequest (vision 요청 모양)", () => {
  it("input_image + 3-block 지시를 포함한다", () => {
    const req = buildOcrRequest("data:image/png;base64,AAAA");
    const user = req.input.find((m) => m.role === "user")!;
    const content = user.content as Array<{ type: string; image_url?: string; text?: string }>;
    const img = content.find((c) => c.type === "input_image");
    const txt = content.find((c) => c.type === "input_text");
    expect(img?.image_url).toBe("data:image/png;base64,AAAA");
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

  it("키 있으면 Responses API 를 호출하고 output_text 를 반환", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ output_text: "## 원문\n\n필기 내용" }), { status: 200 })) as unknown as typeof fetch;
    const r = await runImageOcr("data:image/png;base64,AAAA", "sk-test", { fetchFn });
    expect(r.engine).toBe("openai");
    expect(r.markdown).toContain("필기 내용");
  });
});
