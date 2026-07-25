import { describe, it, expect } from "vitest";
import { extractFacets, facetCacheKey } from "./facets";

const WIKI = [
  "# 가상 메모리",
  "",
  "가상 메모리는 물리 메모리보다 큰 주소 공간을 프로세스에 준다.",
  "페이지 테이블이 가상 주소를 물리 주소로 변환한다.",
  "페이지 폴트가 나면 디스크에서 페이지를 가져온다.",
].join("\n");

const FACETS_OK = {
  facets: [
    { text: "가상 메모리는 물리 메모리보다 큰 주소 공간을 준다.", kind: "definition" },
    { text: "페이지 테이블이 가상 주소를 물리 주소로 변환한다.", kind: "mechanism" },
    { text: "페이지 폴트가 나면 디스크에서 페이지를 가져온다.", kind: "mechanism" },
  ],
};

function geminiOk(payload: unknown) {
  return async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
}

describe("extractFacets", () => {
  it("구조화 출력을 파싱하고 id 는 TS 가 순서대로 부여한다(f1, f2, …)", async () => {
    const facets = await extractFacets(WIKI, "k", { fetchFn: geminiOk(FACETS_OK) as unknown as typeof fetch });
    expect(facets.map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
    expect(facets[0]).toEqual({
      id: "f1",
      text: "가상 메모리는 물리 메모리보다 큰 주소 공간을 준다.",
      kind: "definition",
    });
  });

  it("facet 3개 미만은 스텁 위키 — 빈 배열(커버리지 비활성)", async () => {
    const facets = await extractFacets(WIKI, "k", {
      fetchFn: geminiOk({ facets: [{ text: "하나뿐이다.", kind: "definition" }] }) as unknown as typeof fetch,
    });
    expect(facets).toEqual([]);
    const empty = await extractFacets(WIKI, "k", {
      fetchFn: geminiOk({ facets: [] }) as unknown as typeof fetch,
    });
    expect(empty).toEqual([]);
  });

  it("스키마 위반(알 수 없는 kind)은 재시도해서 성공한다", async () => {
    let calls = 0;
    const facets = await extractFacets(WIKI, "k", {
      backoffMs: 0,
      fetchFn: (async () => {
        calls++;
        const payload =
          calls < 2 ? { facets: [{ text: "t", kind: "만들어낸값" }] } : FACETS_OK;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(2);
    expect(facets).toHaveLength(3);
  });

  it("스키마 위반이 재시도까지 소진되면 던진다 — fail-closed", async () => {
    await expect(
      extractFacets(WIKI, "k", {
        backoffMs: 0,
        fetchFn: geminiOk({ facets: [{ text: "", kind: "definition" }] }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/schema violation/);
  });

  it("HTTP 실패는 재시도 소진 후 던진다 — fail-closed", async () => {
    await expect(
      extractFacets(WIKI, "k", {
        backoffMs: 0,
        fetchFn: (async () => new Response("", { status: 503 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("401 은 재시도하지 않는다 — 같은 답이 온다", async () => {
    let calls = 0;
    await expect(
      extractFacets(WIKI, "k", {
        backoffMs: 0,
        fetchFn: (async () => {
          calls++;
          return new Response("", { status: 401 });
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 401/);
    expect(calls).toBe(1);
  });

  it("키가 없으면 던진다", async () => {
    await expect(extractFacets(WIKI, "  ")).rejects.toThrow(/API key/);
  });

  it("프롬프트가 원자성·문서 근거·개수 규칙을 강제하고 위키 본문을 담는다", async () => {
    let sent = "";
    await extractFacets(WIKI, "k", {
      fetchFn: (async (_u: string, init: RequestInit) => {
        sent = String(init.body);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(FACETS_OK) } }] }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    });
    expect(sent).toContain("요점은 5~9개");
    expect(sent).toContain("정확히 하나의 사실/원리만");
    expect(sent).toContain("실제로 있는 내용만");
    expect(sent).toContain("페이지 테이블"); // 위키 본문이 들어간다
  });
});

describe("facetCacheKey", () => {
  it("같은 본문 → 같은 키, 다른 본문 → 다른 키", () => {
    expect(facetCacheKey(WIKI)).toBe(facetCacheKey(WIKI));
    expect(facetCacheKey(WIKI)).not.toBe(facetCacheKey(WIKI + " 수정"));
  });

  it("NFC 정규화 — 같은 글자의 조합형/완성형은 같은 키", () => {
    expect(facetCacheKey("가상")).toBe(facetCacheKey("가상".normalize("NFD")));
  });
});
