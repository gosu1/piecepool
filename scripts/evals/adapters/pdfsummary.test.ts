// pdfsummary 어댑터 지표 단위 테스트. 실제 API 호출은 하지 않는다 — runPdfSummary 를 mock 한다.
// 여기의 mock 출력들이 README `## 적대적 검증` 표의 실측 근거다. 표의 숫자를 바꾸려면 이 테스트부터 바꾼다.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../../src/llm/pdfsummary", () => ({ runPdfSummary: vi.fn() }));
vi.mock("../judge", () => ({ judgeJson: vi.fn() }));

import { runPdfSummary } from "../../../src/llm/pdfsummary";
import { judgeJson } from "../judge";
import adapter, { calloutStats } from "./pdfsummary";

// 실제 baseline 실행(results/latest.json)의 기록된 출력으로 지표를 되돌려 검증한다.
// 러너가 기록한 calloutSections/calloutCompliant 가 지금 코드로 다시 계산해도 같아야 한다 —
// 여기가 깨지면 README 의 실측치와 코드가 갈라진 것이다.
const baseline: { samples: { fixture: { id: string }; out?: { markdown: string; calloutSections: number; calloutCompliant: number } }[] } =
  JSON.parse(readFileSync(join(process.cwd(), "docs/30-llm/evals/pdfsummary/results/latest.json"), "utf-8"));

const SECTION = "## 1. 목표(Objectives)\n- CPU 이용률을 높인다.\n";
const GOOD_CALLOUT =
  "> [!easy] 쉬운 설명\n> **한마디로:** CPU가 쉬지 않게 하는 것이다.\n>\n> #### 핵심\n> - **이용률:** 노는 시간을 줄인다.\n";

describe("calloutStats", () => {
  it("baseline 실행에 기록된 콜아웃 수치를 그대로 재현한다", () => {
    const outs = baseline.samples.filter((s) => s.out);
    expect(outs.length).toBeGreaterThan(0);
    for (const s of outs) {
      expect({ id: s.fixture.id, ...calloutStats(s.out!.markdown) }).toEqual({
        id: s.fixture.id,
        sections: s.out!.calloutSections,
        compliant: s.out!.calloutCompliant,
      });
    }
  });

  it("콜아웃이 아예 없는 섹션은 비준수", () => {
    expect(calloutStats(SECTION)).toEqual({ sections: 1, compliant: 0 });
  });

  it("[!easy] 헤더만 있고 내용 줄이 없으면 비준수 — 헤더만 찍는 우회 차단", () => {
    expect(calloutStats(`${SECTION}> [!easy] 쉬운 설명\n`)).toEqual({ sections: 1, compliant: 0 });
  });

  it("콜아웃 도중 인용 접두사가 끊기면 비준수", () => {
    const broken = `${SECTION}> [!easy] 쉬운 설명\n> **한마디로:** 짧게 설명한다.\n설명이 인용 밖으로 흘렀다.\n`;
    expect(calloutStats(broken)).toEqual({ sections: 1, compliant: 0 });
  });

  it("접두사에 공백이 없으면(`>내용`) 비준수", () => {
    const noSpace = `${SECTION}> [!easy] 쉬운 설명\n>한마디로 이렇게 된다.\n`;
    expect(calloutStats(noSpace)).toEqual({ sections: 1, compliant: 0 });
  });

  it("빈 인용 줄(`>`)과 콜아웃 뒤 빈 줄은 허용한다 — 실제 출력의 정상 형태", () => {
    expect(calloutStats(`${SECTION}${GOOD_CALLOUT}\n\n`)).toEqual({ sections: 1, compliant: 1 });
  });

  it("섹션마다 따로 센다 — 하나만 지키면 0.5", () => {
    const md = `# 요약\n\n${SECTION}${GOOD_CALLOUT}\n${SECTION}`;
    expect(calloutStats(md)).toEqual({ sections: 2, compliant: 1 });
  });

  it("`##` 섹션이 없으면 sections 0 — 분모가 없다(지표는 NaN 이 된다)", () => {
    expect(calloutStats("# 요약\n본문만 있다.\n")).toEqual({ sections: 0, compliant: 0 });
  });

  it("`###` 는 `##` 섹션으로 세지 않고 콜아웃 안의 `> ####` 도 헤딩으로 보지 않는다", () => {
    const md = `${SECTION}### 하위 제목\n${GOOD_CALLOUT}`;
    expect(calloutStats(md)).toEqual({ sections: 1, compliant: 0 }); // `###` 이 섹션을 닫아 콜아웃이 밖으로 나갔다
    expect(calloutStats(`${SECTION}${GOOD_CALLOUT}`)).toEqual({ sections: 1, compliant: 1 });
  });
});

// ── 어댑터 run/metrics ──────────────────────────────────────
type Fx = Parameters<typeof adapter.run>[0];
type O = Awaited<ReturnType<typeof adapter.run>>;

const fixture = (over: Partial<Fx> = {}): Fx => ({
  id: "mock",
  input: { sourceTitle: "T", sourceText: "source" },
  expectSections: ["Objectives"],
  expectTerms: ["FCFS"],
  absentFacts: ["교착상태"],
  expectFormula: "T_turnaround",
  whyHard: "mock",
  ...over,
});

const ctx = { dry: true, apiKey: "k" };
const mocked = vi.mocked(runPdfSummary);
const mockedJudge = vi.mocked(judgeJson);

beforeEach(() => {
  mocked.mockReset();
  mockedJudge.mockReset();
});

function mockOutput(markdown: string, truncated = false, deltas = 2): void {
  mocked.mockImplementation(async (_input, _key, opts) => {
    for (let i = 0; i < deltas; i++) opts?.onDelta?.(markdown);
    return { markdown, truncated };
  });
}

describe("run", () => {
  it("ttftMs·totalMs 를 기록한다 — 첫 delta 이후 완료라 ttft ≤ total", async () => {
    mockOutput(`${SECTION}${GOOD_CALLOUT}`);
    const out = await adapter.run(fixture(), ctx);
    expect(Number.isFinite(out.ttftMs)).toBe(true);
    expect(Number.isFinite(out.totalMs)).toBe(true);
    expect(out.ttftMs).toBeLessThanOrEqual(out.totalMs);
  });

  it("delta 가 하나도 오지 않으면 ttftMs 는 NaN — 0 으로 위장하지 않는다", async () => {
    mockOutput(`${SECTION}${GOOD_CALLOUT}`, false, 0);
    const out = await adapter.run(fixture(), ctx);
    expect(Number.isNaN(out.ttftMs)).toBe(true);
  });

  it("expectTruncated 와 실제가 같으면 불일치가 아니다", async () => {
    mockOutput(SECTION, true);
    const out = await adapter.run(fixture({ expectTruncated: true }), ctx);
    expect(out.truncated).toBe(true);
    expect(out.truncationMismatch).toBe(false);
  });

  it("expectTruncated 없는 fixture 가 잘리면 불일치다", async () => {
    mockOutput(SECTION, true);
    expect((await adapter.run(fixture(), ctx)).truncationMismatch).toBe(true);
  });

  it("expectTruncated:true 인데 안 잘려도 불일치다 — 상한 계산이 깨진 것", async () => {
    mockOutput(SECTION, false);
    expect((await adapter.run(fixture({ expectTruncated: true }), ctx)).truncationMismatch).toBe(true);
  });
});

describe("metrics", () => {
  const sample = (fx: Fx, out: O) => ({ fixture: fx, out });

  async function metricsOf(md: string, over: Partial<Fx> = {}, truncated = false) {
    mockOutput(md, truncated);
    const fx = fixture(over);
    const out = await adapter.run(fx, ctx);
    return adapter.metrics([sample(fx, out)], ctx);
  }

  it("calloutCompliance 는 섹션 준수 비율이다", async () => {
    expect((await metricsOf(`${SECTION}${GOOD_CALLOUT}`)).calloutCompliance).toBe(1);
    expect((await metricsOf(`${SECTION}${GOOD_CALLOUT}${SECTION}`)).calloutCompliance).toBe(0.5);
    expect((await metricsOf(SECTION)).calloutCompliance).toBe(0);
  });

  it("`##` 섹션이 없으면 calloutCompliance 는 NaN — 코어 규약상 게이트 실패다", async () => {
    const m = await metricsOf("# 요약\n본문뿐이다.\n");
    expect(Number.isNaN(m.calloutCompliance)).toBe(true);
  });

  it("unexpectedTruncation 은 예상과 다른 잘림만 센다", async () => {
    expect((await metricsOf(SECTION, { expectTruncated: true }, true)).unexpectedTruncation).toBe(0);
    expect((await metricsOf(SECTION, {}, true)).unexpectedTruncation).toBe(1);
    expect((await metricsOf(SECTION, { expectTruncated: true }, false)).unexpectedTruncation).toBe(1);
    expect((await metricsOf(SECTION, {}, false)).unexpectedTruncation).toBe(0);
  });

  it("ttftMsMax·totalMsMax 를 집계한다", async () => {
    const m = await metricsOf(`${SECTION}${GOOD_CALLOUT}`);
    expect(Number.isFinite(m.ttftMsMax)).toBe(true);
    expect(m.totalMsMax).toBeGreaterThanOrEqual(m.ttftMsMax);
  });
});

// 케이스별 judge 판정 기록(PIE-59). 집계 수치(hallucination/judgeFail)만으로는 어떤 fixture 의
// 어떤 문장이 걸렸는지 run JSON 에서 확인할 수 없었다 — 이제 samples[].judge 에 남는다.
describe("metrics — 케이스별 judge 기록", () => {
  const wetCtx = { dry: false, apiKey: "k" };

  async function runOne(): Promise<{ fixture: Fx; out: O; judge?: { verdict?: unknown; error?: string } }> {
    mockOutput(`${SECTION}${GOOD_CALLOUT}`);
    const fx = fixture();
    return { fixture: fx, out: await adapter.run(fx, wetCtx) };
  }

  it("환각 판정을 근거 문장째로 남긴다", async () => {
    const verdict = { hallucination: true, hallucinationEvidence: "원문에 없는 문장이다." };
    mockedJudge.mockResolvedValue(verdict);
    const samples = [await runOne()];
    const m = await adapter.metrics(samples, wetCtx);
    expect(samples[0].judge).toEqual({ verdict });
    expect(m.hallucination).toBe(1);
    expect(m.judgeFail).toBe(0);
  });

  it("환각이 없어도 판정을 남긴다 — '깨끗했다' 와 '판정이 없었다' 는 다른 사실이다", async () => {
    const verdict = { hallucination: false, hallucinationEvidence: "" };
    mockedJudge.mockResolvedValue(verdict);
    const samples = [await runOne()];
    const m = await adapter.metrics(samples, wetCtx);
    expect(samples[0].judge).toEqual({ verdict });
    expect(m.hallucination).toBe(0);
  });

  it("판정 실패는 사유 문자열로 남긴다 — 한도 소진인지 즉시 거절인지 여기서 읽는다", async () => {
    mockedJudge.mockRejectedValue(new Error("judge: HTTP 503 (3회 시도 소진)"));
    const samples = [await runOne()];
    const m = await adapter.metrics(samples, wetCtx);
    expect(samples[0].judge?.error).toBe("judge: HTTP 503 (3회 시도 소진)");
    expect(samples[0].judge?.verdict).toBeUndefined();
    expect(m.judgeFail).toBe(1);
    expect(m.hallucination).toBe(0);
  });

  it("심판 모델 축을 그대로 넘긴다 — subject(ctx.model)를 넘기면 비교가 성립하지 않는다", async () => {
    mockedJudge.mockResolvedValue({ hallucination: false, hallucinationEvidence: "" });
    const samples = [await runOne()];
    await adapter.metrics(samples, { ...wetCtx, model: "subject-model", judgeModel: "judge-model" });
    expect(mockedJudge.mock.calls[0][4]).toBe("judge-model");
  });

  it("dry 에서는 judge 필드가 아예 생기지 않는다 — 심판을 안 불렀으니 빈 판정도 없다", async () => {
    const samples = [await runOne()];
    await adapter.metrics(samples, ctx);
    expect(samples[0].judge).toBeUndefined();
    expect(mockedJudge).not.toHaveBeenCalled();
  });
});

// 적대적 검증: 지표를 만들지 않은 사람이 합격선 표만 보고 설계한 "전 게이트 통과 + 쓸모없는 출력".
describe("적대적 검증 — 콜아웃 우회", () => {
  it("섹션 하나만 만들고 거기에만 콜아웃을 달면 calloutCompliance 는 1.0 이지만 sectionRecall 이 잡는다", async () => {
    mockOutput(`${SECTION}${GOOD_CALLOUT}`);
    const fx = fixture({ expectSections: ["Objectives", "Algorithms", "Formula"] });
    const out = await adapter.run(fx, ctx);
    const m = await adapter.metrics([{ fixture: fx, out }], ctx);
    expect(m.calloutCompliance).toBe(1);
    expect(m.sectionRecall).toBeCloseTo(1 / 3, 5);
  });
});
