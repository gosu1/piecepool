import { describe, expect, it } from "vitest";
import {
  buildReportData,
  labelColumns,
  mulberry32,
  renderReportHtml,
  shuffleWithRng,
  type ProbeResult,
  type RawOutput,
} from "./model-ab-report";

function rawOut(model: string, caseId = "case-x", over: Partial<RawOutput> = {}): RawOutput {
  return {
    task: "pdfsummary",
    caseId,
    caseTitle: "제목",
    inputPreview: "원문 미리보기",
    model,
    ok: true,
    latencyMs: 100,
    summaryMarkdown: "# 요약",
    ...over,
  };
}

describe("mulberry32 + shuffleWithRng", () => {
  it("같은 시드는 같은 순서를 만든다", () => {
    const a = shuffleWithRng([1, 2, 3, 4, 5], mulberry32(7));
    const b = shuffleWithRng([1, 2, 3, 4, 5], mulberry32(7));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const src = [1, 2, 3];
    shuffleWithRng(src, mulberry32(1));
    expect(src).toEqual([1, 2, 3]);
  });
});

describe("labelColumns", () => {
  it("셔플 후 A/B 라벨을 붙이고, 케이스 공통 필드는 제거하며, model은 봉인용으로 유지한다", () => {
    const cols = labelColumns([rawOut("m1"), rawOut("m2")], mulberry32(1));
    expect(cols.map((c) => c.label)).toEqual(["A", "B"]);
    expect(cols.map((c) => c.model).sort()).toEqual(["m1", "m2"]);
    expect("caseId" in cols[0]).toBe(false);
    expect("caseTitle" in cols[0]).toBe(false);
  });
});

describe("buildReportData", () => {
  const probe: ProbeResult[] = [
    { model: "m1", alive: true, latencyMs: 50 },
    { model: "m2", alive: true, latencyMs: 60 },
  ];

  it("task+caseId로 그룹핑하고 컬럼 수 = 모델 수", () => {
    const raw = [rawOut("m1", "c1"), rawOut("m2", "c1"), rawOut("m1", "c2"), rawOut("m2", "c2")];
    const d = buildReportData("run1", ["m1", "m2"], probe, raw, mulberry32(1));
    expect(d.cases).toHaveLength(2);
    expect(d.cases[0].columns).toHaveLength(2);
    expect(d.cases.map((c) => c.caseId)).toEqual(["c1", "c2"]); // 입력 등장 순서 유지
  });

  it("stats: 실패 수와 지연 통계(실패 호출 지연 제외)를 집계한다", () => {
    const raw = [
      rawOut("m1", "c1", { latencyMs: 100 }),
      rawOut("m1", "c2", { ok: false, error: "boom", latencyMs: 5 }),
      rawOut("m2", "c1", { latencyMs: 300 }),
      rawOut("m2", "c2", { latencyMs: 200 }),
    ];
    const d = buildReportData("run1", ["m1", "m2"], probe, raw, mulberry32(1));
    const m1 = d.stats.find((s) => s.model === "m1")!;
    expect(m1.calls).toBe(2);
    expect(m1.failures).toBe(1);
    expect(m1.latencyP50).toBe(100);
    const m2 = d.stats.find((s) => s.model === "m2")!;
    expect(m2.failures).toBe(0);
    expect(m2.latencyMax).toBe(300);
  });

  it("호출이 전부 실패한 모델은 지연 통계가 null", () => {
    const raw = [rawOut("m1", "c1", { ok: false, error: "x" })];
    const d = buildReportData("run1", ["m1"], [], raw, mulberry32(1));
    expect(d.stats[0].latencyP50).toBeNull();
    expect(d.stats[0].latencyMax).toBeNull();
  });
});

describe("renderReportHtml", () => {
  it("runId·개봉 버튼을 포함하고, 봉인 데이터가 </script> 로 탈출하지 않는다", () => {
    const raw = [
      rawOut("m1", "c1", { summaryMarkdown: "</script><b>주입</b> $x^2$" }),
      rawOut("m2", "c1"),
    ];
    const d = buildReportData("run-42", ["m1", "m2"], [], raw, mulberry32(1));
    const html = renderReportHtml(d);
    expect(html).toContain("run-42");
    expect(html).toContain("개봉");
    // DATA 직렬화 줄에 닫는 스크립트 태그가 그대로 남으면 안 된다 (< 이스케이프)
    const dataLine = html.split("\n").find((l) => l.includes("const DATA"))!;
    expect(dataLine).not.toContain("</script>");
    expect(dataLine).toContain("\\u003c/script>");
  });

  it("케이스별 컬럼 라벨과 무승부 선택지가 들어간다", () => {
    const raw = [rawOut("m1", "c1"), rawOut("m2", "c1")];
    const d = buildReportData("r", ["m1", "m2"], [], raw, mulberry32(1));
    const html = renderReportHtml(d);
    expect(html).toContain("무승부");
    expect(html).toContain("marked");
    expect(html).toContain("katex");
  });
});
