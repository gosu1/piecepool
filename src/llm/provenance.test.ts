import { describe, it, expect } from "vitest";
import { buildProvenance, mergeBySources, tierFromSourceType, aggregateProvenance, type SourceMeta } from "./provenance";

const reg = (metas: SourceMeta[]) => new Map(metas.map((m) => [m.sourceId, m]));

describe("buildProvenance — tier + noisy-OR 신뢰도", () => {
  it("단일 1차 → score 0.9", () => {
    const p = buildProvenance(["a"], reg([{ sourceId: "a", tier: "primary" }]));
    expect(p.score).toBeCloseTo(0.9);
    expect(p.primaryCount).toBe(1);
    expect(p.secondaryCount).toBe(0);
  });

  it("2차 두 개 → corroboration으로 0.75", () => {
    const p = buildProvenance(["a", "b"], reg([{ sourceId: "a", tier: "secondary" }, { sourceId: "b", tier: "secondary" }]));
    expect(p.score).toBeCloseTo(0.75); // 1 - 0.5*0.5
  });

  it("1차+2차 → 0.95", () => {
    const p = buildProvenance(["a", "b"], reg([{ sourceId: "a", tier: "primary" }, { sourceId: "b", tier: "secondary" }]));
    expect(p.score).toBeCloseTo(0.95); // 1 - 0.1*0.5
  });

  it("중복 sourceId는 한 번만 집계", () => {
    const p = buildProvenance(["a", "a"], reg([{ sourceId: "a", tier: "primary" }]));
    expect(p.sources).toHaveLength(1);
    expect(p.score).toBeCloseTo(0.9);
  });

  it("미등록 sourceId는 2차 기본으로 간주", () => {
    const p = buildProvenance(["ghost"], reg([]));
    expect(p.sources[0].tier).toBe("secondary");
    expect(p.score).toBeCloseTo(0.5);
  });

  it("개별 trust override 사용", () => {
    const p = buildProvenance(["a"], reg([{ sourceId: "a", tier: "primary", trust: 0.3 }]));
    expect(p.score).toBeCloseTo(0.3);
  });

  it("출처가 늘수록 score는 단조 비감소", () => {
    const r = reg([{ sourceId: "a", tier: "secondary" }, { sourceId: "b", tier: "secondary" }, { sourceId: "c", tier: "secondary" }]);
    const s1 = buildProvenance(["a"], r).score;
    const s2 = buildProvenance(["a", "b"], r).score;
    const s3 = buildProvenance(["a", "b", "c"], r).score;
    expect(s2).toBeGreaterThanOrEqual(s1);
    expect(s3).toBeGreaterThanOrEqual(s2);
  });
});

describe("mergeBySources — 같은 개념 다출처 병합", () => {
  it("normalizedTitle 일치 개념을 병합하고 출처 union + provenance 재계산", () => {
    const registry = reg([{ sourceId: "pdf", tier: "primary" }, { sourceId: "img", tier: "primary" }]);
    const merged = mergeBySources(
      [
        { title: "Self-Attention", normalizedTitle: "self-attention", sourceIds: ["pdf"] },
        { title: "Self-Attention", normalizedTitle: "self-attention", sourceIds: ["img"] },
      ],
      registry,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].sourceIds.sort()).toEqual(["img", "pdf"]);
    expect(merged[0].provenance.primaryCount).toBe(2);
    expect(merged[0].provenance.score).toBeCloseTo(0.99); // 1 - 0.1*0.1
  });

  it("서로 다른 개념은 분리 유지", () => {
    const merged = mergeBySources(
      [
        { title: "A", normalizedTitle: "a", sourceIds: ["x"] },
        { title: "B", normalizedTitle: "b", sourceIds: ["y"] },
      ],
      reg([]),
    );
    expect(merged).toHaveLength(2);
  });
});

describe("aggregateProvenance — 병합 개념 집계(라이브 연결용)", () => {
  it("2개 이상 출처로 뒷받침된 개념 수(multiSource)와 평균 score", () => {
    const r = aggregateProvenance([["a", "b"], ["c"], ["d", "e", "f"]]);
    expect(r.count).toBe(3);
    expect(r.multiSource).toBe(2); // 첫째(2개)·셋째(3개)
    expect(r.avgScore).toBeGreaterThan(0);
  });

  it("registry로 tier 반영 시 score 상승", () => {
    const noReg = aggregateProvenance([["a", "b"]]);
    const withReg = aggregateProvenance([["a", "b"]], new Map([["a", { sourceId: "a", tier: "primary" }], ["b", { sourceId: "b", tier: "primary" }]]));
    expect(withReg.avgScore).toBeGreaterThan(noReg.avgScore);
  });

  it("빈 입력은 0", () => {
    expect(aggregateProvenance([])).toEqual({ count: 0, multiSource: 0, avgScore: 0 });
  });
});

describe("tierFromSourceType", () => {
  it("원본(pdf/image)=1차, 텍스트/요약=2차", () => {
    expect(tierFromSourceType("pdf")).toBe("primary");
    expect(tierFromSourceType("image")).toBe("primary");
    expect(tierFromSourceType("text")).toBe("secondary");
    expect(tierFromSourceType("summary_text")).toBe("secondary");
  });
});
