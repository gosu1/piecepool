import { describe, it, expect } from "vitest";
import { judgeCoverage, clearOk, pasteJaccard, COVERAGE_POLICY, type FacetJudgment, type CoverageStatus } from "./coverage";
import type { Facet } from "./facets";

const WIKI = [
  "# 가상 메모리",
  "",
  "가상 메모리는 물리 메모리보다 큰 주소 공간을 프로세스에 준다.",
  "페이지 테이블이 가상 주소를 물리 주소로 변환한다.",
  "페이지 폴트가 나면 디스크에서 페이지를 가져온다.",
].join("\n");

const FACETS: Facet[] = [
  { id: "f1", text: "가상 메모리는 물리 메모리보다 큰 주소 공간을 준다.", kind: "definition" },
  { id: "f2", text: "페이지 테이블이 가상 주소를 물리 주소로 변환한다.", kind: "mechanism" },
  { id: "f3", text: "페이지 폴트가 나면 디스크에서 페이지를 가져온다.", kind: "mechanism" },
];

// 자기 말 환언 설명 — 복붙 아님, f1·f2 를 다룬다.
const EXPLANATION =
  "실제 램보다 커 보이는 메모리를 각 프로그램한테 주는 거다. 주소를 바꿔주는 표 같은 게 중간에서 진짜 위치로 연결해 준다.";

function geminiOk(payload: unknown) {
  return async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
}

const j = (id: string, status: CoverageStatus, evidence: string | null): FacetJudgment => ({ id, status, evidence });

const JUDGE_OK = {
  judgments: [
    j("f1", "covered", "실제 램보다 커 보이는 메모리를 각 프로그램한테 주는 거다."),
    j("f2", "partial", "주소를 바꿔주는 표 같은 게 중간에서 진짜 위치로 연결해 준다."),
    j("f3", "missing", null),
  ],
};

describe("judgeCoverage", () => {
  it("판정을 파싱하고 facet 순서로 돌려준다", async () => {
    const r = await judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
      fetchFn: geminiOk({ judgments: [...JUDGE_OK.judgments].reverse() }) as unknown as typeof fetch,
    });
    expect(r.judgments.map((x) => x.id)).toEqual(["f1", "f2", "f3"]);
    expect(r.judgments[0].status).toBe("covered");
    expect(r.pasteSuspected).toBe(false);
  });

  it("프롬프트가 채점 금지·환언 인정·verbatim 인용을 강제하고 요점 목록을 번호로 담는다", async () => {
    let sent = "";
    await judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
      fetchFn: (async (_u: string, init: RequestInit) => {
        sent = String(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(JUDGE_OK) } }] }), {
          status: 200,
        });
      }) as unknown as typeof fetch,
    });
    expect(sent).toContain("품질을 평가하지 않는다");
    expect(sent).toContain("자기 말 환언을 정답 표현과 동등하게 인정한다");
    expect(sent).toContain("한 글자도 바꾸지 말고 그대로 옮긴 인용");
    expect(sent).toContain("명백한 의미 충돌만");
    expect(sent).toContain("f1. (definition)"); // 요점 번호 목록
    expect(sent).toContain("[사용자 설명]");
  });

  it("가드레일 2 — 설명에 없는 evidence 는 missing 으로 강등한다", async () => {
    const r = await judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
      fetchFn: geminiOk({
        judgments: [
          j("f1", "covered", "설명에 존재하지 않는 문장이다."), // 친절한 환각
          j("f2", "covered", null), // 인용 자체가 없음
          j("f3", "contradicted", "이것도 설명에 없다."),
        ],
      }) as unknown as typeof fetch,
    });
    expect(r.judgments).toEqual([j("f1", "missing", null), j("f2", "missing", null), j("f3", "missing", null)]);
  });

  it("가드레일 2 — 공백 차이만 나는 verbatim 인용은 인정한다", async () => {
    const r = await judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
      fetchFn: geminiOk({
        judgments: [
          j("f1", "covered", "실제 램보다  커 보이는\n메모리를 각 프로그램한테 주는 거다."),
          j("f2", "missing", null),
          j("f3", "missing", null),
        ],
      }) as unknown as typeof fetch,
    });
    expect(r.judgments[0].status).toBe("covered");
  });

  it("가드레일 2 — missing 에 붙은 evidence 는 null 로 정리한다", async () => {
    const r = await judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
      fetchFn: geminiOk({
        judgments: [j("f1", "missing", "붙이면 안 되는 인용"), j("f2", "missing", null), j("f3", "missing", null)],
      }) as unknown as typeof fetch,
    });
    expect(r.judgments[0].evidence).toBeNull();
  });

  it("가드레일 1 — 스키마 위반은 1회 재시도 후 성공한다", async () => {
    let calls = 0;
    const r = await judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
      backoffMs: 0,
      fetchFn: (async () => {
        calls++;
        const payload = calls < 2 ? { judgments: [{ id: "f1", status: "great" }] } : JUDGE_OK;
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
          status: 200,
        });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(2);
    expect(r.judgments).toHaveLength(3);
  });

  it("가드레일 1 — id 집합 불일치는 1회 재시도, 계속 불일치면 판정 폐기(throw)", async () => {
    let calls = 0;
    await expect(
      judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
        backoffMs: 0,
        maxRetries: 5, // HTTP 재시도 여유가 남아 있어도 의미 불일치는 2회에서 끊는다
        fetchFn: (async () => {
          calls++;
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      judgments: [j("f1", "covered", null), j("f99", "missing", null), j("f3", "missing", null)],
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          );
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/id 집합/);
    expect(calls).toBe(2);
  });

  it("가드레일 1 — 중복 id 도 불일치다", async () => {
    await expect(
      judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
        backoffMs: 0,
        fetchFn: geminiOk({
          judgments: [j("f1", "covered", null), j("f1", "covered", null), j("f3", "missing", null)],
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/id 집합/);
  });

  it("가드레일 3 — 위키 복붙이면 pasteSuspected 플래그를 세운다", async () => {
    const pasted = WIKI + " 그렇다.";
    const r = await judgeCoverage(FACETS, pasted, WIKI, "k", {
      fetchFn: geminiOk(JUDGE_OK) as unknown as typeof fetch,
    });
    expect(r.pasteSuspected).toBe(true);
  });

  it("짧은 설명은 LLM 호출 없이 전부 missing", async () => {
    let calls = 0;
    const r = await judgeCoverage(FACETS, "몰라", WIKI, "", {
      fetchFn: (async () => {
        calls++;
        return new Response("", { status: 500 });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(0); // 키가 비어 있어도 호출 전에 끝난다
    expect(r.judgments).toEqual([j("f1", "missing", null), j("f2", "missing", null), j("f3", "missing", null)]);
  });

  it("facet 이 없으면(스텁 위키) LLM 호출 없이 빈 판정", async () => {
    let calls = 0;
    const r = await judgeCoverage([], EXPLANATION, WIKI, "", {
      fetchFn: (async () => {
        calls++;
        return new Response("", { status: 500 });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(0);
    expect(r.judgments).toEqual([]);
    expect(clearOk(r)).toBe(false); // 빈 판정으로는 승급하지 않는다
  });

  it("fail-closed — HTTP 실패가 재시도까지 소진되면 던진다(상태 불변은 호출부 책임)", async () => {
    await expect(
      judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
        backoffMs: 0,
        fetchFn: (async () => new Response("", { status: 503 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fail-closed — 네트워크 오류도 소진되면 던진다", async () => {
    await expect(
      judgeCoverage(FACETS, EXPLANATION, WIKI, "k", {
        backoffMs: 0,
        fetchFn: (async () => {
          throw new TypeError("fetch failed");
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/network/);
  });

  it("키가 없으면 던진다", async () => {
    await expect(judgeCoverage(FACETS, EXPLANATION, WIKI, "  ")).rejects.toThrow(/API key/);
  });
});

describe("pasteJaccard", () => {
  it("동일 텍스트는 1, 무관한 텍스트는 문턱 아래", () => {
    expect(pasteJaccard(WIKI, WIKI)).toBe(1);
    expect(pasteJaccard("오늘 점심은 김치찌개였다.", WIKI)).toBeLessThan(COVERAGE_POLICY.pasteJaccardThreshold);
  });

  it("빈 입력은 0", () => {
    expect(pasteJaccard("", WIKI)).toBe(0);
    expect(pasteJaccard(EXPLANATION, "")).toBe(0);
  });
});

describe("clearOk — 상태 전이 경계값 (§4-4)", () => {
  const make = (covered: number, partial: number, missing: number, contradicted = 0): FacetJudgment[] => [
    ...Array.from({ length: covered }, (_, i) => j(`c${i}`, "covered", "e")),
    ...Array.from({ length: partial }, (_, i) => j(`p${i}`, "partial", "e")),
    ...Array.from({ length: missing }, (_, i) => j(`m${i}`, "missing", null)),
    ...Array.from({ length: contradicted }, (_, i) => j(`x${i}`, "contradicted", "e")),
  ];

  it("clearScore 정확히 0.6 → 승급 (>= 경계)", () => {
    // (3 + 0) / 5 = 0.6
    expect(clearOk({ judgments: make(3, 0, 2), pasteSuspected: false })).toBe(true);
    // (4 + 0.5*4) / 10 = 0.6 — partial 0.5 가중
    expect(clearOk({ judgments: make(4, 4, 2), pasteSuspected: false })).toBe(true);
  });

  it("clearScore 0.6 미만 → 보류", () => {
    // (2 + 0.5) / 5 = 0.5
    expect(clearOk({ judgments: make(2, 1, 2), pasteSuspected: false })).toBe(false);
  });

  it("contradicted 가 하나라도 있으면 점수와 무관하게 보류", () => {
    // (9 + 0) / 10 = 0.9 지만 contradicted 1
    expect(clearOk({ judgments: make(9, 0, 0, 1), pasteSuspected: false })).toBe(false);
  });

  it("복붙 의심이면 만점이어도 보류", () => {
    expect(clearOk({ judgments: make(5, 0, 0), pasteSuspected: true })).toBe(false);
  });

  it("판정이 비어 있으면 보류", () => {
    expect(clearOk({ judgments: [], pasteSuspected: false })).toBe(false);
  });
});
