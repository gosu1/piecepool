// ocr eval — 문자 정확도(CER)와 3-block 구조 준수를 본다.
// 이미지가 없으면 fixture 를 건너뛰지 않고 에러로 남긴다 — 조용히 0건 측정하고 통과하면 안 된다.
// runImageOcr 은 키가 없으면 throw 하지 않고 engine:"none" 오프라인 폴백 마크다운을 돌려준다.
// 그 폴백은 헤딩 3개짜리 한국어라 구조 게이트를 그대로 통과한다 — offlineFallback 을 따로 막는다.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runImageOcr } from "../../../src/llm/ocr";
import { cer, type EvalAdapter, type Metrics, type Sample } from "../core";

const DIR = join(process.cwd(), "docs/30-llm/evals/ocr/fixtures");

type Fixture = { id: string; imageFile: string; kind: "printed" | "handwritten"; groundTruth: string; whyHard: string };
type Out = { text: string; engine: "gemini" | "none"; cer: number; blocks: number; korean: boolean };

// buildOcrRequest 가 지시하는 3-block 출력 규약 (src/llm/ocr.ts) — 헤딩 3개가 있어야 한다.
function countBlocks(md: string): number {
  return [...md.matchAll(/^#{1,6}\s+/gm)].length;
}

const adapter: EvalAdapter<Fixture, Out> = {
  id: "ocr",
  fixturesDir: DIR,
  needsApiKey: true,

  async run(fx, ctx) {
    const path = join(DIR, fx.imageFile);
    if (!existsSync(path)) throw new Error(`이미지 없음: ${fx.imageFile} — fixture 에 실제 이미지를 넣어야 한다`);
    const b64 = readFileSync(path).toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;
    const r = await runImageOcr(dataUrl, ctx.apiKey);
    const text = r.markdown;
    return {
      text,
      engine: r.engine,
      cer: cer(fx.groundTruth, text),
      blocks: countBlocks(text),
      korean: /[가-힣]/.test(text),
    };
  },

  async metrics(samples: Sample<Fixture, Out>[]): Promise<Metrics> {
    const outs = samples.filter((s) => s.out);
    const printed = outs.filter((s) => s.fixture.kind === "printed").map((s) => s.out!.cer);
    const hand = outs.filter((s) => s.fixture.kind === "handwritten").map((s) => s.out!.cer);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    return {
      cases: samples.length,
      runFailed: samples.filter((s) => s.error).length,
      offlineFallback: outs.filter((s) => s.out!.engine !== "gemini").length,
      cerPrinted: mean(printed),
      cerHandwritten: mean(hand),
      structureViolation: outs.filter((s) => s.out!.blocks < 3).length,
      notKorean: outs.filter((s) => !s.out!.korean).length,
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "offlineFallback", op: "<=", threshold: 0, label: "오프라인 폴백 채택 0건" },
    { metric: "structureViolation", op: "<=", threshold: 0, label: "3-block 구조 위반 0건" },
    { metric: "notKorean", op: "<=", threshold: 0, label: "한국어 아님 0건" },
    { metric: "cerPrinted", op: "<=", threshold: 0.15, label: "인쇄체 CER ≤ 0.15 (잠정)" },
    { metric: "cerHandwritten", op: "<=", threshold: 0.3, label: "손글씨 CER ≤ 0.30 (잠정)" },
  ],
};

export default adapter;
