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
