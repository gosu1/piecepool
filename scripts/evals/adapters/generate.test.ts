// generate 어댑터 지표 단위 테스트. 실제 API 호출은 하지 않는다 — metrics 는 순수 함수라 샘플만 만들어 넣는다.
// 핵심 검증: shouldMetRatio 가 assertCase 의 이질 경고(`related_to 비율 >50%`)에 오염되지 않는가.
// README `## 적대적 검증`의 "should 판정 계산 결함" 항목이 이 테스트로 닫힌다.
import { describe, it, expect } from "vitest";
import adapter from "./generate";

type Samples = Parameters<typeof adapter.metrics>[0];
type Out = NonNullable<Samples[number]["out"]>;

// metrics 는 ctx 를 안 쓰지만 인터페이스 시그니처가 2인자다.
const ctx: Parameters<typeof adapter.metrics>[1] = { dry: false, apiKey: "" };

const emptyResult = { concepts: [], relations: [] } as Out["result"];

const mkOut = (over: Partial<Out> = {}): Out => ({
  result: emptyResult,
  ok: true,
  failures: [],
  warnings: [],
  passes: 0,
  shouldTotal: 0,
  schemaValid: true,
  relatedToRatio: 0,
  thinConcepts: 0,
  ...over,
});

const sample = (out: Out): Samples[number] => ({ fixture: { id: "mock" } as Samples[number]["fixture"], out, latencyMs: 100 });

describe("generate metrics — shouldMetRatio", () => {
  it("should 미충족 경고만 센다", async () => {
    const m = await adapter.metrics([
      sample(mkOut({ shouldTotal: 4, warnings: ["should.relation A -[part_of]-> B 미발견"] })),
    ], ctx);
    expect(m.shouldMetRatio).toBe(0.75);
  });

  it("related_to>50% 경고가 섞여도 충족률이 깎이지 않는다 — 과거 계산 결함 재현 방지", async () => {
    const m = await adapter.metrics([
      sample(
        mkOut({
          shouldTotal: 2,
          warnings: ["should.relatedConcept \"교착상태\" 미등장", "related_to 비율 60% > 50%"],
        }),
      ),
    ], ctx);
    // 옛 공식 (shouldTotal - warnings.length) / shouldTotal 이면 0 이 나오던 입력이다.
    expect(m.shouldMetRatio).toBe(0.5);
  });

  it("오염 경고만 있고 should 는 전부 충족이면 만점", async () => {
    const m = await adapter.metrics([sample(mkOut({ shouldTotal: 1, warnings: ["related_to 비율 100% > 50%"] }))], ctx);
    // 옛 공식이면 0, 경고가 2개였다면 음수까지 갔다.
    expect(m.shouldMetRatio).toBe(1);
  });

  it("shouldTotal 0 이면 NaN — 게이트 규약상 통과가 아니라 실패", async () => {
    const m = await adapter.metrics([sample(mkOut())], ctx);
    expect(Number.isNaN(m.shouldMetRatio)).toBe(true);
  });
});

describe("generate metrics — 집계", () => {
  it("케이스·실패·최대비율·thinConcepts 를 샘플에서 그대로 집계한다", async () => {
    const m = await adapter.metrics([
      sample(mkOut({ shouldTotal: 2, relatedToRatio: 0.2, thinConcepts: 1 })),
      sample(mkOut({ shouldTotal: 2, warnings: ["should.relation X -[causes]-> Y 미발견"], relatedToRatio: 0.5, ok: false, schemaValid: false })),
      { fixture: { id: "boom" } as Samples[number]["fixture"], error: "HTTP 500", latencyMs: 10 },
    ], ctx);
    expect(m.cases).toBe(3);
    expect(m.runFailed).toBe(1);
    expect(m.mustFail).toBe(1);
    expect(m.schemaInvalid).toBe(1);
    expect(m.relatedToRatioMax).toBe(0.5); // 평균이 아니라 케이스 최대값
    expect(m.thinConcepts).toBe(1);
    expect(m.shouldMetRatio).toBe(0.75); // (4 - 1) / 4
  });
});
