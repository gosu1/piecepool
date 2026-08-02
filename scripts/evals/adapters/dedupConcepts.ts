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
    let sameOk = 0, sameTotal = 0, diffBad = 0, diffTotal = 0, lostText = 0, lostFields = 0;

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

      // explanation 만 보면 배열 필드가 통째로 사라져도 지표가 꿈쩍 않는다(적대적 검증에서 실증).
      // examples·sourceEmbeds 는 사용자에게 보이는 내용이고, sourceRefs 는 근거 링크다.
      const mergedExamples = new Set(merged.flatMap((m) => m.examples ?? []));
      const mergedEmbeds = new Set(merged.flatMap((m) => m.sourceEmbeds ?? []));
      const refKey = (r: { sourceId: string; file: string; page?: number }) => `${r.sourceId}|${r.file}|${r.page ?? ""}`;
      const mergedRefs = new Set(merged.flatMap((m) => (m.sourceRefs ?? []).map(refKey)));
      for (const c of s.fixture.concepts) {
        for (const e of c.examples ?? []) if (!mergedExamples.has(e)) lostFields++;
        for (const e of c.sourceEmbeds ?? []) if (!mergedEmbeds.has(e)) lostFields++;
        for (const r of c.sourceRefs ?? []) if (!mergedRefs.has(refKey(r))) lostFields++;
      }
    }

    return {
      runFailed: samples.filter((s) => s.error).length,
      falseMerge: diffBad, // 합치면 안 될 쌍을 합침 — 0이어야 한다
      missedMergeRatio: sameTotal ? 1 - sameOk / sameTotal : 0,
      lostText,
      lostFields, // examples·sourceEmbeds·sourceRefs 유실
      pairsChecked: sameTotal + diffTotal,
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "falseMerge", op: "<=", threshold: 0, label: "오병합 0건" },
    { metric: "lostText", op: "<=", threshold: 0, label: "병합 중 본문 유실 0건" },
    { metric: "lostFields", op: "<=", threshold: 0, label: "병합 중 필드 유실 0건 (examples·sourceEmbeds·sourceRefs)" },
    { metric: "missedMergeRatio", op: "<=", threshold: 0.1, label: "미병합 ≤ 10%" },
  ],
};

export default adapter;
