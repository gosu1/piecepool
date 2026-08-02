# LLM 기능 평가지표 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM을 쓰는 기능 8종에 대해 수치 지표와 합격선을 문서로 정의하고, 프롬프트·모델을 바꿨을 때 점수 변화가 자동으로 나오는 회귀 러너를 만든다.

**Architecture:** `scripts/evals/core.ts`가 fixture 로드 · 어댑터 실행 · 지표 집계 · 게이트 판정 · 결과 기록을 전담하고, 기능마다 `scripts/evals/adapters/<feature>.ts`가 **fixture 타입 · 실행 함수 · 지표 계산 · 게이트 표**만 선언한다. 코어는 기능을 모르고 어댑터가 선언한 지표 이름만 본다. 어댑터는 `src/llm/*`를 in-process 직호출하며 로직을 재구현하지 않는다.

**Tech Stack:** TypeScript, tsx (CLI 실행), vitest (코어 자체 테스트), Gemini OpenAI-호환 엔드포인트 (judge)

**설계 문서:** [`docs/superpowers/specs/2026-08-02-llm-eval-metrics-design.md`](../specs/2026-08-02-llm-eval-metrics-design.md)

## Global Constraints

- 어댑터는 `src/llm/*`를 직접 import해 호출한다. **기능 로직을 eval 쪽에 재구현 금지** (기존 `scripts/eval.ts`가 지키는 규칙).
- `scripts/feynman-eval.ts`와 `scripts/eval.ts`의 **기존 동작을 바꾸지 않는다.** `eval.ts`에서는 `assertCase` export만 재사용한다.
- `src/llm/*` 프로덕션 코드를 고치지 않는다. eval이 결함을 찾으면 README에 **보고만** 한다.
- 모든 게이트 임계값은 `metric op threshold` 수치 형태다. 자유서술 판정 금지.
- 파인만을 제외한 모든 임계값에는 README에 `(잠정, baseline 측정 후 확정)` 표기를 단다. **예외**: `classify`·`dedupConcepts`는 모델 호출이 없어 이번에 실측하므로 잠정 표기를 달지 않는다.
- CLI 키 규약: `process.env.GEMINI_API_KEY` (앱의 `localStorage["gemini-key"]`가 아니다).
- 커밋 메시지는 한국어 본문 + Conventional Commits 접두. 마지막 줄에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- `git add`는 **경로를 명시**한다. `git add -A` 금지.
- 브랜치는 `feat/llm-eval-metrics` (이미 생성됨). `main`에 직접 푸시 금지.

---

### Task 1: eval 코어 — 타입과 게이트 엔진

게이트 판정은 순수 함수라 모델 없이 테스트할 수 있다. 여기가 러너에서 유일하게 틀리면 치명적인 부분이다 — **지표가 없는데 통과시키는 버그**가 대표적이다.

**Files:**
- Create: `scripts/evals/core.ts`
- Test: `scripts/evals/core.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `Metrics`, `Gate`, `GateOp`, `RunCtx`, `Sample<F,O>`, `EvalAdapter<F,O>`, `evaluateGates(metrics, gates, dry)`, `levenshtein(a,b)`, `cer(ref,hyp)`, `boundaryF1(gold,pred,tolerance)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scripts/evals/core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateGates, levenshtein, cer, boundaryF1, type Gate } from "./core";

const G = (metric: string, op: Gate["op"], threshold: number): Gate => ({
  metric,
  op,
  threshold,
  label: `${metric} ${op} ${threshold}`,
});

describe("evaluateGates", () => {
  it("임계값을 만족하면 실패가 없다", () => {
    expect(evaluateGates({ leak: 0, f1: 0.8 }, [G("leak", "<=", 0), G("f1", ">=", 0.7)], false)).toEqual([]);
  });

  it("임계값을 넘기면 지표 이름·실측값·임계값을 담아 실패한다", () => {
    const fails = evaluateGates({ leak: 3 }, [G("leak", "<=", 0)], false);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain("leak");
    expect(fails[0]).toContain("3");
    expect(fails[0]).toContain("0");
  });

  it("경계값은 통과다 (<= 는 같으면 통과)", () => {
    expect(evaluateGates({ ratio: 0.3 }, [G("ratio", "<=", 0.3)], false)).toEqual([]);
    expect(evaluateGates({ f1: 0.7 }, [G("f1", ">=", 0.7)], false)).toEqual([]);
  });

  it("지표가 없으면 통과가 아니라 실패다 — 조용한 통과 금지", () => {
    const fails = evaluateGates({}, [G("leak", "<=", 0)], false);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain("지표 없음");
  });

  it("NaN 은 실패다", () => {
    const fails = evaluateGates({ f1: NaN }, [G("f1", ">=", 0.7)], false);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain("지표 없음");
  });

  it("dry 모드에서는 없는 지표를 건너뛰지만, 있는 지표는 그대로 판정한다", () => {
    const gates = [G("judgeLeak", "<=", 0), G("cheapFail", "<=", 0)];
    expect(evaluateGates({ cheapFail: 0 }, gates, true)).toEqual([]);
    const fails = evaluateGates({ cheapFail: 2 }, gates, true);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain("cheapFail");
  });
});

describe("levenshtein / cer", () => {
  it("같은 문자열은 거리 0", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("치환·삽입·삭제를 센다", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("cer 은 공백·대소문자를 정규화한 뒤 거리/기준길이", () => {
    expect(cer("Hello  World", "hello world")).toBe(0);
    expect(cer("abcd", "abxd")).toBeCloseTo(0.25, 5);
  });

  it("기준이 빈 문자열이면 가설이 비었을 때만 0", () => {
    expect(cer("", "")).toBe(0);
    expect(cer("", "x")).toBe(1);
  });
});

describe("boundaryF1", () => {
  it("완전 일치는 1", () => {
    expect(boundaryF1([2, 5], [2, 5], 0)).toBeCloseTo(1, 5);
  });

  it("허용 오차 안이면 맞은 것으로 센다", () => {
    expect(boundaryF1([2, 5], [3, 6], 1)).toBeCloseTo(1, 5);
    expect(boundaryF1([2, 5], [3, 6], 0)).toBeCloseTo(0, 5);
  });

  it("골드 경계 하나를 예측 하나에만 매칭한다 — 중복 크레딧 금지", () => {
    expect(boundaryF1([5], [4, 5, 6], 1)).toBeCloseTo(0.5, 5);
  });

  it("양쪽 다 비면 1, 한쪽만 비면 0", () => {
    expect(boundaryF1([], [], 1)).toBe(1);
    expect(boundaryF1([], [3], 1)).toBe(0);
    expect(boundaryF1([3], [], 1)).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npx vitest run scripts/evals/core.test.ts`
Expected: FAIL — `Failed to resolve import "./core"`

- [ ] **Step 3: 코어를 구현한다**

`scripts/evals/core.ts`:

```ts
// LLM 기능 eval 공용 코어. 기능을 모른다 — 어댑터가 선언한 지표 이름과 게이트만 본다.
// 설계: docs/superpowers/specs/2026-08-02-llm-eval-metrics-design.md §3
// 레퍼런스: scripts/feynman-eval.ts (지표 → 게이트 → exit 1 규약을 이 코어가 일반화한다)

export type Metrics = Record<string, number>;
export type GateOp = "<=" | ">=" | "==";

export interface Gate {
  metric: string; // Metrics 의 키
  op: GateOp;
  threshold: number;
  label: string; // 사람이 읽을 설명 (README 합격선 표와 같은 문구)
}

export interface RunCtx {
  dry: boolean; // judge 등 모델 호출을 생략하는 저비용 모드
  apiKey: string; // GEMINI_API_KEY (dry 이거나 needsApiKey=false 면 빈 문자열 가능)
}

export interface Sample<F, O> {
  fixture: F;
  out?: O;
  error?: string;
  latencyMs?: number;
}

export interface EvalAdapter<F, O> {
  id: string; // "chunk" — npm run eval:chunk 와 일치
  fixturesDir: string; // 절대 경로
  needsApiKey: boolean; // false 면 키 없이도 돈다 (순수 함수 기능)
  run(fixture: F, ctx: RunCtx): Promise<O>;
  metrics(samples: Sample<F, O>[], ctx: RunCtx): Promise<Metrics>;
  gates: Gate[];
}

// 게이트 판정. dry 에서 없는 지표는 건너뛰되, 있는 지표는 그대로 본다.
// 핵심 규약: 지표가 없거나 NaN 이면 통과가 아니라 실패다. 조용히 통과하면 게이트가 게이트가 아니다.
export function evaluateGates(metrics: Metrics, gates: Gate[], dry: boolean): string[] {
  const fails: string[] = [];
  for (const g of gates) {
    const v = metrics[g.metric];
    if (v === undefined || Number.isNaN(v)) {
      if (dry) continue; // dry 는 judge 지표를 안 만든다 — 거짓 경보 금지
      fails.push(`${g.label} — 지표 없음 (${g.metric} 미산출)`);
      continue;
    }
    const ok = g.op === "<=" ? v <= g.threshold : g.op === ">=" ? v >= g.threshold : v === g.threshold;
    if (!ok) fails.push(`${g.label} — 실측 ${fmt(v)} (허용 ${g.op} ${g.threshold})`);
  }
  return fails;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(4);
}

// ── 지표 계산 공용 도구 ─────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const normText = (s: string): string => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

// 문자 오류율. 공백·대소문자·유니코드 정규화 후 편집거리 / 기준 길이.
export function cer(reference: string, hypothesis: string): number {
  const ref = normText(reference);
  const hyp = normText(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return levenshtein(ref, hyp) / ref.length;
}

// 경계 F1. tolerance 문장 이내면 맞은 것으로 본다. 골드 하나는 예측 하나에만 매칭(그리디).
export function boundaryF1(gold: number[], pred: number[], tolerance: number): number {
  if (gold.length === 0 && pred.length === 0) return 1;
  if (gold.length === 0 || pred.length === 0) return 0;
  const used = new Set<number>();
  let hit = 0;
  for (const g of gold) {
    const i = pred.findIndex((p, idx) => !used.has(idx) && Math.abs(p - g) <= tolerance);
    if (i !== -1) {
      used.add(i);
      hit++;
    }
  }
  const precision = hit / pred.length;
  const recall = hit / gold.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run scripts/evals/core.test.ts`
Expected: PASS — 15 tests

- [ ] **Step 5: 커밋한다**

```bash
git add scripts/evals/core.ts scripts/evals/core.test.ts
git commit -m "feat(evals): eval 공용 코어 — 게이트 엔진 + CER/경계F1 지표 도구

지표가 없거나 NaN 이면 통과가 아니라 실패로 판정한다. 조용한 통과는
게이트를 무력화하는 대표 결함이라 테스트로 못박았다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 러너 CLI — 어댑터 실행·리포트·종료코드

**Files:**
- Create: `scripts/evals/run.ts`
- Create: `scripts/evals/registry.ts`
- Test: `scripts/evals/run.test.ts`
- Modify: `package.json` (scripts 절)

**Interfaces:**
- Consumes: `EvalAdapter`, `RunCtx`, `Sample`, `Metrics`, `evaluateGates` (Task 1)
- Produces: `runAdapter(adapter, ctx, opts): Promise<RunReport>`, `loadFixtures<F>(dir, caseId?): F[]`, `RunReport = { id, dry, metrics, gateFails, samples, runAt }`, `ADAPTERS: Record<string, () => Promise<EvalAdapter<any, any>>>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scripts/evals/run.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npx vitest run scripts/evals/run.test.ts`
Expected: FAIL — `Failed to resolve import "./run"`

- [ ] **Step 3: 레지스트리를 만든다**

`scripts/evals/registry.ts` — 어댑터는 Task 3~7에서 추가한다. 지금은 빈 레지스트리로 시작한다.

```ts
// 어댑터 레지스트리. lazy import — 어댑터 하나를 돌릴 때 다른 어댑터의 의존성을 끌어오지 않는다.
import type { EvalAdapter } from "./core";

export const ADAPTERS: Record<string, () => Promise<EvalAdapter<any, any>>> = {};
```

- [ ] **Step 4: 러너를 구현한다**

`scripts/evals/run.ts`:

```ts
// eval 러너 CLI. 실행:
//   npm run eval:chunk                 # 어댑터 하나
//   npm run eval:chunk -- --dry        # 모델 호출 생략(cheap 지표만), 게이트는 있는 지표만 판정
//   npm run eval:chunk -- --case <id>  # fixture 하나
//   npm run eval:all                   # 전체 어댑터
// 게이트가 깨지면 exit 1 (scripts/feynman-eval.ts 와 같은 규약).

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateGates, type EvalAdapter, type Metrics, type RunCtx, type Sample } from "./core";
import { ADAPTERS } from "./registry";

export interface RunReport {
  id: string;
  dry: boolean;
  metrics: Metrics;
  gateFails: string[];
  samples: Sample<any, any>[];
  runAt: string;
}

export function loadFixtures<F>(dir: string, caseId?: string): F[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const all = files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as F);
  if (!caseId) return all;
  return all.filter((f) => (f as { id?: string }).id === caseId);
}

export async function runAdapter<F, O>(
  adapter: EvalAdapter<F, O>,
  ctx: RunCtx,
  opts: { caseId?: string; onSample?: (s: Sample<F, O>) => void },
): Promise<RunReport> {
  const fixtures = loadFixtures<F>(adapter.fixturesDir, opts.caseId);
  const samples: Sample<F, O>[] = [];
  for (const fixture of fixtures) {
    const t0 = Date.now();
    try {
      const out = await adapter.run(fixture, ctx);
      samples.push({ fixture, out, latencyMs: Date.now() - t0 });
    } catch (e) {
      // 실행 실패도 지표다 — 기록하고 다음 fixture 로 간다.
      samples.push({ fixture, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 });
    }
    opts.onSample?.(samples[samples.length - 1]);
  }
  const metrics = await adapter.metrics(samples, ctx);
  return {
    id: adapter.id,
    dry: ctx.dry,
    metrics,
    gateFails: evaluateGates(metrics, adapter.gates, ctx.dry),
    samples,
    runAt: new Date().toISOString(),
  };
}

function resultsDir(adapterId: string): string {
  return join(process.cwd(), "docs/30-llm/evals", adapterId, "results");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const caseId = args.includes("--case") ? args[args.indexOf("--case") + 1] : undefined;
  const all = args.includes("--all");
  const which = args.includes("--adapter") ? args[args.indexOf("--adapter") + 1] : undefined;

  const ids = all ? Object.keys(ADAPTERS).sort() : which ? [which] : [];
  if (!ids.length) {
    console.error("사용법: --adapter <id> [--case <id>] [--dry] | --all [--dry]");
    console.error(`등록된 어댑터: ${Object.keys(ADAPTERS).sort().join(", ") || "(없음)"}`);
    process.exit(2);
  }

  const apiKey = process.env.GEMINI_API_KEY || "";
  let anyFail = false;

  for (const id of ids) {
    const load = ADAPTERS[id];
    if (!load) {
      console.error(`알 수 없는 어댑터: ${id}`);
      process.exit(2);
    }
    const adapter = await load();
    if (adapter.needsApiKey && !dry && !apiKey) {
      console.error(`[${id}] GEMINI_API_KEY 필요 — 실제 모델 행동이 측정 대상이다. --dry 로 cheap 지표만 볼 수 있다.`);
      process.exit(2);
    }

    console.log(`\n=== ${id} ${dry ? "(dry)" : ""} ===`);
    const report = await runAdapter(adapter, { dry, apiKey }, {
      caseId,
      onSample: (s) => console.log(`  ${s.error ? "💥" : "·"} ${(s.fixture as { id?: string }).id ?? "?"}${s.error ? ` ${s.error}` : ""} (${s.latencyMs}ms)`),
    });

    const dir = resultsDir(id);
    mkdirSync(dir, { recursive: true });
    const stamp = report.runAt.replace(/[:.]/g, "-");
    writeFileSync(join(dir, `run-${stamp}${dry ? "-dry" : ""}.json`), JSON.stringify(report, null, 2), "utf-8");

    console.log("지표:", JSON.stringify(report.metrics, null, 2));
    if (report.gateFails.length) {
      anyFail = true;
      console.error("게이트 실패:");
      for (const f of report.gateFails) console.error(`  ✗ ${f}`);
    } else {
      console.log(dry ? "게이트 통과 ✅ (dry — 미산출 지표는 건너뜀)" : "게이트 통과 ✅");
    }
  }

  if (anyFail) process.exit(1);
}

// tsx 직접 실행 시에만 main() — import(테스트) 시에는 실행 안 함. scripts/eval.ts 와 같은 규약.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run scripts/evals/run.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 6: package.json 에 스크립트를 추가한다**

`package.json`의 `"scripts"`에서 `"eval:feynman"` 줄 **바로 뒤에** 아래를 추가한다. 기존 줄은 건드리지 않는다.

```json
    "eval:llm": "tsx --env-file-if-exists=.env scripts/evals/run.ts",
    "eval:all": "npm run eval:llm -- --all",
    "eval:generate": "npm run eval:llm -- --adapter generate",
    "eval:synthesize": "npm run eval:llm -- --adapter synthesize",
    "eval:mergeWiki": "npm run eval:llm -- --adapter mergeWiki",
    "eval:dedupConcepts": "npm run eval:llm -- --adapter dedupConcepts",
    "eval:chunk": "npm run eval:llm -- --adapter chunk",
    "eval:classify": "npm run eval:llm -- --adapter classify",
    "eval:ocr": "npm run eval:llm -- --adapter ocr",
    "eval:pdfsummary": "npm run eval:llm -- --adapter pdfsummary"
```

- [ ] **Step 7: 러너가 실제로 뜨는지 확인한다**

Run: `npm run eval:all`
Expected: exit 2, `등록된 어댑터: (없음)` — 레지스트리가 비었으므로 정상

- [ ] **Step 8: 커밋한다**

```bash
git add scripts/evals/run.ts scripts/evals/registry.ts scripts/evals/run.test.ts package.json
git commit -m "feat(evals): eval 러너 CLI — 어댑터 실행·결과 기록·게이트 종료코드

fixture 하나가 던져도 error 로 기록하고 계속 돈다. 실행 실패 자체가
지표이므로 어댑터가 그 수를 게이트로 막을 수 있다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 순수 함수 어댑터 — classify, dedupConcepts

이 둘은 모델을 호출하지 않는다. **비용 0이므로 이번 작업에서 baseline 실측까지 끝낸다.**

**Files:**
- Create: `scripts/evals/adapters/classify.ts`
- Create: `scripts/evals/adapters/dedupConcepts.ts`
- Create: `docs/30-llm/evals/classify/fixtures/corpus.json`
- Create: `docs/30-llm/evals/dedupConcepts/fixtures/pairs.json`
- Modify: `scripts/evals/registry.ts`

**Interfaces:**
- Consumes: `EvalAdapter`, `Sample`, `Metrics` (Task 1); `classify`, `NodeType` from `src/llm/classify`; `mergeDuplicateConcepts` from `src/llm/dedupConcepts`; `LlmConcept` from `src/llm/provider`
- Produces: `classifyAdapter`, `dedupAdapter` (기본 export)

- [ ] **Step 1: classify fixture 를 만든다**

`docs/30-llm/evals/classify/fixtures/corpus.json` — `src/llm/classify.test.ts:7-30`의 `CORPUS` 배열을 그대로 옮긴다. **`classify.test.ts`는 수정하지 않는다** (기존 테스트 유지, eval은 독립 표본).

```json
{
  "id": "corpus",
  "items": [
    { "text": "스택은 LIFO 구조로, 마지막에 삽입된 원소가 먼저 제거되는 자료구조다.", "expected": "concept", "clarity": "clear" },
    { "text": "해시 테이블이란 키를 해시 함수로 매핑해 값을 저장하는 자료구조를 말한다.", "expected": "concept", "clarity": "clear" },
    { "text": "Recursion is a technique where a function calls itself.", "expected": "concept", "clarity": "clear" },
    { "text": "동적 계획법은 큰 문제를 작은 하위 문제로 나눠 푸는 방법이다.", "expected": "concept", "clarity": "ambiguous" },
    { "text": "RAM은 휘발성 메모리로, 전원이 꺼지면 데이터가 사라진다.", "expected": "concept", "clarity": "ambiguous" },
    { "text": "L1 캐시의 접근 지연은 약 1ns이고 메인 메모리는 약 100ns다.", "expected": "fact", "clarity": "clear" },
    { "text": "퀵소트의 평균 시간복잡도는 O(n log n)이다.", "expected": "fact", "clarity": "clear" },
    { "text": "GPT-3 has 175 billion parameters trained on 300 billion tokens.", "expected": "fact", "clarity": "clear" },
    { "text": "리눅스 커널 6.1은 2022년 12월에 출시되었다.", "expected": "fact", "clarity": "clear" },
    { "text": "따라서 대규모 정렬에는 퀵소트보다 병합정렬이 더 안정적이라고 볼 수 있다.", "expected": "claim", "clarity": "clear" },
    { "text": "딥러닝 모델은 데이터가 많을수록 성능이 좋아지므로 항상 데이터를 늘려야 한다.", "expected": "claim", "clarity": "clear" },
    { "text": "The OS should preempt long-running processes to ensure fairness.", "expected": "claim", "clarity": "clear" },
    { "text": "이진 탐색 트리는 정렬된 데이터에서 강력하다.", "expected": "claim", "clarity": "ambiguous" },
    { "text": "예를 들어 이진 탐색 트리는 삽입 순서에 따라 한쪽으로 치우칠 수 있다.", "expected": "example", "clarity": "clear" },
    { "text": "For instance, a page fault occurs when a process accesses a page not currently in RAM.", "expected": "example", "clarity": "clear" },
    { "text": "For instance, a hash table degrades to O(n) when all keys collide.", "expected": "example", "clarity": "clear" },
    { "text": "먼저 pivot을 선택하고, 그다음 pivot보다 작은 값을 왼쪽으로 옮긴다.", "expected": "method", "clarity": "clear" },
    { "text": "To train the model, first normalize the inputs, then run backpropagation for each batch.", "expected": "method", "clarity": "clear" },
    { "text": "정규화하려면 우선 평균을 빼고 표준편차로 나눈다.", "expected": "method", "clarity": "clear" },
    { "text": "왜 교착상태(deadlock)는 네 가지 조건이 동시에 성립할 때만 발생하는가?", "expected": "question", "clarity": "clear" },
    { "text": "Is it always better to use a B-tree instead of a hash index for range queries?", "expected": "question", "clarity": "clear" },
    { "text": "How does backpropagation compute gradients without recomputing each layer?", "expected": "question", "clarity": "clear" },
    { "text": "이 알고리즘이 정말 최적인지 아직 확실하지 않다.", "expected": "question", "clarity": "ambiguous" },
    { "text": "무엇이 좋은 임베딩을 만드는지는 아직 열린 문제다.", "expected": "question", "clarity": "ambiguous" }
  ]
}
```

- [ ] **Step 2: classify 어댑터를 구현한다**

`scripts/evals/adapters/classify.ts`:

```ts
// classify eval — 순수 휴리스틱이라 모델 호출이 없다. 비용 0.
// 단위 테스트(src/llm/classify.test.ts)는 clear 항목의 정확 일치만 본다.
// eval 은 타입별 재현율과 macro-F1 을 본다 — 한 타입으로 몰아 찍어도 전체 정확도는 버틸 수 있기 때문이다.
import { join } from "node:path";
import { classify, type NodeType } from "../../../src/llm/classify";
import type { EvalAdapter, Metrics, Sample } from "../core";

const TYPES: NodeType[] = ["concept", "fact", "claim", "example", "method", "question"];

type Item = { text: string; expected: NodeType; clarity: "clear" | "ambiguous" };
type Fixture = { id: string; items: Item[] };
type Out = { predictions: { expected: NodeType; got: NodeType; clarity: Item["clarity"] }[] };

const adapter: EvalAdapter<Fixture, Out> = {
  id: "classify",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/classify/fixtures"),
  needsApiKey: false,

  async run(fx) {
    return { predictions: fx.items.map((i) => ({ expected: i.expected, got: classify(i.text), clarity: i.clarity })) };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    const p = samples.flatMap((s) => s.out?.predictions ?? []);
    const clear = p.filter((x) => x.clarity === "clear");
    const m: Metrics = {
      total: p.length,
      accuracy: p.length ? p.filter((x) => x.expected === x.got).length / p.length : NaN,
      clearAccuracy: clear.length ? clear.filter((x) => x.expected === x.got).length / clear.length : NaN,
      runFailed: samples.filter((s) => s.error).length,
    };

    const f1s: number[] = [];
    let minRecall = 1;
    for (const t of TYPES) {
      const tp = p.filter((x) => x.expected === t && x.got === t).length;
      const fp = p.filter((x) => x.expected !== t && x.got === t).length;
      const fn = p.filter((x) => x.expected === t && x.got !== t).length;
      const prec = tp + fp ? tp / (tp + fp) : 0;
      const rec = tp + fn ? tp / (tp + fn) : 0;
      const f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
      m[`recall_${t}`] = rec;
      m[`f1_${t}`] = f1;
      f1s.push(f1);
      minRecall = Math.min(minRecall, rec);
    }
    m.macroF1 = f1s.reduce((a, b) => a + b, 0) / f1s.length;
    m.minTypeRecall = minRecall;
    return m;
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "accuracy", op: ">=", threshold: 0.9, label: "전체 정확도 ≥ 0.9" },
    { metric: "clearAccuracy", op: "==", threshold: 1, label: "clear 항목 정확도 = 1.0" },
    { metric: "macroF1", op: ">=", threshold: 0.8, label: "macro-F1 ≥ 0.8" },
    { metric: "minTypeRecall", op: ">=", threshold: 0.7, label: "타입별 최소 재현율 ≥ 0.7" },
  ],
};

export default adapter;
```

- [ ] **Step 3: dedupConcepts fixture 를 만든다**

`docs/30-llm/evals/dedupConcepts/fixtures/pairs.json` — 병합돼야 하는 변형과 병합되면 안 되는 이웃을 섞는다.

```json
{
  "id": "pairs",
  "concepts": [
    { "title": "Self-Attention", "summary": "쿼리·키·값으로 토큰 간 가중치를 계산한다.", "explanation": "각 토큰이 다른 토큰을 얼마나 볼지 정한다." },
    { "title": "self-attention", "summary": "", "explanation": "스케일드 닷프로덕트를 쓴다.", "examples": ["QK^T/sqrt(d)"] },
    { "title": "Self-Attention ", "summary": "중복 표기 변형", "explanation": "" },
    { "title": "Multi-Head Attention", "summary": "여러 헤드로 나눠 병렬 어텐션.", "explanation": "" },
    { "title": "교착상태", "summary": "네 조건이 동시에 성립할 때 발생.", "explanation": "" },
    { "title": "교착 상태", "summary": "공백 변형", "explanation": "예방 기법이 있다." },
    { "title": "기아 상태", "summary": "교착과 다른 개념 — 병합되면 안 된다.", "explanation": "" }
  ],
  "expectedGroups": [
    ["Self-Attention", "self-attention", "Self-Attention "],
    ["Multi-Head Attention"],
    ["교착상태", "교착 상태"],
    ["기아 상태"]
  ]
}
```

- [ ] **Step 4: dedupConcepts 어댑터를 구현한다**

`scripts/evals/adapters/dedupConcepts.ts`:

```ts
// dedupConcepts eval — 순수 함수. 비용 0.
// 최악의 결함은 "합치면 안 될 것을 합치는 것"(오병합)이다. 서로 다른 개념이 한 파일로 뭉개지면
// 사용자가 쓴 내용이 사라진다. 미병합은 중복 파일이 생길 뿐이라 덜 나쁘다 — 게이트를 비대칭으로 둔다.
import { join } from "node:path";
import { mergeDuplicateConcepts } from "../../../src/llm/dedupConcepts";
import type { LlmConcept } from "../../../src/llm/provider";
import type { EvalAdapter, Metrics, Sample } from "../core";

type Fixture = { id: string; concepts: LlmConcept[]; expectedGroups: string[][] };
type Out = { merged: LlmConcept[]; groupOf: Map<string, number> };

// 병합 결과에서 "원제목 → 결과 인덱스" 를 만든다. 결과가 어떤 표기를 대표로 골랐든,
// 원본 제목이 어느 그룹에 흡수됐는지는 정규화 비교로 되찾을 수 있다.
const norm = (t: string): string => t.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

const adapter: EvalAdapter<Fixture, Out> = {
  id: "dedupConcepts",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/dedupConcepts/fixtures"),
  needsApiKey: false,

  async run(fx) {
    const merged = mergeDuplicateConcepts(fx.concepts);
    const groupOf = new Map<string, number>();
    for (const c of fx.concepts) {
      const idx = merged.findIndex((m) => norm(m.title) === norm(c.title));
      groupOf.set(c.title, idx);
    }
    return { merged, groupOf };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    let sameOk = 0, sameTotal = 0, diffBad = 0, diffTotal = 0, lostText = 0;

    for (const s of samples) {
      if (!s.out) continue;
      const { groupOf, merged } = s.out;
      const titles = s.fixture.concepts.map((c) => c.title);
      const groupIndexOf = new Map<string, number>();
      s.fixture.expectedGroups.forEach((g, gi) => g.forEach((t) => groupIndexOf.set(t, gi)));

      for (let i = 0; i < titles.length; i++) {
        for (let j = i + 1; j < titles.length; j++) {
          const shouldMerge = groupIndexOf.get(titles[i]) === groupIndexOf.get(titles[j]);
          const didMerge = groupOf.get(titles[i]) === groupOf.get(titles[j]);
          if (shouldMerge) {
            sameTotal++;
            if (didMerge) sameOk++;
          } else {
            diffTotal++;
            if (didMerge) diffBad++;
          }
        }
      }

      // 병합이 내용을 지우지 않는지 — 원본 explanation 이 결과 어딘가에 남아 있어야 한다.
      const blob = merged.map((m) => `${m.summary ?? ""}\n${m.explanation ?? ""}`).join("\n");
      for (const c of s.fixture.concepts) {
        const t = c.explanation?.trim();
        if (t && !blob.includes(t)) lostText++;
      }
    }

    return {
      runFailed: samples.filter((s) => s.error).length,
      falseMerge: diffBad, // 합치면 안 될 쌍을 합침 — 0이어야 한다
      missedMergeRatio: sameTotal ? 1 - sameOk / sameTotal : 0,
      lostText,
      pairsChecked: sameTotal + diffTotal,
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "falseMerge", op: "<=", threshold: 0, label: "오병합 0건" },
    { metric: "lostText", op: "<=", threshold: 0, label: "병합 중 본문 유실 0건" },
    { metric: "missedMergeRatio", op: "<=", threshold: 0.1, label: "미병합 ≤ 10%" },
  ],
};

export default adapter;
```

- [ ] **Step 5: 레지스트리에 등록한다**

`scripts/evals/registry.ts` 를 아래로 교체한다.

```ts
// 어댑터 레지스트리. lazy import — 어댑터 하나를 돌릴 때 다른 어댑터의 의존성을 끌어오지 않는다.
import type { EvalAdapter } from "./core";

export const ADAPTERS: Record<string, () => Promise<EvalAdapter<any, any>>> = {
  classify: async () => (await import("./adapters/classify")).default,
  dedupConcepts: async () => (await import("./adapters/dedupConcepts")).default,
};
```

- [ ] **Step 6: 실제로 돌려 baseline 을 측정한다**

Run: `npm run eval:classify`
Expected: 지표 JSON 출력 + `게이트 통과 ✅` 또는 게이트 실패 목록

Run: `npm run eval:dedupConcepts`
Expected: 지표 JSON 출력 + 판정 결과

**게이트가 깨지면 임계값을 낮추지 말고 실측값을 그대로 README 에 적는다.** 임계값 조정은 Task 9(적대적 판정)에서 근거와 함께 한다. 실측값이 임계값에 못 미치면 그 사실 자체가 이 작업의 발견이다.

- [ ] **Step 7: 게이트가 실제로 죽는지 확인한다**

`scripts/evals/adapters/classify.ts`의 `accuracy` 게이트 `threshold`를 임시로 `0.999`로 바꾸고:

Run: `npm run eval:classify; echo "exit=$?"`
Expected: `게이트 실패:` 출력 + `exit=1`

확인 후 `0.9`로 되돌린다.

- [ ] **Step 8: baseline 결과를 latest.json 으로 고정한다**

```bash
node -e "const {readdirSync,readFileSync,writeFileSync}=require('node:fs');const {join}=require('node:path');for(const id of ['classify','dedupConcepts']){const d=join('docs/30-llm/evals',id,'results');const f=readdirSync(d).filter(x=>x.startsWith('run-')&&!x.includes('-dry')).sort().pop();writeFileSync(join(d,'latest.json'),readFileSync(join(d,f)));console.log(id,'<-',f);}"
```

- [ ] **Step 9: run-*.json 을 gitignore 에 넣는다**

`.gitignore` 끝에 아래 한 줄을 추가한다 (파인만 규칙과 동일 — `latest.json`만 커밋).

```
docs/30-llm/evals/*/results/run-*.json
```

- [ ] **Step 10: 타입 검사와 테스트를 돌린다**

Run: `npm run check`
Expected: 오류 없음

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 11: 커밋한다**

```bash
git add scripts/evals/adapters/classify.ts scripts/evals/adapters/dedupConcepts.ts scripts/evals/registry.ts .gitignore docs/30-llm/evals/classify docs/30-llm/evals/dedupConcepts
git commit -m "feat(evals): classify·dedupConcepts 어댑터 + baseline 실측

둘 다 모델을 호출하지 않는 순수 함수라 비용 0으로 baseline 을 남겼다.
classify 는 전체 정확도만 보면 한 타입으로 몰아 찍어도 버티므로 타입별
재현율과 macro-F1 을 게이트에 넣었다. dedup 은 오병합(내용 유실)과
미병합(중복 파일)의 피해가 달라 임계값을 비대칭으로 뒀다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: chunk 어댑터 — 경계 F1과 문장 유실

`semanticChunk`는 `embed`를 주입받는다. fixture에 **고정 임베딩 벡터**를 넣으면 모델 호출 없이 결정적으로 돌릴 수 있다. 임베딩 품질이 아니라 **경계 결정 로직**이 측정 대상이므로 이게 맞다.

**Files:**
- Create: `scripts/evals/adapters/chunk.ts`
- Create: `docs/30-llm/evals/chunk/fixtures/topic-shift.json`
- Create: `docs/30-llm/evals/chunk/fixtures/single-topic.json`
- Modify: `scripts/evals/registry.ts`

**Interfaces:**
- Consumes: `EvalAdapter`, `Metrics`, `Sample`, `boundaryF1` (Task 1); `semanticChunk`, `splitSentences`, `type SemanticChunkResult` from `src/llm/chunk`
- Produces: `chunkAdapter` (기본 export)

- [ ] **Step 1: fixture 를 만든다**

`docs/30-llm/evals/chunk/fixtures/topic-shift.json` — 문장 4개, 앞 2개는 OS 주제, 뒤 2개는 통계 주제. `vectors`는 문장 순서대로의 임베딩이며, 앞 두 문장과 뒤 두 문장이 서로 직교한다. `goldBoundaries`는 문장 인덱스 i와 i+1 사이를 자른다는 뜻이다.

```json
{
  "id": "topic-shift",
  "text": "교착상태는 프로세스들이 서로 자원을 기다리는 상태다. 네 가지 조건이 동시에 성립해야 발생한다. p-value는 귀무가설 하에서 관측값 이상이 나올 확률이다. 유의수준과 비교해 기각 여부를 정한다.",
  "vectors": [[1, 0], [1, 0], [0, 1], [0, 1]],
  "goldBoundaries": [1],
  "options": { "percentile": 50, "minSentences": 1 },
  "whyHard": "주제가 정확히 한 번 바뀐다. 경계를 못 찾거나 여러 개로 쪼개면 실패."
}
```

`docs/30-llm/evals/chunk/fixtures/single-topic.json` — 주제가 하나라 경계가 없어야 한다.

```json
{
  "id": "single-topic",
  "text": "스택은 LIFO 자료구조다. 마지막에 넣은 것이 먼저 나온다. push와 pop으로 조작한다.",
  "vectors": [[1, 0], [1, 0], [1, 0]],
  "goldBoundaries": [],
  "options": { "percentile": 10, "minSentences": 1 },
  "whyHard": "유사도가 전부 같다. 억지로 하위 N%를 잘라 경계를 만들어내면 실패."
}
```

- [ ] **Step 2: 어댑터를 구현한다**

`scripts/evals/adapters/chunk.ts`:

```ts
// chunk eval — 경계 결정 로직이 측정 대상이다. 임베딩 품질이 아니다.
// fixture 에 고정 벡터를 넣어 모델 호출 없이 결정적으로 돌린다(EmbedFn 주입 구조 그대로 활용).
// 최악의 결함은 문장 유실이다 — 실제로 회귀한 적이 있다(src/llm/chunk.test.ts:61).
import { join } from "node:path";
import { semanticChunk, splitSentences } from "../../../src/llm/chunk";
import { boundaryF1, type EvalAdapter, type Metrics, type Sample } from "../core";

type Fixture = {
  id: string;
  text: string;
  vectors: number[][];
  goldBoundaries: number[];
  options: { percentile?: number; minSentences?: number };
  whyHard: string;
};

type Out = { boundaries: number[]; sentences: string[]; chunkSizes: number[]; joined: string };

const adapter: EvalAdapter<Fixture, Out> = {
  id: "chunk",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/chunk/fixtures"),
  needsApiKey: false,

  async run(fx) {
    const sentences = splitSentences(fx.text);
    if (sentences.length !== fx.vectors.length) {
      throw new Error(`문장 ${sentences.length}개 ≠ vectors ${fx.vectors.length}개 — fixture 를 고쳐야 한다`);
    }
    // 주입 임베더: splitSentences 결과 순서대로 fixture 의 벡터를 돌려준다.
    const embed = async (texts: string[]): Promise<number[][]> =>
      texts.map((t) => fx.vectors[sentences.indexOf(t)] ?? fx.vectors[0]);

    const r = await semanticChunk(fx.text, { embed, ...fx.options });
    return {
      boundaries: r.boundaries,
      sentences: r.sentences,
      chunkSizes: r.chunks.map((c) => c.sentences.length),
      joined: r.chunks.flatMap((c) => c.sentences).join(" "),
    };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    let f1sum = 0, n = 0, lost = 0, minViolation = 0;
    for (const s of samples) {
      if (!s.out) continue;
      n++;
      f1sum += boundaryF1(s.fixture.goldBoundaries, s.out.boundaries, 1);
      // 청크를 이어붙이면 원래 문장열과 정확히 같아야 한다 — 순서·개수 모두.
      if (s.out.joined !== s.out.sentences.join(" ")) lost++;
      const min = s.fixture.options.minSentences ?? 1;
      minViolation += s.out.chunkSizes.filter((sz) => sz < min).length;
    }
    return {
      runFailed: samples.filter((s) => s.error).length,
      cases: n,
      boundaryF1: n ? f1sum / n : NaN,
      sentenceLoss: lost,
      minSentencesViolation: minViolation,
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "sentenceLoss", op: "<=", threshold: 0, label: "문장 유실 0건" },
    { metric: "minSentencesViolation", op: "<=", threshold: 0, label: "minSentences 위반 0건" },
    { metric: "boundaryF1", op: ">=", threshold: 0.7, label: "경계 F1 ≥ 0.7 (잠정)" },
  ],
};

export default adapter;
```

- [ ] **Step 3: 레지스트리에 등록한다**

`scripts/evals/registry.ts`의 객체 리터럴 안에 아래 줄을 추가한다 (알파벳 순 유지: `chunk`는 `classify` 앞).

```ts
  chunk: async () => (await import("./adapters/chunk")).default,
```

- [ ] **Step 4: 돌려서 확인한다**

Run: `npm run eval:chunk`
Expected: `boundaryF1: 1`, `sentenceLoss: 0`, `게이트 통과 ✅`

값이 다르면 fixture의 `goldBoundaries`나 `percentile`이 실제 알고리즘과 어긋난 것이다. **알고리즘을 고치지 말고** fixture 를 실제 동작에 맞춰 다시 관찰한 뒤, 어긋남 자체를 README `발견` 절에 적는다.

- [ ] **Step 5: baseline 을 고정하고 커밋한다**

```bash
node -e "const {readdirSync,readFileSync,writeFileSync}=require('node:fs');const {join}=require('node:path');const d=join('docs/30-llm/evals/chunk/results');const f=readdirSync(d).filter(x=>x.startsWith('run-')&&!x.includes('-dry')).sort().pop();writeFileSync(join(d,'latest.json'),readFileSync(join(d,f)));"
git add scripts/evals/adapters/chunk.ts scripts/evals/registry.ts docs/30-llm/evals/chunk
git commit -m "feat(evals): chunk 어댑터 — 경계 F1·문장 유실 지표

fixture 에 고정 임베딩 벡터를 넣어 모델 호출 없이 경계 결정 로직만
결정적으로 측정한다. 문장 유실은 실제 회귀 이력이 있어 허용 0으로 막았다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: generate 어댑터 — 기존 골든 케이스에 게이트를 씌운다

기존 `scripts/eval.ts`는 케이스별 pass/fail만 낸다. 합격선이 문서에 없고 집계 지표도 없다. `assertCase`를 **재사용**해 지표화한다.

**Files:**
- Create: `scripts/evals/adapters/generate.ts`
- Modify: `scripts/evals/registry.ts`
- Modify: `scripts/eval.ts` (import 경로 변경 없음 — `assertCase`가 이미 export 되어 있는지만 확인)

**Interfaces:**
- Consumes: `EvalAdapter`, `Metrics`, `Sample` (Task 1); `assertCase` from `scripts/eval.ts`; `selectProvider`, `type LlmWikiInput`, `type LlmWikiResult` from `src/llm/index`; `validateLlmWikiResult` from `src/llm/validate`
- Produces: `generateAdapter` (기본 export)

- [ ] **Step 1: 어댑터를 구현한다**

`scripts/evals/adapters/generate.ts`:

```ts
// generate eval — 기존 scripts/eval.ts 의 골든 케이스와 채점 로직(assertCase)을 그대로 재사용하고,
// 케이스별 pass/fail 위에 집계 지표와 게이트를 얹는다. eval.ts 의 동작은 바꾸지 않는다.
// fixtures/expected 위치도 기존 그대로다 — docs/30-llm/evals/{fixtures,expected}.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertCase } from "../../eval";
import { selectProvider, type LlmWikiInput, type LlmWikiResult } from "../../../src/llm/index";
import { validateLlmWikiResult } from "../../../src/llm/validate";
import type { EvalAdapter, Metrics, Sample } from "../core";

const EVALS = join(process.cwd(), "docs/30-llm/evals");

type Fixture = { id: string; title: string; input: LlmWikiInput; tags?: string[] };
type Out = {
  result: LlmWikiResult;
  ok: boolean;
  failures: string[];
  warnings: string[];
  passes: number;
  shouldTotal: number;
  schemaValid: boolean;
  relatedToRatio: number;
};

// expected 는 fixture 와 같은 id 로 별도 디렉토리에 있다(기존 관례).
function loadExpected(id: string) {
  return JSON.parse(readFileSync(join(EVALS, "expected", `${id}.expected.json`), "utf-8"));
}

const adapter: EvalAdapter<Fixture, Out> = {
  id: "generate",
  fixturesDir: join(EVALS, "fixtures"),
  needsApiKey: true,

  async run(fx) {
    const provider = selectProvider("gemini");
    const result = await provider.generateWikiStructured(fx.input);
    const v = validateLlmWikiResult(result);
    const expected = loadExpected(fx.id);
    const outcome = assertCase(result, expected, v.valid);
    const shouldTotal =
      (expected.should?.relationTypeHints?.length ?? 0) + (expected.should?.relatedConceptTitles?.length ?? 0);
    const rel = result.relations;
    return {
      result,
      ok: outcome.ok && v.valid,
      failures: [...outcome.failures, ...v.errors.map((e) => `schema: ${e}`)],
      warnings: outcome.warnings,
      passes: outcome.passes.length,
      shouldTotal,
      schemaValid: v.valid,
      relatedToRatio: rel.length ? rel.filter((r) => r.relationType === "related_to").length / rel.length : 0,
    };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    const outs = samples.map((s) => s.out).filter((o): o is Out => !!o);
    const lat = samples.map((s) => s.latencyMs ?? 0).sort((a, b) => a - b);
    const shouldTotal = outs.reduce((a, o) => a + o.shouldTotal, 0);
    const shouldMet = outs.reduce((a, o) => a + (o.shouldTotal - o.warnings.length), 0);
    return {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      mustFail: outs.filter((o) => !o.ok).length,
      schemaInvalid: outs.filter((o) => !o.schemaValid).length,
      relatedToRatioMax: outs.length ? Math.max(...outs.map((o) => o.relatedToRatio)) : 0,
      shouldMetRatio: shouldTotal ? shouldMet / shouldTotal : NaN,
      latencyP50: lat.length ? lat[Math.floor(lat.length / 2)] : NaN,
      latencyMax: lat.length ? lat[lat.length - 1] : NaN,
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "mustFail", op: "<=", threshold: 0, label: "must 위반 0건" },
    { metric: "schemaInvalid", op: "<=", threshold: 0, label: "스키마 위반 0건" },
    { metric: "relatedToRatioMax", op: "<=", threshold: 0.3, label: "related_to 비율 ≤ 30% (잠정)" },
    { metric: "shouldMetRatio", op: ">=", threshold: 0.6, label: "should 충족률 ≥ 60% (잠정)" },
  ],
};

export default adapter;
```

- [ ] **Step 2: `assertCase` 가 export 되어 있는지 확인한다**

Run: `grep -n "export function assertCase" scripts/eval.ts`
Expected: `52:export function assertCase(...)` 한 줄. 없으면 `export`를 붙인다 — 그것 외에는 `eval.ts`를 고치지 않는다.

- [ ] **Step 3: `eval.ts` 의 main() 이 import 시 실행되지 않는지 확인한다**

Run: `grep -n "import.meta.url === pathToFileURL" scripts/eval.ts`
Expected: 한 줄 매치. 이 가드 덕분에 어댑터가 `assertCase`를 import해도 `eval.ts`의 CLI가 돌지 않는다.

- [ ] **Step 4: 레지스트리에 등록한다**

`scripts/evals/registry.ts`에 추가:

```ts
  generate: async () => (await import("./adapters/generate")).default,
```

- [ ] **Step 5: dry 로 배선을 확인한다**

Run: `npm run eval:generate -- --dry --case case-001-self-attention`
Expected: `needsApiKey: true`이지만 `--dry`이므로 키 검사를 건너뛴다. 키가 없으면 provider 호출이 실패해 `runFailed: 1`로 기록되고 `dry`라서 게이트는 있는 지표만 본다 → `runFailed` 게이트가 걸려 exit 1. **이건 정상이다** — 배선이 살아 있다는 증거다.

키가 있으면 실제 호출이 나가고 지표가 채워진다. 이번 작업의 범위는 배선 확인까지이며 baseline 실측은 2차다.

- [ ] **Step 6: 타입 검사 후 커밋한다**

Run: `npm run check`
Expected: 오류 없음

```bash
git add scripts/evals/adapters/generate.ts scripts/evals/registry.ts
git commit -m "feat(evals): generate 어댑터 — 기존 골든 케이스에 집계 지표·게이트 추가

scripts/eval.ts 의 assertCase 를 재사용한다. 채점 로직을 복제하지 않고
케이스별 pass/fail 위에 must 위반·스키마 위반·related_to 비율·should
충족률을 얹어 게이트로 만들었다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: judge 공용 모듈 + synthesize·mergeWiki 어댑터

합성·병합의 최악은 **환각**(원문에 없는 주장 추가)과 **유실**(기존 내용 삭제)이다. 유실은 코드로 잡히지만 환각은 모델 판정이 필요하다.

**Files:**
- Create: `scripts/evals/judge.ts`
- Create: `scripts/evals/adapters/synthesize.ts`
- Create: `scripts/evals/adapters/mergeWiki.ts`
- Create: `docs/30-llm/evals/synthesize/fixtures/os-deadlock.json`
- Create: `docs/30-llm/evals/mergeWiki/fixtures/append-section.json`
- Modify: `scripts/evals/registry.ts`

**Interfaces:**
- Consumes: `EvalAdapter`, `Metrics`, `Sample` (Task 1); `runSynthesis`, `heuristicSynthesis`, `type SynthesisInput`, `type SynthesisResult` from `src/llm/synthesize`; `runWikiMerge`, `type MergeSource` from `src/llm/mergeWiki`; `extractChatJson`, `GEMINI_OPENAI_ENDPOINT`, `GEMINI_MODEL` from `src/llm/gemini`
- Produces: `judgeJson<T>(system, payload, schema, apiKey): Promise<T>`

- [ ] **Step 1: judge 공용 모듈을 만든다**

`scripts/evals/judge.ts` — `scripts/feynman-eval.ts:102-135`의 `judgeProbe` 호출 규약을 일반화한다. **feynman-eval.ts 는 고치지 않는다** (검증된 코드를 건드리는 위험 > 중복 제거 이득).

```ts
// LLM-as-judge 공용 호출부. temperature 0, JSON 스키마 강제, 429/5xx 지수 백오프.
// 판정자가 관대해지는 것을 막는 장치는 각 어댑터의 system 프롬프트가 담당한다:
//   (1) 근거 인용 강제 (2) "의심스러우면 더 심한 쪽" (3) 강제 분류(중립 라벨로 도망 금지).
// 규약 출처: scripts/feynman-eval.ts (판정 실패가 지표를 갉아먹으므로 재시도한다)
import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "../../src/llm/gemini";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function judgeJson<T>(system: string, payload: unknown, schema: object, apiKey: string): Promise<T> {
  const body = JSON.stringify({
    model: process.env.GEMINI_MODEL || GEMINI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "Verdict", strict: false, schema } },
  });

  let last = "";
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(250 * 2 ** (attempt - 1));
    const res = await fetch(`${GEMINI_OPENAI_ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const v = extractChatJson(await res.json()) as T | null;
      if (v) return v;
      last = "no structured output";
      continue;
    }
    last = `HTTP ${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(`judge: ${last}`);
}
```

- [ ] **Step 2: synthesize fixture 를 만든다**

`docs/30-llm/evals/synthesize/fixtures/os-deadlock.json` — `keyPoints`는 요약이 반드시 담아야 할 원문 사실, `absentFacts`는 원문에 **없는** 사실로 모델이 지어내면 환각이다.

```json
{
  "id": "os-deadlock",
  "input": {
    "title": "교착상태",
    "notes": "# 운영체제 3주차\n교착상태는 둘 이상의 프로세스가 서로 상대가 점유한 자원을 기다리며 아무도 진행하지 못하는 상태다.\n발생하려면 상호배제, 점유대기, 비선점, 순환대기 네 조건이 동시에 성립해야 한다.\n예방은 이 중 하나를 깨는 방식으로 한다. 은행원 알고리즘은 회피(avoidance) 기법이다."
  },
  "keyPoints": ["상호배제", "점유대기", "비선점", "순환대기", "은행원 알고리즘"],
  "absentFacts": ["세마포어", "뮤텍스", "라운드로빈", "페이지 폴트"],
  "whyHard": "네 조건을 다 담으면서 원문에 없는 동기화 용어를 끌어오지 않아야 한다."
}
```

- [ ] **Step 3: synthesize 어댑터를 구현한다**

`scripts/evals/adapters/synthesize.ts`:

```ts
// synthesize eval — 합성 요약의 최악은 환각(원문에 없는 주장)이다.
// keyPoints 재현율은 코드로 세고(cheap), 환각은 근거 인용을 강제한 judge 가 본다.
// 별도 지표: heuristicSynthesis 폴백이 채택되면 그것만으로 회귀다(품질 다운그레이드 이력).
import { join } from "node:path";
import { runSynthesis, type SynthesisInput } from "../../../src/llm/synthesize";
import { judgeJson } from "../judge";
import type { EvalAdapter, Metrics, Sample } from "../core";

type Fixture = { id: string; input: SynthesisInput; keyPoints: string[]; absentFacts: string[]; whyHard: string };
type Out = { markdown: string; keyPointHits: number; absentHits: string[]; hasHeading: boolean; korean: boolean };

type Verdict = { hallucination: boolean; hallucinationEvidence: string; contradiction: boolean; contradictionEvidence: string };

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hallucination", "hallucinationEvidence", "contradiction", "contradictionEvidence"],
  properties: {
    hallucination: { type: "boolean" },
    hallucinationEvidence: { type: "string" },
    contradiction: { type: "boolean" },
    contradictionEvidence: { type: "string" },
  },
} as const;

const JUDGE_SYSTEM = [
  "You audit a study-note synthesis. The synthesis must contain ONLY what the source notes support.",
  "hallucination=true if the synthesis asserts any fact, term, or mechanism that the source notes do not state or entail.",
  "  Rephrasing or reorganizing the source is NOT hallucination. Adding a new technical term the source never mentions IS.",
  "contradiction=true if the synthesis states something the source contradicts.",
  "Quote the exact offending sentence in the matching evidence field (empty string only when the flag is false).",
  "When in doubt, set the flag to true. A lenient auditor makes this metric useless.",
  "Respond ONLY with JSON conforming to the schema.",
].join("\n");

const adapter: EvalAdapter<Fixture, Out> = {
  id: "synthesize",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/synthesize/fixtures"),
  needsApiKey: true,

  async run(fx, ctx) {
    const r = await runSynthesis(fx.input, { apiKey: ctx.apiKey });
    const md = r.markdown ?? "";
    return {
      markdown: md,
      keyPointHits: fx.keyPoints.filter((k) => md.includes(k)).length,
      absentHits: fx.absentFacts.filter((a) => md.includes(a)),
      hasHeading: /^#{1,6}\s/m.test(md),
      korean: /[가-힣]/.test(md),
    };
  },

  async metrics(samples: Sample<Fixture, Out>[], ctx): Promise<Metrics> {
    const outs = samples.filter((s) => s.out);
    const keyTotal = samples.reduce((a, s) => a + s.fixture.keyPoints.length, 0);
    const keyHit = outs.reduce((a, s) => a + (s.out!.keyPointHits ?? 0), 0);

    const m: Metrics = {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      keyPointRecall: keyTotal ? keyHit / keyTotal : NaN,
      absentFactLeak: outs.reduce((a, s) => a + s.out!.absentHits.length, 0),
      noHeading: outs.filter((s) => !s.out!.hasHeading).length,
      notKorean: outs.filter((s) => !s.out!.korean).length,
    };

    if (ctx.dry) return m; // judge 지표는 만들지 않는다 — 코어가 dry 에서 건너뛴다
    let hallu = 0, contra = 0, judgeFail = 0;
    for (const s of outs) {
      try {
        const v = await judgeJson<Verdict>(
          JUDGE_SYSTEM,
          { sourceNotes: s.fixture.input, synthesis: s.out!.markdown },
          VERDICT_SCHEMA,
          ctx.apiKey,
        );
        if (v.hallucination) hallu++;
        if (v.contradiction) contra++;
      } catch {
        judgeFail++;
      }
    }
    m.hallucination = hallu;
    m.contradiction = contra;
    m.judgeFail = judgeFail;
    return m;
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "absentFactLeak", op: "<=", threshold: 0, label: "원문에 없는 용어 등장 0건" },
    { metric: "notKorean", op: "<=", threshold: 0, label: "한국어 아님 0건" },
    { metric: "noHeading", op: "<=", threshold: 0, label: "헤딩 없는 출력 0건" },
    { metric: "keyPointRecall", op: ">=", threshold: 0.8, label: "핵심포인트 재현율 ≥ 0.8 (잠정)" },
    { metric: "hallucination", op: "<=", threshold: 0, label: "환각 0건 (잠정)" },
    { metric: "contradiction", op: "<=", threshold: 0, label: "원문 모순 0건 (잠정)" },
    { metric: "judgeFail", op: "<=", threshold: 0, label: "judge 실패 0건" },
  ],
};

export default adapter;
```

- [ ] **Step 4: mergeWiki fixture 를 만든다**

`docs/30-llm/evals/mergeWiki/fixtures/append-section.json`:

```json
{
  "id": "append-section",
  "existing": "## 정의\n교착상태는 프로세스들이 서로의 자원을 기다리는 상태다.\n\n## 필요조건\n상호배제, 점유대기, 비선점, 순환대기.",
  "incoming": "## 예방 기법\n순환대기를 깨려면 자원에 전역 순서를 부여한다.",
  "mustKeepLines": [
    "교착상태는 프로세스들이 서로의 자원을 기다리는 상태다.",
    "상호배제, 점유대기, 비선점, 순환대기."
  ],
  "expectHeadings": ["정의", "필요조건", "예방 기법"],
  "whyHard": "새 절을 붙이면서 기존 두 절을 한 글자도 지우면 안 된다. 헤딩 중복도 안 된다."
}
```

- [ ] **Step 5: mergeWiki 어댑터를 구현한다**

`scripts/evals/adapters/mergeWiki.ts`:

```ts
// mergeWiki eval — 최악의 결함은 기존 위키 내용 삭제다.
// docs/10-contracts 의 archive 불변 원칙과 같은 정신: LLM 출력이 사용자 자산을 덮으면 안 된다.
// 유실·중복 헤딩은 전부 코드로 잡힌다 — judge 가 필요 없다.
import { join } from "node:path";
import { runWikiMerge } from "../../../src/llm/mergeWiki";
import type { EvalAdapter, Metrics, Sample } from "../core";

type Fixture = {
  id: string;
  existing: string;
  incoming: string;
  mustKeepLines: string[];
  expectHeadings: string[];
  whyHard: string;
};

type Out = { merged: string; lostLines: string[]; duplicateHeadings: string[]; missingHeadings: string[] };

function headings(md: string): string[] {
  return [...md.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim());
}

const adapter: EvalAdapter<Fixture, Out> = {
  id: "mergeWiki",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/mergeWiki/fixtures"),
  needsApiKey: true,

  async run(fx, ctx) {
    const merged = await runWikiMerge(
      { title: fx.id, existing: fx.existing, incoming: fx.incoming } as never,
      { apiKey: ctx.apiKey },
    );
    const md = typeof merged === "string" ? merged : ((merged as { markdown?: string }).markdown ?? "");
    const hs = headings(md);
    const seen = new Set<string>();
    const dup: string[] = [];
    for (const h of hs) {
      if (seen.has(h)) dup.push(h);
      seen.add(h);
    }
    return {
      merged: md,
      lostLines: fx.mustKeepLines.filter((l) => !md.includes(l)),
      duplicateHeadings: dup,
      missingHeadings: fx.expectHeadings.filter((h) => !hs.some((x) => x.includes(h))),
    };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    const outs = samples.filter((s) => s.out);
    return {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      lostLines: outs.reduce((a, s) => a + s.out!.lostLines.length, 0),
      duplicateHeadings: outs.reduce((a, s) => a + s.out!.duplicateHeadings.length, 0),
      missingHeadings: outs.reduce((a, s) => a + s.out!.missingHeadings.length, 0),
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "lostLines", op: "<=", threshold: 0, label: "기존 내용 삭제 0건" },
    { metric: "duplicateHeadings", op: "<=", threshold: 0, label: "중복 헤딩 0건" },
    { metric: "missingHeadings", op: "<=", threshold: 0, label: "기대 헤딩 누락 0건 (잠정)" },
  ],
};

export default adapter;
```

> **주의:** `runWikiMerge`의 실제 시그니처를 `src/llm/mergeWiki.ts:73`에서 확인하고 위 `run()`의 인자 구성을 실제 타입에 맞춰 고친다. `as never` 캐스트는 남기지 말 것 — 타입이 안 맞으면 fixture 스키마를 실제 시그니처에 맞게 바꾼다.

- [ ] **Step 6: 레지스트리에 등록한다**

```ts
  mergeWiki: async () => (await import("./adapters/mergeWiki")).default,
  synthesize: async () => (await import("./adapters/synthesize")).default,
```

- [ ] **Step 7: dry 로 배선을 확인한다**

Run: `npm run eval:synthesize -- --dry`
Expected: judge 지표(`hallucination` 등)가 없고 코어가 건너뛴다. `runFailed` 게이트만 판정된다.

Run: `npm run eval:mergeWiki -- --dry`
Expected: 같은 형태

- [ ] **Step 8: 타입 검사 후 커밋한다**

Run: `npm run check`
Expected: 오류 없음

```bash
git add scripts/evals/judge.ts scripts/evals/adapters/synthesize.ts scripts/evals/adapters/mergeWiki.ts scripts/evals/registry.ts docs/30-llm/evals/synthesize docs/30-llm/evals/mergeWiki
git commit -m "feat(evals): judge 공용 모듈 + synthesize·mergeWiki 어댑터

합성은 환각이, 병합은 기존 내용 삭제가 최악이다. 병합 유실·중복 헤딩은
전부 코드로 잡히므로 judge 없이 게이트했고, 합성 환각만 근거 인용을
강제한 judge 에 맡겼다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: ocr · pdfsummary 어댑터

**Files:**
- Create: `scripts/evals/adapters/ocr.ts`
- Create: `scripts/evals/adapters/pdfsummary.ts`
- Create: `docs/30-llm/evals/ocr/fixtures/printed-formula.json`
- Create: `docs/30-llm/evals/pdfsummary/fixtures/lecture-slide.json`
- Modify: `scripts/evals/registry.ts`

**Interfaces:**
- Consumes: `EvalAdapter`, `Metrics`, `Sample`, `cer` (Task 1); `judgeJson` (Task 6); `runImageOcr` from `src/llm/ocr`; `runPdfSummary`, `SUMMARY_MAX_CHARS`, `type PdfSummaryInput` from `src/llm/pdfsummary`
- Produces: `ocrAdapter`, `pdfsummaryAdapter` (기본 export)

- [ ] **Step 1: OCR fixture 를 만든다**

`imageFile`은 fixture 디렉토리 기준 상대 경로다. **이미지는 실제로 넣어야 한다** — 저장소에 없으면 fixture를 추가하지 말고 README에 "이미지 필요"로 남긴다.

`docs/30-llm/evals/ocr/fixtures/printed-formula.json`:

```json
{
  "id": "printed-formula",
  "imageFile": "images/printed-formula.png",
  "kind": "printed",
  "groundTruth": "이진 탐색의 시간복잡도는 O(log n)이다. 배열이 정렬되어 있어야 한다.",
  "whyHard": "수식 표기 O(log n) 이 깨지기 쉽다."
}
```

- [ ] **Step 2: OCR 어댑터를 구현한다**

`scripts/evals/adapters/ocr.ts`:

```ts
// ocr eval — 문자 정확도(CER)와 3-block 구조 준수를 본다.
// 이미지가 없으면 fixture 를 건너뛰지 않고 에러로 남긴다 — 조용히 0건 측정하고 통과하면 안 된다.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runImageOcr } from "../../../src/llm/ocr";
import { cer, type EvalAdapter, type Metrics, type Sample } from "../core";

const DIR = join(process.cwd(), "docs/30-llm/evals/ocr/fixtures");

type Fixture = { id: string; imageFile: string; kind: "printed" | "handwritten"; groundTruth: string; whyHard: string };
type Out = { text: string; cer: number; blocks: number; korean: boolean };

// buildOcrRequest 가 지시하는 3-block 출력 규약 (src/llm/ocr.ts) — 헤딩 3개가 있어야 한다.
function countBlocks(md: string): number {
  return [...md.matchAll(/^#{1,6}\s+/gm)].length;
}

const adapter: EvalAdapter<Fixture, Out> = {
  id: "ocr",
  fixturesDir: DIR,
  needsApiKey: true,

  async run(fx, ctx) {
    const path = join(DIR, fx.imageFile);
    if (!existsSync(path)) throw new Error(`이미지 없음: ${fx.imageFile} — fixture 에 실제 이미지를 넣어야 한다`);
    const b64 = readFileSync(path).toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;
    const r = await runImageOcr(dataUrl, ctx.apiKey);
    const text = typeof r === "string" ? r : ((r as { text?: string }).text ?? "");
    return { text, cer: cer(fx.groundTruth, text), blocks: countBlocks(text), korean: /[가-힣]/.test(text) };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    const outs = samples.filter((s) => s.out);
    const printed = outs.filter((s) => s.fixture.kind === "printed").map((s) => s.out!.cer);
    const hand = outs.filter((s) => s.fixture.kind === "handwritten").map((s) => s.out!.cer);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    return {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      cerPrinted: mean(printed),
      cerHandwritten: mean(hand),
      structureViolation: outs.filter((s) => s.out!.blocks < 3).length,
      notKorean: outs.filter((s) => !s.out!.korean).length,
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "structureViolation", op: "<=", threshold: 0, label: "3-block 구조 위반 0건" },
    { metric: "notKorean", op: "<=", threshold: 0, label: "한국어 아님 0건" },
    { metric: "cerPrinted", op: "<=", threshold: 0.15, label: "인쇄체 CER ≤ 0.15 (잠정)" },
    { metric: "cerHandwritten", op: "<=", threshold: 0.3, label: "손글씨 CER ≤ 0.30 (잠정)" },
  ],
};

export default adapter;
```

> **주의:** `runImageOcr`의 반환 타입을 `src/llm/ocr.ts:55`(`OcrResult`)에서 확인하고 `text` 추출을 실제 필드명에 맞춘다. 캐스트로 뭉개지 말 것.

- [ ] **Step 3: pdfsummary fixture 를 만든다**

`docs/30-llm/evals/pdfsummary/fixtures/lecture-slide.json`:

```json
{
  "id": "lecture-slide",
  "input": {
    "text": "Chapter 3. Process Scheduling\n\n3.1 Objectives\nMaximize CPU utilization. Minimize turnaround time.\n\n3.2 Algorithms\nFCFS: first come first served, non-preemptive.\nSJF: shortest job first, optimal average waiting time.\nRound Robin: time quantum q, preemptive.\n\n3.3 Formula\nWaiting time W = T_turnaround - T_burst."
  },
  "expectSections": ["Objectives", "Algorithms", "Formula"],
  "expectTerms": ["FCFS", "SJF", "Round Robin"],
  "absentFacts": ["교착상태", "페이지 폴트", "세마포어"],
  "expectFormula": "T_turnaround",
  "whyHard": "영어 원문을 한국어로 요약하면서 알고리즘 이름과 수식 기호는 보존해야 한다."
}
```

- [ ] **Step 4: pdfsummary 어댑터를 구현한다**

`scripts/evals/adapters/pdfsummary.ts`:

```ts
// pdfsummary eval — 섹션 재현율·수식 보존·환각을 본다.
// 번역 요약이라 원문 용어(알고리즘 이름·수식 기호)는 그대로 남아야 하고, 내용은 한국어여야 한다.
import { join } from "node:path";
import { runPdfSummary, type PdfSummaryInput } from "../../../src/llm/pdfsummary";
import { judgeJson } from "../judge";
import type { EvalAdapter, Metrics, Sample } from "../core";

type Fixture = {
  id: string;
  input: PdfSummaryInput;
  expectSections: string[];
  expectTerms: string[];
  absentFacts: string[];
  expectFormula: string;
  whyHard: string;
};

type Out = {
  markdown: string;
  sectionHits: number;
  termHits: number;
  absentHits: string[];
  formulaKept: boolean;
  korean: boolean;
  truncated: boolean;
};

type Verdict = { hallucination: boolean; hallucinationEvidence: string };

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hallucination", "hallucinationEvidence"],
  properties: { hallucination: { type: "boolean" }, hallucinationEvidence: { type: "string" } },
} as const;

const JUDGE_SYSTEM = [
  "You audit a Korean summary of an English source document.",
  "hallucination=true if the summary asserts any fact, term, or number the source does not state.",
  "Translation and condensation are NOT hallucination. Introducing a concept absent from the source IS.",
  "Quote the exact offending sentence in hallucinationEvidence (empty string only when false).",
  "When in doubt, set hallucination=true. A lenient auditor makes this metric useless.",
  "Respond ONLY with JSON conforming to the schema.",
].join("\n");

const adapter: EvalAdapter<Fixture, Out> = {
  id: "pdfsummary",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/pdfsummary/fixtures"),
  needsApiKey: true,

  async run(fx, ctx) {
    const r = await runPdfSummary(fx.input, { apiKey: ctx.apiKey });
    const md = r.markdown ?? "";
    return {
      markdown: md,
      sectionHits: fx.expectSections.filter((s) => md.includes(s)).length,
      termHits: fx.expectTerms.filter((t) => md.includes(t)).length,
      absentHits: fx.absentFacts.filter((a) => md.includes(a)),
      formulaKept: md.includes(fx.expectFormula),
      korean: /[가-힣]/.test(md),
      truncated: Boolean(r.truncated),
    };
  },

  async metrics(samples: Sample<Fixture, Out>[], ctx): Promise<Metrics> {
    const outs = samples.filter((s) => s.out);
    const secTotal = samples.reduce((a, s) => a + s.fixture.expectSections.length, 0);
    const termTotal = samples.reduce((a, s) => a + s.fixture.expectTerms.length, 0);

    const m: Metrics = {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      sectionRecall: secTotal ? outs.reduce((a, s) => a + s.out!.sectionHits, 0) / secTotal : NaN,
      termRecall: termTotal ? outs.reduce((a, s) => a + s.out!.termHits, 0) / termTotal : NaN,
      absentFactLeak: outs.reduce((a, s) => a + s.out!.absentHits.length, 0),
      formulaBroken: outs.filter((s) => !s.out!.formulaKept).length,
      notKorean: outs.filter((s) => !s.out!.korean).length,
      unexpectedTruncation: outs.filter((s) => s.out!.truncated).length,
    };

    if (ctx.dry) return m;
    let hallu = 0, judgeFail = 0;
    for (const s of outs) {
      try {
        const v = await judgeJson<Verdict>(
          JUDGE_SYSTEM,
          { source: s.fixture.input, summary: s.out!.markdown },
          VERDICT_SCHEMA,
          ctx.apiKey,
        );
        if (v.hallucination) hallu++;
      } catch {
        judgeFail++;
      }
    }
    m.hallucination = hallu;
    m.judgeFail = judgeFail;
    return m;
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "absentFactLeak", op: "<=", threshold: 0, label: "원문에 없는 용어 등장 0건" },
    { metric: "formulaBroken", op: "<=", threshold: 0, label: "수식 기호 유실 0건" },
    { metric: "notKorean", op: "<=", threshold: 0, label: "한국어 아님 0건" },
    { metric: "unexpectedTruncation", op: "<=", threshold: 0, label: "예상치 못한 잘림 0건" },
    { metric: "sectionRecall", op: ">=", threshold: 0.8, label: "섹션 재현율 ≥ 0.8 (잠정)" },
    { metric: "termRecall", op: ">=", threshold: 0.8, label: "용어 재현율 ≥ 0.8 (잠정)" },
    { metric: "hallucination", op: "<=", threshold: 0, label: "환각 0건 (잠정)" },
    { metric: "judgeFail", op: "<=", threshold: 0, label: "judge 실패 0건" },
  ],
};

export default adapter;
```

> **주의:** `runPdfSummary`의 옵션·반환 타입을 `src/llm/pdfsummary.ts:112`, `PdfSummaryResult`(`:16`)에서 확인하고 실제 필드에 맞춘다.

- [ ] **Step 5: 레지스트리에 등록한다**

```ts
  ocr: async () => (await import("./adapters/ocr")).default,
  pdfsummary: async () => (await import("./adapters/pdfsummary")).default,
```

- [ ] **Step 6: 배선을 확인한다**

Run: `npm run eval:pdfsummary -- --dry`
Expected: judge 지표 없음, `runFailed` 게이트만 판정

Run: `npm run eval:ocr -- --dry`
Expected: 이미지가 없으면 `runFailed: 1`로 exit 1 — **정상이다.** 이미지 없는 fixture를 조용히 통과시키지 않는다는 증거다.

- [ ] **Step 7: 타입 검사 후 커밋한다**

Run: `npm run check`
Expected: 오류 없음

```bash
git add scripts/evals/adapters/ocr.ts scripts/evals/adapters/pdfsummary.ts scripts/evals/registry.ts docs/30-llm/evals/ocr docs/30-llm/evals/pdfsummary
git commit -m "feat(evals): ocr·pdfsummary 어댑터 — CER·섹션 재현율·환각

OCR 은 이미지가 없으면 조용히 건너뛰지 않고 실행 실패로 기록해 게이트를
깬다. 0건 측정하고 통과하는 것이 지표를 무력화하는 가장 흔한 방식이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: 문서 — 인덱스·판정 담당 표·기능별 README

**Files:**
- Modify: `docs/30-llm/evals.md` (§ 추가, 기존 §1~§9 유지)
- Create: `docs/30-llm/evals/{generate,synthesize,mergeWiki,dedupConcepts,chunk,classify,ocr,pdfsummary}/README.md` (8개)

**Interfaces:**
- Consumes: Task 3~7에서 확정된 지표 이름과 게이트 라벨 (README의 합격선 표는 어댑터 `gates[].label`과 문구가 일치해야 한다)
- Produces: 없음 (문서)

- [ ] **Step 1: `docs/30-llm/evals.md` 에 인덱스와 판정 담당 표를 추가한다**

파일 끝(`## 9. 변경 이력 노트` 뒤)에 아래를 덧붙인다. 기존 절은 수정하지 않는다.

````markdown
## 10. 기능별 eval 인덱스

LLM을 쓰는 기능마다 지표·합격선·baseline을 따로 둔다. 공용 러너는 `scripts/evals/`이고, 기능별 상세는 각 README에 있다.

| 기능 | 러너 | 상세 | 모델 호출 |
|---|---|---|---|
| 위키 생성 | `npm run eval:generate` | [generate/README.md](evals/generate/README.md) | 필요 |
| 위키 합성 | `npm run eval:synthesize` | [synthesize/README.md](evals/synthesize/README.md) | 필요 |
| 위키 병합 | `npm run eval:mergeWiki` | [mergeWiki/README.md](evals/mergeWiki/README.md) | 필요 |
| 개념 중복제거 | `npm run eval:dedupConcepts` | [dedupConcepts/README.md](evals/dedupConcepts/README.md) | 불필요 |
| 파인만 | `npm run eval:feynman` | [feynman/README.md](evals/feynman/README.md) | 필요 |
| 청킹 | `npm run eval:chunk` | [chunk/README.md](evals/chunk/README.md) | 불필요 |
| 분류 | `npm run eval:classify` | [classify/README.md](evals/classify/README.md) | 불필요 |
| OCR | `npm run eval:ocr` | [ocr/README.md](evals/ocr/README.md) | 필요 |
| PDF 요약 | `npm run eval:pdfsummary` | [pdfsummary/README.md](evals/pdfsummary/README.md) | 필요 |

`npm run eval:all`은 전체를 순서대로 돌린다. `--dry`를 붙이면 모델 호출 지표를 생략하고 코드로 잡는 지표만 본다.

**실행 위치는 로컬이다.** CI에 올리지 않는다 — API 키가 필요하고 비결정적이라 PR마다 돌리면 비용과 flaky가 생긴다. baseline은 각 기능의 `results/latest.json` 커밋으로 비교한다. `run-*.json`은 `.gitignore` 대상이다.

## 11. 게이트 작성 규칙

1. 게이트는 `지표 op 임계값` 형태만 쓴다. "좋아졌다", "자연스럽다" 같은 자유서술 판정은 게이트가 될 수 없다.
2. **지표가 산출되지 않으면 통과가 아니라 실패다.** 러너 코어가 이 규칙을 강제한다 (`scripts/evals/core.ts` `evaluateGates`).
3. LLM judge를 쓰는 지표는 반드시 (a) 근거 인용을 강제하고 (b) 애매하면 더 심한 쪽을 고르게 하고 (c) 중립 라벨로 도망갈 수 없게 강제 분류한다. 게이트는 라벨의 개수·비율만 본다.
4. 임계값을 조정할 때는 **실측 근거**를 README `변경 이력`에 남긴다. 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

## 12. 판정 담당

> 평가지표를 만드는 사람과 그 지표로 판정하는 사람은 갈라야 한다. LLM Core 코드를 소유한 사람이 자기 기준으로 자기 코드를 판정하면 지표가 게이트로 기능하지 않는다.

**규칙**

- 어떤 기능의 `src/llm/*` 코드를 소유한 사람은 그 기능의 **합격선을 단독으로 승인할 수 없다.**
- 합격선 변경(임계값 조정·게이트 추가/삭제)은 판정 담당의 승인이 필요하다.
- 지표가 깨졌을 때 "이건 오탐이다"를 판단하는 것도 판정 담당이다.

| 기능 | 코드 소유자 | 판정 담당 |
|---|---|---|
| 위키 생성 | | |
| 위키 합성 | | |
| 위키 병합 | | |
| 개념 중복제거 | | |
| 파인만 | | |
| 청킹 | | |
| 분류 | | |
| OCR | | |
| PDF 요약 | | |

*빈 칸은 사람이 채운다. 에이전트가 이름을 추측해 채우지 않는다.*
````

- [ ] **Step 2: 기능별 README 8개를 쓴다**

각 README는 아래 5절 골격을 따른다 (파인만 README와 동형). 아래는 `chunk` 예시이며, 나머지 7개도 **같은 구조로 각 기능의 실제 지표·게이트·발견을 채워** 쓴다. 합격선 표의 문구는 해당 어댑터 `gates[].label`과 일치시킨다.

`docs/30-llm/evals/chunk/README.md`:

````markdown
# 청킹 eval

의미 경계 분할(`src/llm/chunk.ts`)의 **경계 결정 로직**을 측정한다. 러너: `npm run eval:chunk`

```bash
npm run eval:chunk                          # 전체 fixture
npm run eval:chunk -- --case topic-shift    # 하나만
```

## 왜 단위 테스트가 아닌가

`chunk.test.ts`는 "두 개로 잘린다" 같은 **모양**을 본다. eval은 **얼마나 맞게 잘랐는가**를 본다 — 골든 경계 대비 F1이다. 임계 파라미터(`percentile`)를 바꾸면 모양은 유지되면서 정확도만 조용히 나빠질 수 있고, 그건 단위 테스트가 못 잡는다.

임베딩은 fixture에 고정 벡터로 박아 넣는다. 측정 대상은 임베딩 품질이 아니라 경계 결정이므로 모델 호출이 필요 없다 — **비용 0, 완전 결정적**이다.

## 판정 층

전부 코드다. judge 없음.

- **경계 F1** — 골든 경계와 예측 경계를 ±1문장 허용으로 매칭. 골드 하나는 예측 하나에만 매칭한다(중복 크레딧 금지).
- **문장 유실** — 청크를 이어붙인 문장열이 원본 문장열과 정확히 같아야 한다. 순서·개수 모두.
- **minSentences 위반** — 옵션보다 작은 청크가 남았는가.

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 |
| `sentenceLoss` | 0 |
| `minSentencesViolation` | 0 |
| `boundaryF1` | ≥ 0.7 *(잠정, baseline 측정 후 확정)* |

문장 유실을 0으로 못박은 이유: 실제로 회귀한 적이 있다 (`src/llm/chunk.test.ts:61` — 병합 청크가 전역 인덱스를 로컬 배열에 넘겨 문장을 잃었다).

## 현재 결과 — `results/latest.json`

*(Task 4 실행 후 실측값을 여기에 적는다)*

## fixture 추가하기

`fixtures/<id>.json` 하나가 케이스 하나다.

```jsonc
{
  "id": "topic-shift",
  "text": "…원문…",
  "vectors": [[1,0],[1,0],[0,1],[0,1]],   // splitSentences 결과 순서대로의 임베딩
  "goldBoundaries": [1],                    // 문장 1과 2 사이를 자른다
  "options": { "percentile": 50, "minSentences": 1 },
  "whyHard": "이 케이스가 어떻게 함정인가"
}
```

`vectors` 길이는 `splitSentences(text)` 결과 길이와 같아야 한다. 다르면 러너가 실행 실패로 기록한다.

**좋은 fixture는 알고리즘을 함정에 빠뜨린다.** 주제가 하나뿐인데 억지로 자르게 만드는 입력, 경계가 여러 개인 입력, 짧은 문장이 섞여 minSentences 병합이 필요한 입력.
````

나머지 7개 README도 같은 5절 구조로 쓴다. 각 README에 반드시 포함할 것:

- **generate** — 기존 `fixtures/`·`expected/`를 쓴다는 점, `assertCase` 재사용, `must`/`should`/`must_not` 의미, `related_to` ≤ 30%가 `docs/10-contracts/relation-types.md`의 규정에서 온 것임을 명시
- **synthesize** — judge 프롬프트가 "의심스러우면 환각으로 본다"를 강제한다는 점, `heuristicSynthesis` 폴백이 채택되면 그 자체가 회귀라는 점
- **mergeWiki** — 기존 내용 삭제가 최악인 이유(`docs/10-contracts/workspace-layout.md`의 archive 불변 원칙과 같은 정신), judge가 필요 없는 이유(전부 코드로 잡힘)
- **dedupConcepts** — 오병합과 미병합의 피해가 달라 임계값이 비대칭인 이유, 정규화 규칙이 `llmApply.normalizeTitle`과 같아야 한다는 제약
- **classify** — 전체 정확도만 보면 한 타입으로 몰아 찍어도 버티므로 타입별 재현율과 macro-F1이 필요한 이유, 코퍼스가 `classify.test.ts`와 별도 표본인 이유
- **ocr** — 이미지가 없으면 조용히 건너뛰지 않고 실행 실패가 되는 이유, CER 정규화 규칙(공백·대소문자·NFC), 인쇄체/손글씨 임계값이 다른 이유
- **pdfsummary** — 번역 요약이라 원문 용어·수식은 보존하고 서술은 한국어여야 하는 이중 제약, `SUMMARY_MAX_CHARS` 잘림 처리

- [ ] **Step 3: 문서 CI 를 통과하는지 확인한다**

Run: `npm run check`
Expected: 오류 없음 (문서만 바뀌었으므로 통과해야 한다)

깨진 상대 링크가 없는지 확인한다:

Run: `node -e "const {readFileSync,existsSync}=require('node:fs');const {join,dirname}=require('node:path');const f='docs/30-llm/evals.md';const md=readFileSync(f,'utf-8');let bad=0;for(const m of md.matchAll(/\]\((?!https?:)([^)#]+)/g)){const p=join(dirname(f),m[1]);if(!existsSync(p)){console.log('깨진 링크:',m[1]);bad++;}}process.exit(bad?1:0)"`
Expected: 출력 없음, exit 0

- [ ] **Step 4: 커밋한다**

```bash
git add docs/30-llm/evals.md docs/30-llm/evals/generate docs/30-llm/evals/synthesize docs/30-llm/evals/mergeWiki docs/30-llm/evals/dedupConcepts docs/30-llm/evals/chunk docs/30-llm/evals/classify docs/30-llm/evals/ocr docs/30-llm/evals/pdfsummary
git commit -m "docs(evals): 기능별 eval 인덱스·게이트 작성 규칙·판정 담당 표

지표 소유자와 판정 담당을 분리하는 규칙을 명문화했다. 코드 소유자는 자기
기능의 합격선을 단독 승인할 수 없다. 이름 칸은 사람이 채운다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: 적대적 판정 — 게이트가 실제로 나쁜 출력을 잡는가

지표를 만든 쪽이 자기 지표를 승인하면 게이트가 게이트가 아니다. 이 태스크는 **어댑터 구현을 보지 않고 README만 읽는** 검증자가 수행한다.

**Files:**
- Modify: 각 `docs/30-llm/evals/<feature>/README.md` (`## 적대적 검증` 절 추가)
- Modify: 검증 결과에 따른 어댑터 게이트 (근거를 남기고 조정)

**Interfaces:**
- Consumes: Task 8의 README 8개 (지표 이름·합격선 표만)
- Produces: 각 README의 `## 적대적 검증` 절

- [ ] **Step 1: 기능마다 "게이트 통과 + 쓸모없음" 출력을 설계한다**

README의 합격선 표만 보고, **모든 게이트를 통과하면서 사용자에게는 쓸모없는 출력**을 구체적으로 서술한다. 예:

- `synthesize` — `keyPoints` 5개를 전부 나열만 하고 설명이 없는 목록. `keyPointRecall = 1.0`, `absentFactLeak = 0`, 헤딩 있음, 한국어 → **모든 게이트 통과**. 하지만 학습에 쓸모없다.
- `classify` — `ambiguous` 항목을 전부 틀려도 `clear`만 맞히면 `clearAccuracy = 1.0`, `accuracy = 0.79`… → `accuracy ≥ 0.9` 게이트가 잡는가? 코퍼스 비율에 따라 다르다. 실제 숫자로 확인한다.
- `chunk` — 문장마다 하나씩 자르면 `sentenceLoss = 0`, `minSentencesViolation = 0`이고 `boundaryF1`은 골든 경계 수에 따라 우연히 통과할 수 있다.

- [ ] **Step 2: 그 출력이 실제로 게이트를 통과하는지 mock 으로 확인한다**

각 기능에 대해 임시 fixture 또는 mock `run()`으로 위 출력을 넣고 러너를 돌린다. 통과하면 게이트가 헐거운 것이다.

Run 예 (`synthesize`): `run()`을 목록만 반환하도록 임시 수정 → `npm run eval:synthesize -- --dry` → 게이트 통과 여부 확인. 확인 후 **반드시 원복한다.**

- [ ] **Step 3: 뚫린 게이트를 보강하거나, 못 막는 한계를 명시한다**

두 가지 결말만 허용한다.

1. **게이트 보강** — 새 지표를 추가한다 (예: `synthesize`에 "핵심포인트당 최소 설명 길이" 지표).
2. **한계 명시** — 자동으로 못 잡는 것이면 README `## 적대적 검증`에 *"이 게이트는 X를 막지 못한다. 사람 표본 검수 필요."*라고 적는다.

**임계값을 낮춰서 통과시키는 것은 금지다.**

- [ ] **Step 4: 각 README 에 `## 적대적 검증` 절을 쓴다**

형식:

```markdown
## 적대적 검증

README의 합격선만 보고 "게이트를 전부 통과하면서 쓸모없는 출력"을 만들어 봤다.

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| 핵심어만 나열하고 설명 0 | ❌ 통과함 | `minExplanationChars` 지표 추가 |
| … | ✅ `absentFactLeak` 이 잡음 | 없음 |

**자동으로 못 잡는 것:** …
```

- [ ] **Step 5: 전체를 돌려 최종 상태를 확인한다**

Run: `npm run eval:all -- --dry`
Expected: 모델 호출 없는 기능(`chunk`, `classify`, `dedupConcepts`)은 실제 지표로 게이트 통과. 나머지는 `runFailed`가 0이거나(키 있음) 게이트 실패로 exit 1(키 없음) — **어느 쪽이든 배선이 살아 있다는 증거다.**

Run: `npm run check && npm test`
Expected: 전부 PASS

- [ ] **Step 6: 커밋한다**

```bash
git add docs/30-llm/evals scripts/evals
git commit -m "test(evals): 적대적 검증 — 게이트를 통과하는 쓸모없는 출력 탐색

README 합격선만 보고 게이트를 우회하는 출력을 만들어 봤다. 뚫린 곳은
지표를 추가했고, 자동으로 못 잡는 한계는 README 에 명시했다. 임계값을
낮춰 통과시키는 조치는 하지 않았다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 완료 판정

아래가 전부 참이어야 끝난 것이다 (설계 문서 §8).

- [ ] `npm run eval:<feature>`가 8개 기능 각각에 존재하고 dry 모드에서 배선이 확인된다
- [ ] 게이트를 일부러 깨면 러너가 `exit 1`로 죽고 어떤 게이트가 깨졌는지 출력한다 (Task 3 Step 7에서 실증)
- [ ] 기능마다 README에 지표 표와 합격선 표가 있고 모든 임계값이 수치 또는 위반 카운트다
- [ ] `npm run check`와 `npm test`가 통과한다
- [ ] 적대적 판정 결과가 각 README `## 적대적 검증`에 기록됐다
- [ ] `docs/30-llm/evals.md`에 판정 담당 표가 있고 이름 칸이 비어 있다
- [ ] `classify`·`dedupConcepts`·`chunk`는 baseline이 `results/latest.json`에 커밋됐다

**이번에 채우지 못하는 것:** 모델 호출이 필요한 5개 기능(`generate`, `synthesize`, `mergeWiki`, `ocr`, `pdfsummary`)의 baseline 실측. 원본 작업 카드의 완료 조건 3번은 2차로 남는다. PR 본문에 이 사실을 명시한다.
