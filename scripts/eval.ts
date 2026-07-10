// LLM 골든 케이스 eval 러너. 실행: tsx(devDep) — `npm run eval -- <args>`.
//   npm run eval -- --case case-001-self-attention
//   npm run eval -- --all
//   npm run eval -- --compare case-001-self-attention
//
// 핵심: provider는 앱과 동일한 src/llm 경로를 in-process 직호출(selectProvider) — JS 재구현 없음.
// 스키마 게이트는 validate.ts keystone 재사용(독립 재검증). SSOT: docs/30-llm/evals.md §2~§5.
// 러너 도구 결정(TS+tsx): docs/30-llm/evals.md §4.4 / open-questions §6.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { selectProvider, type LlmWikiInput, type LlmWikiResult, type ProviderId } from "../src/llm/index";
import { validateLlmWikiResult } from "../src/llm/validate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVALS_DIR = join(ROOT, "docs/30-llm/evals");
const DEFAULT_DIRS: Dirs = {
  fixturesDir: join(EVALS_DIR, "fixtures"),
  expectedDir: join(EVALS_DIR, "expected"),
  resultsDir: join(EVALS_DIR, "results"),
};
const PROVIDERS: ProviderId[] = ["gemini"];

// fixtures/*.json, expected/*.expected.json 스키마: docs/30-llm/evals.md §2.2, §2.3.
type Fixture = { id: string; title: string; input: LlmWikiInput; tags?: string[] };
type RelationHint = { from: string; to: string; type: string };
type Expected = {
  caseId: string;
  must: { conceptTitles?: string[]; relationsAtLeast?: number; schemaValid?: boolean };
  should?: {
    conceptTitlesAlsoAcceptable?: string[];
    relatedConceptTitles?: string[];
    relationTypeHints?: RelationHint[];
  };
  must_not?: { relationTypes?: string[]; concepts?: string[] };
};
type Dirs = { fixturesDir: string; expectedDir: string; resultsDir: string };
type CaseOutcome = { ok: boolean; failures: string[]; warnings: string[]; passes: string[] };
type Runner = (input: LlmWikiInput) => Promise<LlmWikiResult>;

function normTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

// 정규화 후 부분 포함(양방향) — provider별 표기 흔들림(접미사/언어) 흡수. evals.md §5.1.
function fuzzyHit(haystack: string[], needle: string): boolean {
  return haystack.some((h) => h.includes(needle) || needle.includes(h));
}

// must/should/must_not 채점. schemaValid는 호출부의 validate.ts 재검증 결과를 주입받는다.
export function assertCase(result: LlmWikiResult, expected: Expected, schemaValid: boolean): CaseOutcome {
  const failures: string[] = [];
  const warnings: string[] = [];
  const passes: string[] = [];

  const titlesNorm = result.concepts.map((c) => normTitle(c.title));
  const relTypes = result.relations.map((r) => r.relationType);

  if (expected.must.schemaValid) {
    if (schemaValid) passes.push("schema 유효");
    else failures.push("must.schemaValid: LlmWikiResult 스키마 위반");
  }

  const acceptableExtra = (expected.should?.conceptTitlesAlsoAcceptable ?? []).map(normTitle);
  for (const title of expected.must.conceptTitles ?? []) {
    const candidates = [normTitle(title), ...acceptableExtra];
    if (candidates.some((c) => fuzzyHit(titlesNorm, c))) {
      passes.push(`must.concept "${title}" 포함`);
    } else {
      failures.push(`must.concept "${title}" 누락 (추출: ${result.concepts.map((c) => c.title).join(", ") || "없음"})`);
    }
  }

  const atLeast = expected.must.relationsAtLeast ?? 0;
  if (result.relations.length < atLeast) {
    failures.push(`must.relationsAtLeast ${atLeast} 미달 (실제 ${result.relations.length})`);
  } else if (atLeast > 0) {
    passes.push(`must.relationsAtLeast ${result.relations.length}개`);
  }

  for (const type of expected.must_not?.relationTypes ?? []) {
    if (relTypes.includes(type)) failures.push(`must_not.relationType "${type}" 등장`);
  }
  for (const title of expected.must_not?.concepts ?? []) {
    if (fuzzyHit(titlesNorm, normTitle(title))) failures.push(`must_not.concept "${title}" 등장`);
  }

  for (const hint of expected.should?.relationTypeHints ?? []) {
    const from = normTitle(hint.from);
    const to = normTitle(hint.to);
    const found = result.relations.some(
      (r) =>
        fuzzyHit([normTitle(r.sourceConceptTitle)], from) &&
        fuzzyHit([normTitle(r.targetConceptTitle)], to) &&
        r.relationType === hint.type,
    );
    if (found) passes.push(`should.relation ${hint.from} -[${hint.type}]-> ${hint.to}`);
    else warnings.push(`should.relation ${hint.from} -[${hint.type}]-> ${hint.to} 미발견`);
  }
  for (const title of expected.should?.relatedConceptTitles ?? []) {
    const norm = normTitle(title);
    const present =
      fuzzyHit(titlesNorm, norm) ||
      result.relations.some((r) => fuzzyHit([normTitle(r.sourceConceptTitle), normTitle(r.targetConceptTitle)], norm));
    if (!present) warnings.push(`should.relatedConcept "${title}" 미등장`);
  }

  // related_to 과다(>50%) — evals.md §5.2, output-validation §5.
  if (result.relations.length > 0) {
    const ratio = result.relations.filter((r) => r.relationType === "related_to").length / result.relations.length;
    if (ratio > 0.5) warnings.push(`related_to 비율 ${(ratio * 100).toFixed(0)}% > 50%`);
  }

  return { ok: failures.length === 0, failures, warnings, passes };
}

function loadCase(caseId: string, dirs: Dirs): { fixture: Fixture; expected: Expected } {
  const fixture = JSON.parse(readFileSync(join(dirs.fixturesDir, `${caseId}.json`), "utf-8")) as Fixture;
  const expected = JSON.parse(readFileSync(join(dirs.expectedDir, `${caseId}.expected.json`), "utf-8")) as Expected;
  return { fixture, expected };
}

function defaultRunner(id: ProviderId): Runner {
  const provider = selectProvider(id);
  return (input) => provider.generateWikiStructured(input);
}

export async function runCase(
  caseId: string,
  providerId: ProviderId,
  runner: Runner = defaultRunner(providerId),
  dirs: Dirs = DEFAULT_DIRS,
): Promise<CaseOutcome> {
  const { fixture, expected } = loadCase(caseId, dirs);
  process.stdout.write(`  [${providerId}] ${caseId} ... `);

  let result: LlmWikiResult;
  try {
    result = await runner(fixture.input);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log("ERROR");
    console.error(`    ${error}`);
    return { ok: false, failures: [error], warnings: [], passes: [] };
  }

  const v = validateLlmWikiResult(result);
  const outcome = assertCase(result, expected, v.valid);
  if (!v.valid) outcome.failures.push(...v.errors.map((e) => `schema: ${e}`));

  mkdirSync(dirs.resultsDir, { recursive: true });
  writeFileSync(
    join(dirs.resultsDir, `${caseId}-${providerId}.json`),
    JSON.stringify({ caseId, provider: providerId, result, ...outcome, runAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );

  if (outcome.ok) {
    console.log(`✅ PASS (${outcome.passes.length} pass${outcome.warnings.length ? `, ⚠ ${outcome.warnings.length}` : ""})`);
  } else {
    console.log("❌ FAIL");
    for (const f of outcome.failures) console.error(`    ✗ ${f}`);
  }
  for (const w of outcome.warnings) console.warn(`    ⚠ ${w}`);
  return outcome;
}

// --compare: 저장된 results/*.json을 읽어 provider 표 출력(호출 없음). evals.md §4.3.
function compareCase(caseId: string, dirs: Dirs = DEFAULT_DIRS): void {
  const cell = (v: string) => v.padEnd(12);
  const rows = PROVIDERS.map((provider) => {
    try {
      const r = JSON.parse(readFileSync(join(dirs.resultsDir, `${caseId}-${provider}.json`), "utf-8")) as CaseOutcome & {
        provider: ProviderId;
      };
      return { provider, ok: r.ok as boolean | null, passes: r.passes.length, warnings: r.warnings.length, failures: r.failures };
    } catch {
      return { provider, ok: null as boolean | null, passes: 0, warnings: 0, failures: ["결과 없음 (먼저 --all 실행)"] };
    }
  });
  const mark = (ok: boolean | null) => (ok === null ? "❓" : ok ? "✅" : "❌");

  console.log(`\n=== 비교: ${caseId} ===`);
  console.log(cell("") + rows.map((r) => cell(r.provider)).join(""));
  console.log(cell("ok") + rows.map((r) => cell(mark(r.ok))).join(""));
  console.log(cell("passes") + rows.map((r) => cell(String(r.passes))).join(""));
  console.log(cell("warnings") + rows.map((r) => cell(String(r.warnings))).join(""));
  for (const r of rows) {
    if (r.failures.length) {
      console.log(`\n[${r.provider}] 실패:`);
      for (const f of r.failures) console.log(`  ✗ ${f}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  if (has("--compare")) {
    const caseId = get("--compare");
    if (!caseId) return fail("--compare <caseId> 필요");
    compareCase(caseId);
    return;
  }

  const provider = (get("--provider") ?? "gemini") as ProviderId;
  const allProviders = has("--all-providers");
  if (!allProviders && !PROVIDERS.includes(provider)) return fail(`알 수 없는 provider: ${provider}. ${PROVIDERS.join(" | ")}`);

  let caseIds: string[];
  if (has("--all")) {
    caseIds = readdirSync(DEFAULT_DIRS.fixturesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } else if (has("--case")) {
    const id = get("--case");
    if (!id) return fail("--case <caseId> 필요");
    caseIds = [id];
  } else {
    return fail("사용법: --case <id> | --all [--provider <id> | --all-providers] | --compare <id>");
  }

  const providers = allProviders ? PROVIDERS : [provider];
  console.log(`\n=== Eval Runner ===\nprovider: ${providers.join(", ")} | cases: ${caseIds.length}\n`);

  let pass = 0;
  let failed = 0;
  for (const p of providers) {
    for (const caseId of caseIds) {
      const outcome = await runCase(caseId, p);
      outcome.ok ? pass++ : failed++;
    }
  }
  console.log(`\n결과: ✅ ${pass} 통과 / ❌ ${failed} 실패`);
  if (failed > 0) process.exit(1);
}

function fail(msg: string): void {
  console.error(msg);
  process.exit(1);
}

// tsx 직접 실행 시에만 main() — import(테스트) 시에는 실행 안 함.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("예기치 않은 오류:", e);
    process.exit(1);
  });
}
