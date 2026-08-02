// LLM 기능 eval 공용 코어. 기능을 모른다 — 어댑터가 선언한 지표 이름과 게이트만 본다.
// 설계: docs/superpowers/specs/2026-08-02-llm-eval-metrics-design.md §3
// 레퍼런스: scripts/feynman-eval.ts (지표 → 게이트 → exit 1 규약을 이 코어가 일반화한다)

export type Metrics = Record<string, number>;
export type GateOp = "<=" | ">=" | "==";

export interface Gate {
  metric: string; // Metrics 의 키
  op: GateOp;
  threshold: number;
  label: string; // 사람이 읽을 설명 (README 합격선 표와 같은 문구)
}

export interface RunCtx {
  dry: boolean; // judge 등 모델 호출을 생략하는 저비용 모드
  apiKey: string; // GEMINI_API_KEY (dry 이거나 needsApiKey=false 면 빈 문자열 가능)
}

export interface Sample<F, O> {
  fixture: F;
  out?: O;
  error?: string;
  latencyMs?: number;
}

export interface EvalAdapter<F, O> {
  id: string; // "chunk" — npm run eval:chunk 와 일치
  fixturesDir: string; // 절대 경로
  needsApiKey: boolean; // false 면 키 없이도 돈다 (순수 함수 기능)
  run(fixture: F, ctx: RunCtx): Promise<O>;
  metrics(samples: Sample<F, O>[], ctx: RunCtx): Promise<Metrics>;
  gates: Gate[];
}

// 게이트 판정. dry 에서 없는 지표는 건너뛰되, 있는 지표는 그대로 본다.
// 핵심 규약: 지표가 없거나 NaN 이면 통과가 아니라 실패다. 조용히 통과하면 게이트가 게이트가 아니다.
export function evaluateGates(metrics: Metrics, gates: Gate[], dry: boolean): string[] {
  const fails: string[] = [];
  for (const g of gates) {
    const v = metrics[g.metric];
    if (v === undefined || Number.isNaN(v)) {
      if (dry) continue; // dry 는 judge 지표를 안 만든다 — 거짓 경보 금지
      fails.push(`${g.label} — 지표 없음 (${g.metric} 미산출)`);
      continue;
    }
    const ok = g.op === "<=" ? v <= g.threshold : g.op === ">=" ? v >= g.threshold : v === g.threshold;
    if (!ok) fails.push(`${g.label} — 실측 ${fmt(v)} (허용 ${g.op} ${g.threshold})`);
  }
  return fails;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(4);
}

// ── 지표 계산 공용 도구 ─────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const normText = (s: string): string => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

// 문자 오류율. 공백·대소문자·유니코드 정규화 후 편집거리 / 기준 길이.
export function cer(reference: string, hypothesis: string): number {
  const ref = normText(reference);
  const hyp = normText(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return levenshtein(ref, hyp) / ref.length;
}

// 한국어 비율. 한글 / (한글 + 라틴문자).
// "한글이 한 글자라도 있는가" 로 재면 영어 본문에 한글 용어 몇 개만 섞어도 통과한다
// (적대적 검증에서 실증됨). 서술 언어는 존재 여부가 아니라 비중으로 봐야 한다.
// 문자가 하나도 없으면 1 — 언어 지표가 다른 결함(빈 출력)을 대신 잡지 않게 한다.
export function koreanRatio(text: string): number {
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return hangul + latin === 0 ? 1 : hangul / (hangul + latin);
}

// 헤딩·불릿 마커를 걷어낸 본문 글자수(공백 제외). 핵심어만 나열한 목록과 실제 설명을 가른다.
// 길이는 설명의 **하한**일 뿐 질을 재지 않는다 — 한계는 각 README 의 적대적 검증 절에 적었다.
export function bodyChars(md: string): number {
  return md
    .replace(/^#{1,6}\s+.*$/gm, "") // 헤딩 줄 제거
    .replace(/^[\s>]*[-*+]\s+/gm, "") // 불릿 마커 제거
    .replace(/\s+/g, "").length;
}

// 경계 F1. tolerance 문장 이내면 맞은 것으로 본다. 골드 하나는 예측 하나에만 매칭(그리디).
export function boundaryF1(gold: number[], pred: number[], tolerance: number): number {
  if (gold.length === 0 && pred.length === 0) return 1;
  if (gold.length === 0 || pred.length === 0) return 0;
  const used = new Set<number>();
  let hit = 0;
  for (const g of gold) {
    const i = pred.findIndex((p, idx) => !used.has(idx) && Math.abs(p - g) <= tolerance);
    if (i !== -1) {
      used.add(i);
      hit++;
    }
  }
  const precision = hit / pred.length;
  const recall = hit / gold.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}
