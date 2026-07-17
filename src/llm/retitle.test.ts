import { describe, it, expect, vi } from "vitest";
import { suggestRetitles } from "./retitle";

const TITLES = ["어텐션", "멀티 헤드 어텐션", "미분"];

function geminiOk(payload: unknown) {
  return async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
}

describe("suggestRetitles", () => {
  it("제안을 파싱하고 입력에 없는 from·빈 to·제자리 제안은 버린다", async () => {
    const s = await suggestRetitles(TITLES, "k", {
      fetchFn: geminiOk({
        changes: [
          { from: "어텐션", to: "Attention" },
          { from: "지어낸 제목", to: "Made Up" }, // 입력에 없다
          { from: "멀티 헤드 어텐션", to: "  " }, // 빈 to
          { from: "미분", to: "미분" }, // 제자리
        ],
      }) as unknown as typeof fetch,
    });
    expect(s).toEqual([{ from: "어텐션", to: "Attention" }]);
  });

  it("같은 from 의 중복 제안은 첫 것만 남는다", async () => {
    const s = await suggestRetitles(TITLES, "k", {
      fetchFn: geminiOk({
        changes: [
          { from: "어텐션", to: "Attention" },
          { from: "어텐션", to: "Attention Mechanism" },
        ],
      }) as unknown as typeof fetch,
    });
    expect(s).toEqual([{ from: "어텐션", to: "Attention" }]);
  });

  it("changes 가 없으면 던진다", async () => {
    await expect(
      suggestRetitles(TITLES, "k", { fetchFn: geminiOk({ wrong: [] }) as unknown as typeof fetch }),
    ).rejects.toThrow(/no structured output/);
  });

  it("제목이 없으면 호출 없이 빈 배열", async () => {
    const spy = vi.fn();
    expect(await suggestRetitles([], "k", { fetchFn: spy as unknown as typeof fetch })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("키가 없으면 던진다", async () => {
    await expect(suggestRetitles(TITLES, "  ")).rejects.toThrow(/API key/);
  });

  it("프롬프트가 '철자 교정만·불확실하면 제외' 를 강제하고 제목들을 담는다", async () => {
    let sent = "";
    await suggestRetitles(TITLES, "k", {
      fetchFn: (async (_u: string, init: RequestInit) => {
        sent = String(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"changes":[]}' } }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(sent).toContain("Spelling conversion only");
    expect(sent).toContain("leave the title out");
    expect(sent).toContain("NEVER 'Attention Mechanism'");
    expect(sent).toContain("멀티 헤드 어텐션");
    expect(sent).toContain("미분");
  });

  it("503(overloaded)은 재시도해서 성공한다 — 재시도 규약은 다른 모듈과 같다", async () => {
    let calls = 0;
    const s = await suggestRetitles(TITLES, "k", {
      backoffMs: 0,
      fetchFn: (async () => {
        calls++;
        return calls < 3
          ? new Response("", { status: 503 })
          : new Response(JSON.stringify({ choices: [{ message: { content: '{"changes":[{"from":"어텐션","to":"Attention"}]}' } }] }), {
              status: 200,
            });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(3);
    expect(s).toEqual([{ from: "어텐션", to: "Attention" }]);
  });
});
