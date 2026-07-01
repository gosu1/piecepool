// [D] 출처 병합·provenance 미리보기 — 같은 개념의 다출처 병합 + 1차/2차 + 신뢰도 점수.
// 실행(tsx, devDep):
//   npm run provenance                              # 내장 데모
//   npm run provenance -- --scenario path/to/prov.json
//
// scenario JSON: { "sources": [{sourceId,tier,trust?}], "concepts": [{title,normalizedTitle,sourceIds}] }
// 코어: src/llm/provenance.ts. SSOT 설계: docs/30-llm/README.md §D.

import { readFileSync } from "node:fs";
import { mergeBySources, type SourceMeta, type ConceptSourcing } from "../src/llm/provenance";

type Scenario = { sources: SourceMeta[]; concepts: ConceptSourcing[] };

function main(): void {
  const args = process.argv.slice(2);
  const i = args.indexOf("--scenario");
  const scenario: Scenario = i !== -1 ? (JSON.parse(readFileSync(args[i + 1], "utf-8")) as Scenario) : DEMO;

  const registry = new Map(scenario.sources.map((s) => [s.sourceId, s]));
  const merged = mergeBySources(scenario.concepts, registry);

  console.log(`\n=== Provenance Merge Preview ===`);
  console.log(`출처 ${scenario.sources.length}개 | 개념 추출 ${scenario.concepts.length}건 → 병합 ${merged.length}개\n`);
  for (const m of merged.sort((a, b) => b.provenance.score - a.provenance.score)) {
    const p = m.provenance;
    const srcStr = p.sources.map((s) => `${s.sourceId}(${s.tier === "primary" ? "1차" : "2차"}·${s.trust.toFixed(2)})`).join(", ");
    console.log(`  ${m.title}`);
    console.log(`    신뢰도 ${p.score.toFixed(3)} | 1차 ${p.primaryCount} · 2차 ${p.secondaryCount}`);
    console.log(`    출처: ${srcStr}`);
  }
  console.log(`\n해석: 여러 독립 출처가 뒷받침할수록(특히 1차) score↑(noisy-OR). 단일 2차는 낮음.\n`);
}

// 내장 데모 — 다출처 병합이 신뢰도를 올리는 걸 결정적으로 보여준다.
const DEMO: Scenario = {
  sources: [
    { sourceId: "pdf-lecture", tier: "primary" },
    { sourceId: "textbook-img", tier: "primary" },
    { sourceId: "note-a", tier: "secondary" },
    { sourceId: "note-b", tier: "secondary" },
  ],
  concepts: [
    { title: "Self-Attention", normalizedTitle: "self-attention", sourceIds: ["pdf-lecture"] },
    { title: "Self-Attention", normalizedTitle: "self-attention", sourceIds: ["textbook-img"] }, // 같은 개념, 다른 1차 출처 → 병합
    { title: "Gradient", normalizedTitle: "gradient", sourceIds: ["note-a", "note-b"] }, // 2차 두 개
    { title: "Transformer", normalizedTitle: "transformer", sourceIds: ["pdf-lecture", "note-a"] }, // 1차+2차
  ],
};

main();
