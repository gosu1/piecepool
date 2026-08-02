// mergeWiki eval — 최악의 결함은 기존 위키 내용 삭제다.
// docs/10-contracts 의 archive 불변 원칙과 같은 정신: LLM 출력이 사용자 자산을 덮으면 안 된다.
// 유실·중복 헤딩은 전부 코드로 잡힌다 — judge 가 필요 없다.
// 실제 시그니처: runWikiMerge(existingMarkdown, concept, source, apiKey, opts?) → Promise<string>
// (src/llm/mergeWiki.ts). fixture 의 incoming 은 마크다운이 아니라 LlmConcept 다.
import { join } from "node:path";
import { runWikiMerge, type MergeSource } from "../../../src/llm/mergeWiki";
import type { LlmConcept } from "../../../src/llm/provider";
import type { EvalAdapter, Metrics, Sample } from "../core";

type Fixture = {
  id: string;
  existing: string;
  incoming: LlmConcept;
  source: MergeSource;
  mustKeepLines: string[];
  mustAddTerms: string[];
  expectHeadings: string[];
  whyHard: string;
};

type Out = {
  merged: string;
  lostLines: string[];
  duplicateHeadings: string[];
  missingHeadings: string[];
  missingNewTerms: string[];
};

function headings(md: string): string[] {
  return [...md.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim());
}

const adapter: EvalAdapter<Fixture, Out> = {
  id: "mergeWiki",
  fixturesDir: join(process.cwd(), "docs/30-llm/evals/mergeWiki/fixtures"),
  needsApiKey: true,

  async run(fx, ctx) {
    // 모델·엔드포인트 축(undefined 면 runWikiMerge 의 기본값 그대로).
    const md = await runWikiMerge(fx.existing, fx.incoming, fx.source, ctx.apiKey, {
      endpoint: ctx.baseUrl,
      model: ctx.model,
    });
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
      // 유실만 보면 "기존 본문을 그대로 돌려주는" 무연산 병합이 만점을 받는다(적대적 검증에서 실증).
      // 병합은 축적이므로 새 노트 쪽 내용도 들어와야 한다.
      missingNewTerms: (fx.mustAddTerms ?? []).filter((t) => !md.includes(t)),
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
      newContentMissing: outs.reduce((a, s) => a + s.out!.missingNewTerms.length, 0),
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "lostLines", op: "<=", threshold: 0, label: "기존 내용 삭제 0건" },
    { metric: "duplicateHeadings", op: "<=", threshold: 0, label: "중복 헤딩 0건" },
    { metric: "missingHeadings", op: "<=", threshold: 0, label: "기대 헤딩 누락 0건 (잠정)" },
    { metric: "newContentMissing", op: "<=", threshold: 0, label: "새 내용 누락 0건 (잠정)" },
  ],
};

export default adapter;
