import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdapter, loadFixtures } from "./run";
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
