import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdapter, loadFixtures } from "./run";
import { resolveJudgeModel } from "./judge";
import { GEMINI_MODEL, GEMINI_OPENAI_ENDPOINT } from "../../src/llm/gemini";
import type { EvalAdapter } from "./core";

type Fx = { id: string; n: number };

function fixtureDir(items: Fx[]): string {
  const dir = mkdtempSync(join(tmpdir(), "evals-"));
  for (const it of items) writeFileSync(join(dir, `${it.id}.json`), JSON.stringify(it), "utf-8");
  return dir;
}

function adapter(dir: string, over: Partial<EvalAdapter<Fx, number>> = {}): EvalAdapter<Fx, number> {
  return {
    id: "mock",
    fixturesDir: dir,
    needsApiKey: false,
    run: async (f) => f.n * 2,
    metrics: async (samples) => ({ sum: samples.reduce((a, s) => a + (s.out ?? 0), 0), failed: samples.filter((s) => s.error).length }),
    gates: [{ metric: "failed", op: "<=", threshold: 0, label: "실행 실패 0" }],
    ...over,
  };
}

describe("loadFixtures", () => {
  it("디렉토리의 json 을 id 순으로 읽는다", () => {
    const dir = fixtureDir([{ id: "b", n: 2 }, { id: "a", n: 1 }]);
    expect(loadFixtures<Fx>(dir).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("--case 로 하나만 고른다", () => {
    const dir = fixtureDir([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
    expect(loadFixtures<Fx>(dir, "b").map((f) => f.id)).toEqual(["b"]);
  });

  it("없는 case 는 빈 배열", () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    expect(loadFixtures<Fx>(dir, "zzz")).toEqual([]);
  });
});

describe("runAdapter", () => {
  it("모든 fixture 를 돌려 지표를 내고 게이트를 통과시킨다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
    const rep = await runAdapter(adapter(dir), { dry: false, apiKey: "" }, {});
    expect(rep.metrics.sum).toBe(6);
    expect(rep.gateFails).toEqual([]);
    expect(rep.samples).toHaveLength(2);
  });

  it("run 이 던지면 그 fixture 를 error 로 기록하고 계속한다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
    const a = adapter(dir, { run: async (f) => { if (f.id === "a") throw new Error("boom"); return f.n * 2; } });
    const rep = await runAdapter(a, { dry: false, apiKey: "" }, {});
    expect(rep.samples.find((s) => s.fixture.id === "a")?.error).toContain("boom");
    expect(rep.metrics.sum).toBe(4);
    expect(rep.gateFails).toHaveLength(1); // failed=1 > 0
  });

  it("게이트를 깨면 gateFails 에 담긴다 — 일부러 깬 mock", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    const a = adapter(dir, { gates: [{ metric: "sum", op: "<=", threshold: 1, label: "합 ≤ 1" }] });
    const rep = await runAdapter(a, { dry: false, apiKey: "" }, {});
    expect(rep.gateFails).toHaveLength(1);
    expect(rep.gateFails[0]).toContain("합 ≤ 1");
  });

  it("latencyMs 를 표본마다 기록한다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    const rep = await runAdapter(adapter(dir), { dry: false, apiKey: "" }, {});
    expect(typeof rep.samples[0].latencyMs).toBe("number");
  });
});

// 케이스별 judge 기록(PIE-59)은 어댑터가 metrics() 안에서 채운다 — runAdapter 는 그 뒤의 samples 를
// 필드 pick/복사 없이 그대로 report 에 실어 직렬화한다. 여기서 재는 것은 그 한 가지다:
// 어댑터가 붙인 필드가 러너를 지나 결과 JSON 까지 그대로 살아남는가.
describe("samples[].judge 직렬화 계약", () => {
  const judgeFilling = (dir: string) =>
    adapter(dir, {
      metrics: async (samples, ctx) => {
        if (!ctx.dry) for (const s of samples) s.judge = { verdict: { hallucination: false } };
        return { failed: 0 };
      },
    });

  it("metrics() 가 채운 judge 가 결과 JSON 에 남는다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    const rep = await runAdapter(judgeFilling(dir), { dry: false, apiKey: "" }, {});
    const serialized = JSON.parse(JSON.stringify(rep));
    expect(serialized.samples[0].judge).toEqual({ verdict: { hallucination: false } });
  });

  // 가짜 metrics 의 `if (!ctx.dry)` 가드가 스스로 안 채운 결과를 보는 것이므로, 이 테스트가
  // 실제로 재는 것은 ctx.dry 가 metrics() 까지 도달한다는 것과 러너가 judge 를 스스로 만들지
  // 않는다는 것 두 가지다 — "dry 면 judge 가 없다" 는 어댑터 쪽 규약이지 러너의 보장이 아니다.
  it("ctx.dry 가 metrics() 에 그대로 전달된다 — 어댑터가 심판을 건너뛰는 지점이다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    const rep = await runAdapter(judgeFilling(dir), { dry: true, apiKey: "" }, {});
    const serialized = JSON.parse(JSON.stringify(rep));
    expect(serialized.dry).toBe(true);
    expect("judge" in serialized.samples[0]).toBe(false); // 가드가 안 채웠고 러너도 안 붙였다
  });
});

// 어느 모델로 잰 수치인지 결과에 안 적히면 다른 실행과 비교할 근거가 없다.
describe("RunReport 의 측정 축 기록", () => {
  it("모델 축을 준 대로 적는다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    const a = adapter(dir, { needsApiKey: true });
    const rep = await runAdapter(a, { dry: false, apiKey: "k", model: "m-1", baseUrl: "http://x/v1" }, {});
    expect(rep.model).toBe("m-1");
    expect(rep.baseUrl).toBe("http://x/v1");
  });

  it("축을 안 주면 어댑터의 기본 모델을 적는다 — pdfsummary 의 lite 고정이 이 경로다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    const a = adapter(dir, { needsApiKey: true, defaultModel: "lite-1" });
    const rep = await runAdapter(a, { dry: false, apiKey: "k" }, {});
    expect(rep.model).toBe("lite-1");
    expect(rep.baseUrl).toBe(GEMINI_OPENAI_ENDPOINT);
  });

  it("모델을 안 부르는 어댑터는 null — 안 쓴 모델명을 적으면 결과가 거짓말을 한다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    const rep = await runAdapter(adapter(dir), { dry: false, apiKey: "" }, {});
    expect(rep.model).toBeNull();
    expect(rep.judgeModel).toBeNull();
  });

  it("심판 모델은 대상 모델을 따라가지 않는다", async () => {
    const dir = fixtureDir([{ id: "a", n: 1 }]);
    const a = adapter(dir, { needsApiKey: true });
    const rep = await runAdapter(a, { dry: false, apiKey: "k", model: "subject-model" }, {});
    expect(rep.model).toBe("subject-model");
    expect(rep.judgeModel).toBe(GEMINI_MODEL); // 대상이 바뀌어도 심판은 고정
  });
});

describe("resolveJudgeModel", () => {
  it("명시값 > env > 기본값 순", () => {
    expect(resolveJudgeModel("j-1")).toBe("j-1");
    expect(resolveJudgeModel()).toBe(GEMINI_MODEL);
    process.env.PIECEPOOL_JUDGE_MODEL = "env-judge";
    try {
      expect(resolveJudgeModel()).toBe("env-judge");
      expect(resolveJudgeModel("j-1")).toBe("j-1");
    } finally {
      delete process.env.PIECEPOOL_JUDGE_MODEL;
    }
  });
});
