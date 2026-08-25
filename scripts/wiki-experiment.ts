// 위키백과 순차 투입 실험 — 앱 실동작(importStore.buildInput → llmApply.applyLlmResult)을 CLI로 재현한다.
// 목적: 위키백과 편집자가 이미 판정해둔 "무엇이 독립 문서인가"를 정답지로 삼아 개념 추출을 채점한다.
//
// 실행:
//   npm run wiki-exp -- --dir <수집디렉토리>          # ground-truth.json + input/*.md 가 있는 곳
//
// 앱과 다른 점은 하나뿐 — promote() 에 round 를 실제로 증가시켜 넘긴다.
// 앱은 generate.ts:148 에서 { round: 0 } 고정이라 시간이 흐르지 않는다(ARCHIVED 도달 불가).
// 코어 게이트: src/llm/promote.ts. 병합 규칙: src/lib/llmApply.ts.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { selectProvider } from "../src/llm/index";
import { normalizeTitle } from "../src/lib/llmApply";
import { mergeDuplicateConcepts } from "../src/llm/dedupConcepts";
import { promote, type CandidateNode, type NodeState, type PromoteEdge } from "../src/llm/promote";
import type { LlmWikiResult } from "../src/llm/provider";

type GroundTruth = {
  order: number;
  file: string;
  title: string;
  bodyLinks: string[];
  redirects: string[];
};

// 앱의 WikiPage 중 실험이 보는 부분만 — 병합 여부와 sourceIds 누적.
type Page = { conceptId: string; title: string; norm: string; sourceIds: string[]; firstRound: number };

function argDir(): string {
  const i = process.argv.indexOf("--dir");
  if (i < 0 || !process.argv[i + 1]) throw new Error("--dir <수집디렉토리> 필요");
  return process.argv[i + 1];
}

async function main() {
  const dir = argDir();
  const gt = JSON.parse(readFileSync(join(dir, "ground-truth.json"), "utf-8")) as GroundTruth[];
  const provider = selectProvider("gemini");

  const pages = new Map<string, Page>(); // norm → Page
  const edges: PromoteEdge[] = []; // 라운드를 넘어 누적
  const carried = new Map<string, { state: NodeState; stagingSinceRound?: number }>();
  const rounds: unknown[] = [];
  mkdirSync(join(dir, "out"), { recursive: true });

  for (const doc of gt) {
    const round = doc.order - 1;
    const sourceId = `src-${doc.order}`;
    // 무료 티어 TPM(분당 토큰) 창을 라운드마다 새로 받는다 — 문서 5는 단독으로 10만 토큰이 넘는다.
    if (round > 0) await new Promise((r) => setTimeout(r, 65_000));
    const text = readFileSync(join(dir, "input", doc.file), "utf-8");

    // buildInput 재현 — 지금까지 만들어진 개념 전부를 힌트로 넘긴다(교차 문서 dedup의 전제).
    const existingConcepts = [...pages.values()].map((p) => ({
      id: p.conceptId,
      title: p.title,
      normalizedTitle: p.norm,
    }));

    process.stdout.write(`[R${round}] ${doc.title} (${text.length}자, existing ${existingConcepts.length}) ... `);
    const t0 = Date.now();
    let result: LlmWikiResult;
    try {
      // buildInput 과 같은 모양으로 넘긴다 — features 키는 앱이 넣지 않는다.
      // 입력은 JSON.stringify 되어 그대로 프롬프트에 실리므로 키 하나가 프롬프트를 바꾼다.
      // subjects/sourceFiles 는 위키백과 .md 에 subject 도 ![[임베드]] 도 없어 앱에서도 빈 값이다.
      result = await provider.generateWikiStructured({
        sourceTitle: doc.title,
        sourceText: text,
        sourceFiles: [],
        subjects: [],
        existingConcepts,
      });
    } catch (e) {
      console.log(`ERROR ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    const ms = Date.now() - t0;

    // llmApply 재현 — 먼저 응답 안의 동일 개념을 결합하고(applyLlmResult 첫 단계),
    // 그 다음 normalizeTitle 이 기존 페이지와 일치하면 병합하며 sourceIds 를 누적한다.
    const concepts = mergeDuplicateConcepts(result.concepts);
    let merged = 0;
    const newTitles: string[] = [];
    for (const c of concepts) {
      const norm = normalizeTitle(c.title);
      const ex = pages.get(norm);
      if (ex) {
        merged++;
        if (!ex.sourceIds.includes(sourceId)) ex.sourceIds.push(sourceId);
      } else {
        pages.set(norm, {
          conceptId: `concept-${norm}`,
          title: c.title,
          norm,
          sourceIds: [sourceId],
          firstRound: round,
        });
        newTitles.push(c.title);
      }
    }
    for (const r of result.relations) {
      edges.push({
        source: `concept-${normalizeTitle(r.sourceConceptTitle)}`,
        target: `concept-${normalizeTitle(r.targetConceptTitle)}`,
      });
    }

    // promote — 상태 이월 + 엣지 누적 + round 실제 증가.
    const nodes: CandidateNode[] = [...pages.values()].map((p) => ({
      id: p.conceptId,
      state: carried.get(p.conceptId)?.state,
      stagingSinceRound: carried.get(p.conceptId)?.stagingSinceRound,
    }));
    const pr = promote(nodes, edges, { round });
    for (const n of pr.nodes) carried.set(n.id, { state: n.state, stagingSinceRound: n.stagingSinceRound });

    const relatedTo = result.relations.filter((r) => r.relationType === "related_to").length;
    console.log(
      `개념 ${concepts.length} (신규 ${newTitles.length} / 병합 ${merged}), 관계 ${result.relations.length}, ${(ms / 1000).toFixed(1)}s`,
    );
    console.log(
      `      active ${pr.stats.active} / staging ${pr.stats.staging} / archived ${pr.stats.archived}` +
        (pr.transitions.length ? `  전이 ${pr.transitions.length}건` : ""),
    );

    rounds.push({
      round,
      doc: doc.title,
      sourceId,
      latencyMs: ms,
      inputChars: text.length,
      existingConceptsIn: existingConcepts.length,
      concepts: concepts.map((c) => c.title),
      newTitles,
      merged,
      relations: result.relations.map((r) => [r.sourceConceptTitle, r.relationType, r.targetConceptTitle]),
      relatedToRatio: result.relations.length ? relatedTo / result.relations.length : 0,
      promote: {
        stats: pr.stats,
        transitions: pr.transitions,
        degrees: pr.nodes.map((n) => [n.id, n.degree, n.state]),
      },
      pagesSnapshot: [...pages.values()].map((p) => ({
        title: p.title,
        sourceIds: [...p.sourceIds],
        firstRound: p.firstRound,
      })),
      raw: result,
    });
    writeFileSync(join(dir, "out/rounds.json"), JSON.stringify(rounds, null, 2));
  }

  const all = [...pages.values()];
  const multi = all.filter((p) => p.sourceIds.length > 1).sort((a, b) => b.sourceIds.length - a.sourceIds.length);
  console.log(`\n총 개념 ${all.length}장 · sourceIds 2개 이상 ${multi.length}장`);
  if (multi.length) console.log("  " + multi.map((p) => `${p.title}(${p.sourceIds.length})`).join(", "));
}

main();
