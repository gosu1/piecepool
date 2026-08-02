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
