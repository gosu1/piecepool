// generate eval — 기존 scripts/eval.ts 의 골든 케이스와 채점 로직(assertCase)을 그대로 재사용하고,
// 케이스별 pass/fail 위에 집계 지표와 게이트를 얹는다. eval.ts 의 동작은 바꾸지 않는다.
// fixtures/expected 위치도 기존 그대로다 — docs/30-llm/evals/{fixtures,expected}.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertCase } from "../../eval";
import { GeminiProvider, type GeminiProviderConfig } from "../../../src/llm/gemini";
import type { LlmWikiInput, LlmWikiResult } from "../../../src/llm/index";
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
  thinConcepts: number;
};

// 스키마의 explanation 은 minLength 1 이라 마침표 한 글자도 유효하다. 제목만 맞추고 본문을
// 비운 응답이 must·schema·should 를 전부 통과한 적이 있다(적대적 검증) — 위키 본문이 텅 빈다.
const MIN_EXPLANATION_CHARS = 50;

// expected 는 fixture 와 같은 id 로 별도 디렉토리에 있다(기존 관례).
function loadExpected(id: string) {
  return JSON.parse(readFileSync(join(EVALS, "expected", `${id}.expected.json`), "utf-8"));
}

const adapter: EvalAdapter<Fixture, Out> = {
  id: "generate",
  fixturesDir: join(EVALS, "fixtures"),
  needsApiKey: true,

  async run(fx, ctx) {
    // selectProvider("gemini") 는 `new GeminiProvider()` 와 같고 설정을 주입할 통로가 없다.
    // 여기서 하는 것은 로직 재구현이 아니라 **같은 GeminiProvider 클래스에 설정만 주입**하는 것이다
    // — 프로바이더 동작(재시도·검증·정규화)은 앱과 완전히 동일하다.
    // 주어진 필드만 넣는다: undefined 를 넣으면 envConfig() 기본값을 덮어써 죽는다.
    const config: Partial<GeminiProviderConfig> = {};
    if (ctx.model) config.model = ctx.model;
    if (ctx.baseUrl) config.endpoint = ctx.baseUrl;
    const provider = new GeminiProvider({ config });
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
      thinConcepts: result.concepts.filter((c) => (c.explanation ?? "").trim().length < MIN_EXPLANATION_CHARS).length,
    };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    const outs = samples.map((s) => s.out).filter((o): o is Out => !!o);
    const lat = samples.map((s) => s.latencyMs ?? 0).sort((a, b) => a - b);
    const shouldTotal = outs.reduce((a, o) => a + o.shouldTotal, 0);
    // assertCase 의 warnings 에는 should 미충족 외에 `related_to 비율 >50%` 경고도 섞여 들어온다
    // (scripts/eval.ts — 이번에도 수정하지 않는 파일). 전부 미충족으로 빼면 충족률이 실제보다
    // 낮게, 케이스에 따라 음수까지 내려간다. should 미충족 경고만 `should.` 접두사로 골라 센다.
    const shouldMissed = outs.reduce((a, o) => a + o.warnings.filter((w) => w.startsWith("should.")).length, 0);
    const shouldMet = shouldTotal - shouldMissed;
    return {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      mustFail: outs.filter((o) => !o.ok).length,
      schemaInvalid: outs.filter((o) => !o.schemaValid).length,
      relatedToRatioMax: outs.length ? Math.max(...outs.map((o) => o.relatedToRatio)) : 0,
      shouldMetRatio: shouldTotal ? shouldMet / shouldTotal : NaN,
      thinConcepts: outs.reduce((a, o) => a + o.thinConcepts, 0),
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
    { metric: "thinConcepts", op: "<=", threshold: 0, label: `설명 ${MIN_EXPLANATION_CHARS}자 미만 개념 0건 (잠정)` },
  ],
};

export default adapter;
