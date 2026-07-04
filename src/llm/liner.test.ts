import { describe, it, expect } from "vitest";
import { LinerClient, factCheckRelations } from "./liner";
import type { LlmWikiResult, LlmRelation } from "./provider";

// LinerClient — 응답 필드 변형 정규화 · 오류 규격 · fact-check(evidence[].reason URL 누적).

type FetchFn = typeof fetch;
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function clientWith(handler: (url: string, init?: RequestInit) => Promise<Response>): LinerClient {
  return new LinerClient({
    config: { apiKey: "liner-test", backoffMs: 0 },
    fetchFn: handler as FetchFn,
  });
}

describe("LinerClient.search — 응답 정규화", () => {
  it("sources[{title,url,snippet}] 표준형", async () => {
    const c = clientWith(async () => jsonRes({ answer: "요약", sources: [{ title: "OSTEP", url: "https://o.io", snippet: "s" }] }));
    const r = await c.search("q");
    expect(r.answer).toBe("요약");
    expect(r.sources).toEqual([{ title: "OSTEP", url: "https://o.io", snippet: "s" }]);
  });

  it("references[{name,link,text}] 변형도 흡수", async () => {
    const c = clientWith(async () => jsonRes({ summary: "s", references: [{ name: "위키", link: "https://w.io", text: "본문" }] }));
    const r = await c.search("q");
    expect(r.answer).toBe("s");
    expect(r.sources[0]).toEqual({ title: "위키", url: "https://w.io", snippet: "본문" });
  });

  it("url 없는 항목은 버리고, 출처 0개여도 throw 하지 않는다(없음 ≠ 실패)", async () => {
    const c = clientWith(async () => jsonRes({ results: [{ title: "no-url" }] }));
    const r = await c.search("q");
    expect(r.sources).toEqual([]);
  });

  it("401 → auth 오류(재시도 없음)", async () => {
    let calls = 0;
    const c = clientWith(async () => {
      calls++;
      return jsonRes({}, 401);
    });
    await expect(c.search("q")).rejects.toThrow("[provider=liner] auth");
    expect(calls).toBe(1);
  });

  it("네트워크 오류는 maxRetries 만큼 재시도 후 실패", async () => {
    let calls = 0;
    const c = clientWith(async () => {
      calls++;
      throw new Error("ECONNREFUSED");
    });
    await expect(c.search("q")).rejects.toThrow("[provider=liner] network");
    expect(calls).toBe(2); // 첫 시도 + maxRetries(1)
  });

  it("키 없으면 즉시 auth 오류", async () => {
    const c = new LinerClient({ config: { apiKey: "" } });
    await expect(c.search("q")).rejects.toThrow("LINER_API_KEY missing");
  });
});

function rel(overrides: Partial<LlmRelation>): LlmRelation {
  return {
    sourceConceptTitle: "A",
    targetConceptTitle: "B",
    relationType: "part_of",
    strength: 0.8,
    confidence: 0.5,
    explanation: "이유",
    evidence: [],
    ...overrides,
  };
}

describe("factCheckRelations — evidence[].reason 에 URL 누적 (수용기준 §3.2)", () => {
  const oneSource = clientWith(async () => jsonRes({ sources: [{ title: "T", url: "https://src.io" }] }));

  it("evidence 있으면 각 reason 에 출처 누적", async () => {
    const result: LlmWikiResult = {
      concepts: [],
      relations: [rel({ evidence: [{ sourceId: "s1", reason: "근거" }] })],
    };
    const r = await factCheckRelations(result, oneSource);
    expect(r.checked).toBe(1);
    expect(r.result.relations[0].evidence[0].reason).toBe("근거 · 출처: https://src.io");
    // 원본 불변
    expect(result.relations[0].evidence[0].reason).toBe("근거");
  });

  it("evidence 없으면 explanation 에 누적(applyLlmResult 가 evidence 로 합성)", async () => {
    const result: LlmWikiResult = { concepts: [], relations: [rel({})] };
    const r = await factCheckRelations(result, oneSource);
    expect(r.result.relations[0].explanation).toBe("이유 · 출처: https://src.io");
  });

  it("confidence 낮은 관계부터 maxQueries 개만 검증", async () => {
    let calls = 0;
    const counting = clientWith(async () => {
      calls++;
      return jsonRes({ sources: [{ title: "T", url: "https://u.io" }] });
    });
    const result: LlmWikiResult = {
      concepts: [],
      relations: [rel({ confidence: 0.9 }), rel({ confidence: 0.1 }), rel({ confidence: 0.5 })],
    };
    const r = await factCheckRelations(result, counting, { maxQueries: 2 });
    expect(calls).toBe(2);
    // 0.1 · 0.5 만 검증됨 — 0.9 는 그대로
    const checked = r.result.relations.filter((x) => x.explanation.includes("출처:"));
    expect(checked.map((x) => x.confidence).sort()).toEqual([0.1, 0.5]);
  });

  it("검색 실패는 advisory — 관계는 그대로, failed 집계", async () => {
    const failing = clientWith(async () => {
      throw new Error("down");
    });
    const result: LlmWikiResult = { concepts: [], relations: [rel({})] };
    const r = await factCheckRelations(result, failing);
    expect(r.checked).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.result.relations[0]).toEqual(result.relations[0]);
  });

  it("출처 0개면 누적 없이 통과", async () => {
    const empty = clientWith(async () => jsonRes({ sources: [] }));
    const result: LlmWikiResult = { concepts: [], relations: [rel({})] };
    const r = await factCheckRelations(result, empty);
    expect(r.checked).toBe(0);
    expect(r.result.relations[0].explanation).toBe("이유");
  });
});
