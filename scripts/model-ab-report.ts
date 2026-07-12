// 블라인드 모델 A/B 리포트 — 순수 로직 (PRNG·셔플·라벨·집계·HTML 조립). I/O 없음.
// 러너: scripts/model-ab.ts. 설계: docs/superpowers/specs/2026-07-12-model-ab-harness-design.md

import type { LlmWikiResult } from "../src/llm/index";

export type AbTask = "wiki" | "feynman" | "pdfsummary";

export type FeynmanRound = { studentSaid: string; probe?: string; targetGap?: string; error?: string };

export type RawOutput = {
  task: AbTask;
  caseId: string;
  caseTitle: string;
  inputPreview: string; // 판정 참고용 원문 일부
  model: string;
  ok: boolean;
  latencyMs: number; // LLM 호출 시간만 (호출 간 대기 제외)
  error?: string;
  wiki?: { result: LlmWikiResult; rulePasses: string[]; ruleFailures: string[]; ruleWarnings: string[] };
  feynman?: { rounds: FeynmanRound[] };
  summaryMarkdown?: string;
};

export type ProbeResult = { model: string; alive: boolean; latencyMs?: number; reason?: string };

// 컬럼 = 익명화된 모델 출력. model 은 개봉 전 화면에 안 보이는 봉인 필드.
export type AbColumn = {
  label: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  wiki?: RawOutput["wiki"];
  feynman?: RawOutput["feynman"];
  summaryMarkdown?: string;
};

export type AbCase = { task: AbTask; caseId: string; caseTitle: string; inputPreview: string; columns: AbColumn[] };

export type ModelStats = { model: string; calls: number; failures: number; latencyP50: number | null; latencyMax: number | null };

export type AbReportData = { runId: string; models: string[]; probe: ProbeResult[]; cases: AbCase[]; stats: ModelStats[] };

// 결정적 PRNG — 테스트가 셔플 결과를 고정할 수 있어야 한다.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithRng<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const LABELS = ["A", "B", "C", "D"];

// 케이스 하나의 모델 출력들 → 랜덤 순서 + A/B 라벨 (위치 편향 방지). 매핑은 column.model 에 봉인.
export function labelColumns(outputs: RawOutput[], rng: () => number): AbColumn[] {
  return shuffleWithRng(outputs, rng).map((o, i) => ({
    label: LABELS[i] ?? String(i + 1),
    model: o.model,
    ok: o.ok,
    latencyMs: o.latencyMs,
    error: o.error,
    wiki: o.wiki,
    feynman: o.feynman,
    summaryMarkdown: o.summaryMarkdown,
  }));
}

export function buildStats(raw: RawOutput[], models: string[]): ModelStats[] {
  return models.map((model) => {
    const mine = raw.filter((r) => r.model === model);
    const lat = mine
      .filter((r) => r.ok)
      .map((r) => r.latencyMs)
      .sort((a, b) => a - b);
    return {
      model,
      calls: mine.length,
      failures: mine.filter((r) => !r.ok).length,
      latencyP50: lat.length ? lat[Math.floor(lat.length / 2)] : null,
      latencyMax: lat.length ? lat[lat.length - 1] : null,
    };
  });
}

// task/caseId 그룹핑 — 입력 등장 순서 유지.
export function buildReportData(
  runId: string,
  models: string[],
  probe: ProbeResult[],
  raw: RawOutput[],
  rng: () => number,
): AbReportData {
  const keys: string[] = [];
  const byCase = new Map<string, RawOutput[]>();
  for (const r of raw) {
    const k = `${r.task}/${r.caseId}`;
    if (!byCase.has(k)) {
      byCase.set(k, []);
      keys.push(k);
    }
    byCase.get(k)!.push(r);
  }
  const cases: AbCase[] = keys.map((k) => {
    const outputs = byCase.get(k)!;
    const first = outputs[0];
    return {
      task: first.task,
      caseId: first.caseId,
      caseTitle: first.caseTitle,
      inputPreview: first.inputPreview,
      columns: labelColumns(outputs, rng),
    };
  });
  return { runId, models, probe, cases, stats: buildStats(raw, models) };
}
