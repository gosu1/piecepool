// synthesize 어댑터 케이스별 judge 판정 기록 테스트(PIE-61). 실제 API 호출은 하지 않는다 —
// runSynthesis 와 judgeJson 을 mock 한다. pdfsummary.test.ts 의 PIE-59 확인 3종과 같은 패턴이다.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/llm/synthesize", () => ({ runSynthesis: vi.fn() }));
vi.mock("../judge", () => ({ judgeJson: vi.fn() }));

import { runSynthesis } from "../../../src/llm/synthesize";
import { judgeJson } from "../judge";
import adapter from "./synthesize";

type Fx = Parameters<typeof adapter.run>[0];
type O = Awaited<ReturnType<typeof adapter.run>>;

const MD = "# 스케줄링 정리\n\n## 목표\nCPU 이용률을 높이고 대기 시간을 줄이는 것이 스케줄링의 목표다.\n";

const fixture = (): Fx => ({
  id: "mock",
  input: { sourceTitle: "스케줄링", sourceText: "CPU 이용률\n대기 시간" },
  keyPoints: ["이용률"],
  absentFacts: ["교착상태"],
  whyHard: "mock",
});

const dryCtx = { dry: true, apiKey: "k" };
const wetCtx = { dry: false, apiKey: "k" };
const mockedRun = vi.mocked(runSynthesis);
const mockedJudge = vi.mocked(judgeJson);

beforeEach(() => {
  mockedRun.mockReset();
  mockedJudge.mockReset();
  mockedRun.mockResolvedValue({ markdown: MD, engine: "gemini" });
});

async function runOne(ctx: {
  dry: boolean;
  apiKey: string;
}): Promise<{ fixture: Fx; out: O; judge?: { verdict?: unknown; error?: string } }> {
  const fx = fixture();
  return { fixture: fx, out: await adapter.run(fx, ctx) };
}

// 케이스별 judge 판정 기록(PIE-61). 집계 수치(hallucination/contradiction/judgeFail)만으로는
// 어떤 fixture 의 어떤 문장이 걸렸는지 run JSON 에서 확인할 수 없었다 — 이제 samples[].judge 에 남는다.
describe("metrics — 케이스별 judge 기록", () => {
  it("판정을 근거 문장째로 남긴다 — 환각+모순 2필드 verdict 를 객체 그대로 담는다", async () => {
    const verdict = {
      hallucination: true,
      hallucinationEvidence: "원문에 없는 문장이다.",
      contradiction: false,
      contradictionEvidence: "",
    };
    mockedJudge.mockResolvedValue(verdict);
    const samples = [await runOne(wetCtx)];
    const m = await adapter.metrics(samples, wetCtx);
    expect(samples[0].judge).toEqual({ verdict });
    // 집계는 기록 배선 전과 같은 값이어야 한다 — PIE-61 은 기록만 추가한다.
    expect(m.hallucination).toBe(1);
    expect(m.contradiction).toBe(0);
    expect(m.judgeFail).toBe(0);
  });

  it("판정 실패는 사유 문자열로 남긴다 — 한도 소진인지 즉시 거절인지 여기서 읽는다", async () => {
    mockedJudge.mockRejectedValue(new Error("judge: HTTP 503 (3회 시도 소진)"));
    const samples = [await runOne(wetCtx)];
    const m = await adapter.metrics(samples, wetCtx);
    expect(samples[0].judge?.error).toBe("judge: HTTP 503 (3회 시도 소진)");
    expect(samples[0].judge?.verdict).toBeUndefined();
    expect(m.judgeFail).toBe(1);
    expect(m.hallucination).toBe(0);
    expect(m.contradiction).toBe(0);
  });

  it("dry 에서는 judge 필드가 아예 생기지 않는다 — 심판을 안 불렀으니 빈 판정도 없다", async () => {
    const samples = [await runOne(dryCtx)];
    await adapter.metrics(samples, dryCtx);
    expect(samples[0].judge).toBeUndefined();
    expect(mockedJudge).not.toHaveBeenCalled();
  });
});
