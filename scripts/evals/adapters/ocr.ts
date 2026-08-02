// ocr eval — 문자 정확도(CER)와 3-block 구조 준수를 본다.
// 이미지가 없으면 fixture 를 건너뛰지 않고 에러로 남긴다 — 조용히 0건 측정하고 통과하면 안 된다.
// runImageOcr 은 키가 없으면 throw 하지 않고 engine:"none" 오프라인 폴백 마크다운을 돌려준다.
// 그 폴백은 헤딩 3개짜리 한국어라 구조 게이트를 그대로 통과한다 — offlineFallback 을 따로 막는다.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runImageOcr } from "../../../src/llm/ocr";
import { cer, koreanRatio, type EvalAdapter, type Metrics, type Sample } from "../core";

// 서술 언어. 수식·영문 기호가 섞여도 설명은 한국어여야 한다.
const MIN_KOREAN_RATIO = 0.5;

const DIR = join(process.cwd(), "docs/30-llm/evals/ocr/fixtures");

type Fixture = { id: string; imageFile: string; kind: "printed" | "handwritten"; groundTruth: string; whyHard: string };
type Out = {
  text: string;
  engine: "gemini" | "none";
  cer: number;
  blocks: number;
  emptyBlocks: number;
  korean: boolean;
};

// buildOcrRequest 가 지시하는 3-block 출력 규약 (src/llm/ocr.ts) — 헤딩 3개가 있어야 한다.
function countBlocks(md: string): number {
  return [...md.matchAll(/^#{1,6}\s+/gm)].length;
}

// 헤딩별 (제목, 본문). 3-block 각각이 실제로 채워졌는지는 헤딩 개수만으로 알 수 없다.
function blocks(md: string): { heading: string; body: string }[] {
  const marks = [...md.matchAll(/^#{1,6}\s+(.+)$/gm)];
  return marks.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? md.length) : md.length;
    return { heading: m[1].trim(), body: md.slice(start, end).trim() };
  });
}

// CER 은 "옮겨 적은 글자가 맞는가" 를 재는 지표다. groundTruth 는 `## 원문` 블록의 내용이므로
// 출력 전체와 대조하면 구조·요약 블록의 글자가 전부 오류로 잡힌다 — 정상 출력이 CER 2.64,
// 빈 블록 출력이 0.43 으로 **불완전한 출력이 더 좋게 채점됐다**(적대적 검증에서 실측).
// 그래서 원문 블록만 떼어 잰다. 빈 블록은 emptyBlocks 가 따로 잡는다.
function originalBlock(md: string): string {
  const b = blocks(md).find((x) => /^(원문|Original)/i.test(x.heading));
  return b ? b.body : md.trim();
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
      cer: cer(fx.groundTruth, originalBlock(text)),
      blocks: countBlocks(text),
      emptyBlocks: blocks(text).filter((b) => b.body.length === 0).length,
      korean: koreanRatio(text) >= MIN_KOREAN_RATIO,
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
      // 헤딩 3개만 두고 내용을 비우면 구조 게이트는 통과하면서 CER 은 오히려 좋아진다.
      emptyBlocks: outs.reduce((a, s) => a + s.out!.emptyBlocks, 0),
      notKorean: outs.filter((s) => !s.out!.korean).length,
    };
  },

  gates: [
    { metric: "runFailed", op: "<=", threshold: 0, label: "실행 실패 0" },
    { metric: "offlineFallback", op: "<=", threshold: 0, label: "오프라인 폴백 채택 0건" },
    { metric: "structureViolation", op: "<=", threshold: 0, label: "3-block 구조 위반 0건" },
    { metric: "emptyBlocks", op: "<=", threshold: 0, label: "빈 블록 0건" },
    { metric: "notKorean", op: "<=", threshold: 0, label: `한국어 비율 ${MIN_KOREAN_RATIO} 미만 0건` },
    { metric: "cerPrinted", op: "<=", threshold: 0.15, label: "인쇄체 CER ≤ 0.15 (잠정)" },
    { metric: "cerHandwritten", op: "<=", threshold: 0.3, label: "손글씨 CER ≤ 0.30 (잠정)" },
  ],
};

export default adapter;
