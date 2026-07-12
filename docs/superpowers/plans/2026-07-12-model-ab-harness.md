# 블라인드 모델 A/B 하네스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemini 후보 모델(3.1-flash-lite vs 3.5-flash)을 3작업(위키 생성·파인만 되묻기·PDF 한국어 요약)에 돌려 익명 컬럼 `report.html`로 블라인드 사람 판정을 받는 CLI 하네스 `npm run eval:ab`.

**Architecture:** `scripts/model-ab.ts`(CLI 러너 — 프로브·생성·I/O)와 `scripts/model-ab-report.ts`(순수 로직 — 셔플·라벨·집계·HTML 조립)로 분리. 러너는 eval.ts·feynman-eval.ts와 동형으로 `src/llm`을 in-process 직호출(재구현 없음). 판정·개봉·집계는 생성된 HTML 안에서 완결.

**Tech Stack:** TypeScript + tsx (Node 22), vitest, marked + KaTeX (CDN, 로컬 HTML), Gemini OpenAI 호환 엔드포인트.

**Spec:** `docs/superpowers/specs/2026-07-12-model-ab-harness-design.md`

## Global Constraints

- **앱 코드 변경 금지**: `src/`, `src-tauri/` 수정 없음. 손대는 곳은 `scripts/`, `docs/`, `vitest.config.ts`, `package.json`, `.gitignore`뿐.
- 기본 후보 모델: `["gemini-3.1-flash-lite", "gemini-3.5-flash"]` (정확히 이 두 값).
- API 키: `process.env.GEMINI_API_KEY` (CLI 규약 — `.env`. 앱의 localStorage와 무관).
- 모든 커밋 시점에 `npm test`(vitest)와 `npm run check:scripts`(strict, noUnusedLocals) 초록.
- 파인만 선별 6케이스: `clarify-01-diligent-deadlock`, `clarify-03-wrong-pvalue-trap`, `clarify-04-just-tell-me-opportunity-cost`, `clarify-09-contradiction-clt`, `clarify-15-disguised-judgment-request-osmosis`, `clarify-17-formula-only-paste-variance`.
- 위키 케이스는 `docs/30-llm/evals/fixtures/*.json` 전부(현재 5개)를 그대로 재사용.
- 결과물 `docs/30-llm/evals/model-ab/results/`는 gitignore.
- 커밋 메시지는 저장소 관례(한국어 conventional commits) — 계획의 커밋 명령을 그대로 사용.

## File Structure

| 파일 | 역할 |
|---|---|
| Create `docs/30-llm/evals/model-ab/fixtures/pdfsummary/clt-math.json` | 신규 픽스처 1 — 수식 많은 영어 원문 (KaTeX 변환·콜아웃 품질 확인) |
| Create `docs/30-llm/evals/model-ab/fixtures/pdfsummary/opportunity-cost-prose.json` | 신규 픽스처 2 — 산문형 영어 원문 (섹션 구조화·용어 병기 확인) |
| Create `scripts/model-ab-report.ts` | 순수 로직: 결정적 PRNG, 셔플, A/B 라벨, 케이스 그룹핑, 지연 통계, HTML 렌더 |
| Create `scripts/model-ab-report.test.ts` | 위 순수 함수 vitest 단위 테스트 |
| Create `scripts/model-ab.ts` | CLI 러너: `--list`/프로브/3작업 생성/raw 저장/report.html 저장 |
| Modify `vitest.config.ts` | include에 `scripts/**/*.test.ts` 추가 |
| Modify `package.json` | `"eval:ab"` 스크립트 추가 |
| Modify `.gitignore` | `docs/30-llm/evals/model-ab/results/` 추가 |
| Modify `docs/30-llm/evals.md` | eval:ab 러너 사용법 섹션 추가 |
| Modify `docs/00-overview/journey.md` | 여정 기록 한 줄 (feat PR 필수 — journey-guard 훅) |

---

### Task 1: pdfsummary 영어 픽스처 2건

**Files:**
- Create: `docs/30-llm/evals/model-ab/fixtures/pdfsummary/clt-math.json`
- Create: `docs/30-llm/evals/model-ab/fixtures/pdfsummary/opportunity-cost-prose.json`

**Interfaces:**
- Consumes: 없음 (데이터 파일)
- Produces: `SummaryFixture` 형태 JSON `{ id: string, title: string, sourceText: string }` — Task 4의 `runSummary()`가 디렉터리를 읽어 사용. 텍스트는 저작권 문제 없는 자작 원문이며 `SUMMARY_MAX_CHARS`(48,000자) 이내.

- [ ] **Step 1: 수식형 픽스처 작성**

`docs/30-llm/evals/model-ab/fixtures/pdfsummary/clt-math.json` 생성 (JSON이므로 `sourceText`는 실제 파일에서 한 줄 문자열에 `\n` 이스케이프로 작성):

```json
{
  "id": "clt-math",
  "title": "Central Limit Theorem — Lecture Notes (excerpt)",
  "sourceText": "1. Introduction\nThe Central Limit Theorem (CLT) is one of the most remarkable results in probability theory. It states that, under fairly general conditions, the sum of a large number of independent random variables is approximately normally distributed, regardless of the distribution of the individual variables.\n\n2. Statement of the Theorem\nLet X1, X2, ..., Xn be independent and identically distributed random variables with mean mu and finite variance sigma^2. Define the sample mean X_bar = (X1 + ... + Xn) / n. Then the standardized quantity\nZ = (X_bar - mu) / (sigma / sqrt(n))\nconverges in distribution to the standard normal distribution N(0, 1) as n goes to infinity. Equivalently, for large n, X_bar is approximately N(mu, sigma^2 / n).\n\n3. Why the Variance Shrinks\nBecause the variance of the sample mean is Var(X_bar) = sigma^2 / n, averaging n observations reduces the spread of the estimate by a factor of n. The standard deviation of X_bar, called the standard error, is sigma / sqrt(n): quadrupling the sample size halves the standard error.\n\n4. A Worked Example\nSuppose the waiting time at a coffee shop has mean mu = 4 minutes and standard deviation sigma = 2 minutes, with an unknown, right-skewed distribution. For a random sample of n = 100 customers, the sample mean waiting time X_bar is approximately normal with mean 4 and standard error 2 / sqrt(100) = 0.2. The probability that X_bar exceeds 4.5 minutes is P(Z > (4.5 - 4) / 0.2) = P(Z > 2.5), which is approximately 0.0062.\n\n5. Conditions and Caveats\nThe classical CLT requires independence and finite variance. Heavy-tailed distributions with infinite variance (such as the Cauchy distribution) violate the theorem: the average of Cauchy random variables is itself Cauchy, no matter how large n is. Dependence between observations also slows or breaks convergence, which is why time-series data require specialized central limit theorems."
}
```

의도: 평문 수식(`sigma / sqrt(n)` 등)을 모델이 `$\sigma/\sqrt{n}$` KaTeX로 변환하는지, `> [!easy]` 콜아웃을 적절한 곳에만 넣는지 본다.

- [ ] **Step 2: 산문형 픽스처 작성**

`docs/30-llm/evals/model-ab/fixtures/pdfsummary/opportunity-cost-prose.json` 생성 (동일하게 `\n` 이스케이프):

```json
{
  "id": "opportunity-cost-prose",
  "title": "Opportunity Cost and Comparative Advantage — Reading (excerpt)",
  "sourceText": "1. Scarcity Forces Choice\nEconomics begins from a simple observation: resources are scarce, but human wants are not. Because we cannot have everything, every choice necessarily involves giving something up. The opportunity cost of a decision is the value of the next-best alternative that the decision forecloses. It is not the sum of all foregone alternatives, only the single most valuable one.\n\n2. Explicit and Implicit Costs\nAccountants record explicit costs: money actually paid for inputs. Economists insist on adding implicit costs: the value of resources the decision-maker already owns and could have deployed elsewhere. A student who spends a year earning a master's degree pays tuition (explicit), but also foregoes a year of salary (implicit). The economic cost of the degree is the sum of both, and ignoring the implicit part systematically understates the true cost of choices.\n\n3. Comparative Advantage\nOpportunity cost is the foundation of trade. A producer has a comparative advantage in a good when she can produce it at a lower opportunity cost than others, even if she is worse at producing everything in absolute terms. David Ricardo's classic insight is that total output rises when each party specializes according to comparative, not absolute, advantage. This is why a surgeon who types faster than her secretary should still delegate the typing: an hour of typing costs the surgeon an operation, but costs the secretary very little.\n\n4. Common Misconceptions\nSunk costs are not opportunity costs. Money already spent and unrecoverable should be irrelevant to forward-looking decisions, yet people routinely let it weigh on them — the sunk cost fallacy. Similarly, a zero price does not mean zero cost: attending a free concert still costs the evening you would have spent otherwise."
}
```

의도: 섹션 헤딩 번역(`## 1. 희소성은 선택을 강제한다` 식), 용어 병기(「기회비용(opportunity cost)」), 요약 압축(섹션당 3~8줄)을 본다.

- [ ] **Step 3: JSON 유효성 검증**

Run: `node -e 'for (const f of ["clt-math","opportunity-cost-prose"]) { const j = JSON.parse(require("fs").readFileSync("docs/30-llm/evals/model-ab/fixtures/pdfsummary/"+f+".json","utf8")); if (!j.id || !j.title || !j.sourceText) throw new Error(f); console.log(f, "OK", j.sourceText.length+"자"); }'`
Expected: 두 줄 `... OK ...자` 출력, 에러 없음. 각 sourceText 길이는 48,000자 미만.

- [ ] **Step 4: Commit**

```bash
git add docs/30-llm/evals/model-ab/fixtures/pdfsummary/
git commit -m "feat(eval): 모델 A/B용 pdfsummary 영어 픽스처 2건 (수식형·산문형)"
```

---

### Task 2: 리포트 순수 로직 — PRNG·셔플·라벨·집계

**Files:**
- Modify: `vitest.config.ts`
- Create: `scripts/model-ab-report.ts`
- Test: `scripts/model-ab-report.test.ts`

**Interfaces:**
- Consumes: `LlmWikiResult` 타입 (`src/llm/index`, 타입 전용 import)
- Produces (Task 3·4가 사용하는 정확한 시그니처):
  - `type AbTask = "wiki" | "feynman" | "pdfsummary"`
  - `type FeynmanRound = { studentSaid: string; probe?: string; targetGap?: string; error?: string }`
  - `type RawOutput = { task: AbTask; caseId: string; caseTitle: string; inputPreview: string; model: string; ok: boolean; latencyMs: number; error?: string; wiki?: { result: LlmWikiResult; rulePasses: string[]; ruleFailures: string[]; ruleWarnings: string[] }; feynman?: { rounds: FeynmanRound[] }; summaryMarkdown?: string }`
  - `type ProbeResult = { model: string; alive: boolean; latencyMs?: number; reason?: string }`
  - `type AbColumn = { label: string; model: string; ok: boolean; latencyMs: number; error?: string; wiki?: RawOutput["wiki"]; feynman?: RawOutput["feynman"]; summaryMarkdown?: string }`
  - `type AbCase = { task: AbTask; caseId: string; caseTitle: string; inputPreview: string; columns: AbColumn[] }`
  - `type ModelStats = { model: string; calls: number; failures: number; latencyP50: number | null; latencyMax: number | null }`
  - `type AbReportData = { runId: string; models: string[]; probe: ProbeResult[]; cases: AbCase[]; stats: ModelStats[] }`
  - `mulberry32(seed: number): () => number`
  - `shuffleWithRng<T>(arr: T[], rng: () => number): T[]` — 원본 불변
  - `labelColumns(outputs: RawOutput[], rng: () => number): AbColumn[]`
  - `buildStats(raw: RawOutput[], models: string[]): ModelStats[]`
  - `buildReportData(runId: string, models: string[], probe: ProbeResult[], raw: RawOutput[], rng: () => number): AbReportData`

- [ ] **Step 1: vitest include에 scripts 테스트 추가**

`vitest.config.ts`를 다음으로 수정 (주석도 갱신):

```ts
import { defineConfig } from "vitest/config";

// vitest 는 src 단위 테스트 + scripts 순수 로직 테스트. e2e/*.spec.ts 는 Playwright(npm run e2e) 소관.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
```

- [ ] **Step 2: 실패하는 테스트 작성**

`scripts/model-ab-report.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";
import {
  buildReportData,
  labelColumns,
  mulberry32,
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- scripts/model-ab-report.test.ts`
Expected: FAIL — `Cannot find module './model-ab-report'` 류의 모듈 없음 에러.

- [ ] **Step 4: 구현**

`scripts/model-ab-report.ts` 생성 (`renderReportHtml`은 Task 3에서 추가 — 이 단계에서는 아래 내용 전부):

```ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- scripts/model-ab-report.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: 타입체크 + 전체 테스트**

Run: `npm run check:scripts && npm test`
Expected: 둘 다 초록 (기존 src 테스트 포함).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts scripts/model-ab-report.ts scripts/model-ab-report.test.ts
git commit -m "feat(eval): 블라인드 A/B 리포트 순수 로직 (셔플·라벨·집계)"
```

---

### Task 3: 판정 리포트 HTML 렌더러

**Files:**
- Modify: `scripts/model-ab-report.ts` (파일 끝에 `renderReportHtml` 추가)
- Test: `scripts/model-ab-report.test.ts` (describe 블록 추가)

**Interfaces:**
- Consumes: Task 2의 `AbReportData`
- Produces: `renderReportHtml(data: AbReportData): string` — 자급자족 HTML 문자열. Task 4가 `report.html`로 저장.

- [ ] **Step 1: 실패하는 테스트 추가**

`scripts/model-ab-report.test.ts` import에 `renderReportHtml` 추가하고 파일 끝에 describe 추가:

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- scripts/model-ab-report.test.ts`
Expected: FAIL — `renderReportHtml` export 없음.

- [ ] **Step 3: 구현**

`scripts/model-ab-report.ts` 파일 끝에 추가. 주의: 바깥은 TS 템플릿 리터럴이므로 내부 JS는 백틱과 `${`를 쓰지 않는다(문자열 연결만). CDN 스크립트 중 `marked`는 동기 로드(렌더에 즉시 필요), KaTeX는 defer(DOMContentLoaded 후 typeset).

```ts
// 자급자족 판정 HTML. 블라인드(랜덤 라벨) → 전 케이스 판정 → 개봉(모델명 공개 + 집계).
// CDN(marked·KaTeX)은 로컬 파일이라 CSP 무관. 내부 JS는 템플릿 리터럴 충돌을 피해 문자열 연결만 쓴다.
export function renderReportHtml(data: AbReportData): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>모델 A/B 블라인드 판정</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<style>
body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;margin:0;background:#f6f7f9;color:#1f2328}
#top{padding:14px 24px;background:#fff;border-bottom:1px solid #e1e4e8;position:sticky;top:0;z-index:5;display:flex;gap:16px;align-items:baseline}
h1{font-size:16px;margin:0}
#progress{color:#57606a;font-size:13px}
.case{margin:24px;background:#fff;border:1px solid #e1e4e8;border-radius:8px;overflow:hidden}
.case-head{padding:12px 16px;border-bottom:1px solid #e1e4e8}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;background:#ddf4ff;color:#0969da;margin-right:8px}
details{margin-top:8px;font-size:13px;color:#57606a}
details pre{white-space:pre-wrap}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.col{padding:16px;border-left:1px solid #e1e4e8;min-width:0}
.col:first-child{border-left:none}
.col h3{margin:0 0 8px;font-size:14px}
.model-name{color:#cf222e;font-weight:600}
.md{font-size:14px;line-height:1.7;overflow-x:auto}
.md blockquote{border-left:3px solid #0969da;margin:8px 0;padding:4px 12px;background:#f6f8fa}
.bubble{border-radius:8px;padding:8px 12px;margin:6px 0;font-size:14px}
.bubble.student{background:#f6f8fa}
.bubble.probe{background:#ddf4ff}
.gap{font-size:11px;color:#0969da;margin-left:6px}
.rule-pass{color:#1a7f37;font-size:13px}
.rule-fail{color:#cf222e;font-size:13px}
.err{color:#cf222e;font-size:13px}
.verdict{padding:12px 16px;border-top:1px solid #e1e4e8;background:#fafbfc;font-size:14px}
.verdict label{margin-right:16px;cursor:pointer}
#footer{margin:24px;padding:16px;background:#fff;border:1px solid #e1e4e8;border-radius:8px}
#footer button{font-size:14px;padding:8px 16px;border-radius:6px;border:1px solid #d0d7de;background:#2da44e;color:#fff;cursor:pointer;margin-right:8px}
#footer button:disabled{background:#94d3a2;cursor:not-allowed}
table{border-collapse:collapse;margin-top:12px;font-size:13px}
td,th{border:1px solid #d0d7de;padding:6px 10px;text-align:left}
ul{margin:4px 0;padding-left:20px}
.hidden{display:none}
</style>
</head>
<body>
<div id="top"><h1>모델 A/B 블라인드 판정</h1><span id="progress"></span></div>
<div id="cases"></div>
<div id="footer">
  <button id="reveal" disabled>개봉 — 모델명 공개 + 집계</button>
  <button id="save" class="hidden">결과 저장 (JSON)</button>
  <div id="result"></div>
</div>
<script>
const DATA = ${json};
</script>
<script>
"use strict";
var verdicts = {}; // "task/caseId" -> 라벨 | "tie"
var TASK_LABEL = { wiki: "위키 생성", feynman: "파인만 되묻기", pdfsummary: "PDF 한국어 요약" };

function h(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function esc(s) {
  var d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}
function key(c) { return c.task + "/" + c.caseId; }

function renderColumn(col) {
  var box = h("div", "col");
  box.appendChild(h("h3", null, "안 " + esc(col.label) + ' <span class="model-name hidden">— ' + esc(col.model) + "</span>"));
  if (!col.ok && !col.feynman) {
    box.appendChild(h("div", "err", "생성 실패: " + esc(col.error || "")));
    return box;
  }
  if (col.summaryMarkdown !== undefined) {
    var md = h("div", "md");
    md.innerHTML = marked.parse(col.summaryMarkdown);
    box.appendChild(md);
  } else if (col.feynman) {
    col.feynman.rounds.forEach(function (r) {
      box.appendChild(h("div", "bubble student", esc(r.studentSaid)));
      if (r.probe) box.appendChild(h("div", "bubble probe", esc(r.probe) + '<span class="gap">' + esc(r.targetGap || "") + "</span>"));
      if (r.error) box.appendChild(h("div", "err", "실패: " + esc(r.error)));
    });
  } else if (col.wiki) {
    var w = col.wiki;
    box.appendChild(h("div", null, "<strong>개념 " + w.result.concepts.length + "</strong>"));
    var cul = h("ul");
    w.result.concepts.forEach(function (c) { cul.appendChild(h("li", null, esc(c.title))); });
    box.appendChild(cul);
    box.appendChild(h("div", null, "<strong>관계 " + w.result.relations.length + "</strong>"));
    var rul = h("ul");
    w.result.relations.forEach(function (r) {
      rul.appendChild(h("li", null, esc(r.sourceConceptTitle) + " —[" + esc(r.relationType) + "]→ " + esc(r.targetConceptTitle)));
    });
    box.appendChild(rul);
    box.appendChild(h("div", null,
      '<span class="rule-pass">규칙 ✓ ' + w.rulePasses.length + "</span>" +
      (w.ruleFailures.length ? ' <span class="rule-fail">✗ ' + w.ruleFailures.map(esc).join(" · ") + "</span>" : "")));
  }
  return box;
}

function renderCase(c) {
  var box = h("section", "case");
  var head = h("div", "case-head");
  head.appendChild(h("div", null, '<span class="badge">' + TASK_LABEL[c.task] + "</span><strong>" + esc(c.caseTitle) + "</strong>"));
  head.appendChild(h("details", null, "<summary>입력 원문 보기</summary><pre>" + esc(c.inputPreview) + "</pre>"));
  box.appendChild(head);
  var cols = h("div", "cols");
  c.columns.forEach(function (col) { cols.appendChild(renderColumn(col)); });
  box.appendChild(cols);
  var v = h("div", "verdict");
  var k = key(c);
  var opts = c.columns.map(function (col) { return col.label; }).concat(["tie"]);
  opts.forEach(function (o) {
    var lab = h("label");
    var input = document.createElement("input");
    input.type = "radio";
    input.name = k;
    input.value = o;
    input.addEventListener("change", function () { verdicts[k] = o; updateProgress(); });
    lab.appendChild(input);
    lab.appendChild(document.createTextNode(o === "tie" ? " 무승부" : " 안 " + o + " 승"));
    v.appendChild(lab);
  });
  box.appendChild(v);
  return box;
}

function updateProgress() {
  var done = Object.keys(verdicts).length;
  document.getElementById("progress").textContent = "판정 " + done + " / " + DATA.cases.length + " — run " + DATA.runId;
  document.getElementById("reveal").disabled = done < DATA.cases.length;
}

function tally() {
  var wins = {}; // task -> model -> n
  var ties = {}; // task -> n
  DATA.cases.forEach(function (c) {
    var v = verdicts[key(c)];
    if (v === "tie") { ties[c.task] = (ties[c.task] || 0) + 1; return; }
    var col = c.columns.find(function (x) { return x.label === v; });
    if (!col) return;
    if (!wins[c.task]) wins[c.task] = {};
    wins[c.task][col.model] = (wins[c.task][col.model] || 0) + 1;
  });
  return { wins: wins, ties: ties };
}

document.getElementById("reveal").addEventListener("click", function () {
  document.querySelectorAll(".model-name").forEach(function (e) { e.classList.remove("hidden"); });
  var t = tally();
  var out = "<h2>집계</h2><table><tr><th>작업</th>";
  DATA.models.forEach(function (m) { out += "<th>" + esc(m) + "</th>"; });
  out += "<th>무승부</th></tr>";
  var totals = {};
  Object.keys(TASK_LABEL).forEach(function (task) {
    if (!DATA.cases.some(function (c) { return c.task === task; })) return;
    out += "<tr><td>" + TASK_LABEL[task] + "</td>";
    DATA.models.forEach(function (m) {
      var n = (t.wins[task] || {})[m] || 0;
      totals[m] = (totals[m] || 0) + n;
      out += "<td>" + n + "</td>";
    });
    out += "<td>" + (t.ties[task] || 0) + "</td></tr>";
  });
  out += "<tr><th>합계</th>";
  DATA.models.forEach(function (m) { out += "<th>" + (totals[m] || 0) + "</th>"; });
  var tieTotal = Object.keys(t.ties).reduce(function (a, k2) { return a + t.ties[k2]; }, 0);
  out += "<th>" + tieTotal + "</th></tr></table>";

  out += "<h2>프로브·지연 통계</h2><table><tr><th>모델</th><th>프로브</th><th>호출</th><th>실패</th><th>지연 p50</th><th>지연 max</th></tr>";
  DATA.models.forEach(function (m) {
    var p = DATA.probe.find(function (x) { return x.model === m; });
    var s = DATA.stats.find(function (x) { return x.model === m; });
    out += "<tr><td>" + esc(m) + "</td>";
    out += "<td>" + (p ? (p.alive ? "생존 " + p.latencyMs + "ms" : "탈락: " + esc(p.reason || "")) : "-") + "</td>";
    out += "<td>" + (s ? s.calls : 0) + "</td><td>" + (s ? s.failures : 0) + "</td>";
    out += "<td>" + (s && s.latencyP50 != null ? s.latencyP50 + "ms" : "-") + "</td>";
    out += "<td>" + (s && s.latencyMax != null ? s.latencyMax + "ms" : "-") + "</td></tr>";
  });
  out += "</table>";
  document.getElementById("result").innerHTML = out;
  document.getElementById("save").classList.remove("hidden");
});

document.getElementById("save").addEventListener("click", function () {
  var blob = new Blob([JSON.stringify({ runId: DATA.runId, verdicts: verdicts, tally: tally() }, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "verdicts-" + DATA.runId + ".json";
  a.click();
});

DATA.cases.forEach(function (c) { document.getElementById("cases").appendChild(renderCase(c)); });
updateProgress();
// KaTeX 는 defer — DOM 준비 후 수식 렌더 ($...$ 인라인, $$...$$ 블록)
window.addEventListener("DOMContentLoaded", function () {
  if (!window.renderMathInElement) return;
  document.querySelectorAll(".md").forEach(function (e) {
    renderMathInElement(e, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  });
});
</script>
</body>
</html>
`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- scripts/model-ab-report.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: 타입체크**

Run: `npm run check:scripts`
Expected: 초록.

- [ ] **Step 6: Commit**

```bash
git add scripts/model-ab-report.ts scripts/model-ab-report.test.ts
git commit -m "feat(eval): 판정 리포트 HTML 렌더러 (봉인 데이터 + 개봉 집계)"
```

---

### Task 4: CLI 러너 `scripts/model-ab.ts` + 배선

**Files:**
- Create: `scripts/model-ab.ts`
- Modify: `package.json` (scripts에 한 줄)
- Modify: `.gitignore` (한 줄)

**Interfaces:**
- Consumes:
  - `new GeminiProvider({ config: { model } }).generateWikiStructured(input)` (`src/llm/gemini.ts` — apiKey는 env에서 자동)
  - `probeExplanation(concept, note, history, apiKey, { model, fetchFn })` (`src/llm/feynman.ts`)
  - `runPdfSummary({ sourceTitle, sourceText }, apiKey, { model })` (`src/llm/pdfsummary.ts`)
  - `validateLlmWikiResult(result)` (`src/llm/validate.ts`)
  - `assertCase(result, expected, schemaValid)` (`scripts/eval.ts` — export됨, main은 import 가드로 실행 안 됨)
  - Task 2·3의 `buildReportData`, `mulberry32`, `renderReportHtml` 및 타입들
- Produces: CLI 실행 결과 — `docs/30-llm/evals/model-ab/results/<runId>/report.html` + `raw/*.json`

- [ ] **Step 1: 구현**

`scripts/model-ab.ts` 생성:

```ts
// 블라인드 모델 A/B 러너 — Gemini 후보 모델을 3작업(위키·파인만·PDF요약)에 돌려
// 익명 컬럼 report.html 을 만든다. 판정·개봉·집계는 HTML 안에서 완결.
//   npm run eval:ab -- --list                     # 지금 살아있는 모델 나열
//   npm run eval:ab                               # 기본 후보 (3.1-flash-lite vs 3.5-flash)
//   npm run eval:ab -- --models a,b [--task wiki|feynman|pdfsummary]
// 구조는 eval.ts·feynman-eval.ts 와 동형: fixtures → src/llm 직호출(재구현 없음) → results.
// 키: process.env.GEMINI_API_KEY (CLI 규약). 설계: docs/superpowers/specs/2026-07-12-model-ab-harness-design.md

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GEMINI_OPENAI_ENDPOINT, GeminiProvider } from "../src/llm/gemini";
import { probeExplanation, type Turn } from "../src/llm/feynman";
import { runPdfSummary } from "../src/llm/pdfsummary";
import { validateLlmWikiResult } from "../src/llm/validate";
import type { LlmWikiInput } from "../src/llm/index";
import { assertCase } from "./eval";
import {
  buildReportData,
  mulberry32,
  renderReportHtml,
  type AbTask,
  type FeynmanRound,
  type ProbeResult,
  type RawOutput,
} from "./model-ab-report";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AB_DIR = join(ROOT, "docs/30-llm/evals/model-ab");
const WIKI_FIXTURES = join(ROOT, "docs/30-llm/evals/fixtures");
const WIKI_EXPECTED = join(ROOT, "docs/30-llm/evals/expected");
const FEYNMAN_FIXTURES = join(ROOT, "docs/30-llm/evals/feynman/fixtures");
const SUMMARY_FIXTURES = join(AB_DIR, "fixtures/pdfsummary");

// 현재 모델 + 승격 후보 (gemini.ts:28 주석의 결정 대기 사항 그대로)
const DEFAULT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
// 18개 중 유형 다양성 기준 6개 — 모범/오답함정/답요구/모순/위장판정/수식붙여넣기
const FEYNMAN_CASES = [
  "clarify-01-diligent-deadlock",
  "clarify-03-wrong-pvalue-trap",
  "clarify-04-just-tell-me-opportunity-cost",
  "clarify-09-contradiction-clt",
  "clarify-15-disguised-judgment-request-osmosis",
  "clarify-17-formula-only-paste-variance",
];
const CALL_GAP_MS = 500; // 무료 티어 배려 — 호출 사이 간격
const PREVIEW_CHARS = 600;
const TASKS: AbTask[] = ["wiki", "feynman", "pdfsummary"];

type WikiFixture = { id: string; title: string; input: LlmWikiInput };
type WikiExpected = Parameters<typeof assertCase>[1];
type FeynmanFixture = { id: string; persona: string; concept: string; note: string; studentSays: string[] };
type SummaryFixture = { id: string; title: string; sourceText: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
// probeExplanation 은 자체 타임아웃이 없다 — feynman-eval 과 같은 규약으로 감싼다.
const fetchWithTimeout = ((url: string, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })) as typeof fetch;

async function listModels(apiKey: string): Promise<void> {
  const res = await fetch(`${GEMINI_OPENAI_ENDPOINT}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    console.error(`GET /models 실패: HTTP ${res.status}`);
    process.exit(1);
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (body.data ?? [])
    .map((m) => m.id ?? "")
    .filter((id) => id.includes("gemini"))
    .sort();
  console.log(ids.join("\n") || "(gemini 모델 없음)");
}

// 초소형 chat 1회 — 404=단종 즉시 탈락, 429/5xx 는 3회 재시도 후 탈락.
async function probeModel(model: string, apiKey: string): Promise<ProbeResult> {
  let reason = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * attempt);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${GEMINI_OPENAI_ENDPOINT}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      reason = `network: ${errMsg(e)}`;
      continue;
    }
    if (res.ok) return { model, alive: true, latencyMs: Date.now() - t0 };
    reason = `HTTP ${res.status}`;
    if (res.status === 404) return { model, alive: false, reason: "404 — 단종/미존재" };
    if (res.status !== 429 && res.status < 500) break;
  }
  return { model, alive: false, reason: `${reason} 지속` };
}

async function runWiki(models: string[], raw: RawOutput[]): Promise<void> {
  const caseIds = readdirSync(WIKI_FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  for (const caseId of caseIds) {
    const fx = JSON.parse(readFileSync(join(WIKI_FIXTURES, `${caseId}.json`), "utf-8")) as WikiFixture;
    const expected = JSON.parse(readFileSync(join(WIKI_EXPECTED, `${caseId}.expected.json`), "utf-8")) as WikiExpected;
    for (const model of models) {
      const base = {
        task: "wiki" as AbTask,
        caseId,
        caseTitle: fx.title,
        inputPreview: fx.input.sourceText.slice(0, PREVIEW_CHARS),
        model,
      };
      process.stdout.write(`  [wiki] ${caseId} × ${model} ... `);
      const t0 = Date.now();
      try {
        const provider = new GeminiProvider({ config: { model } });
        const result = await provider.generateWikiStructured(fx.input);
        const latencyMs = Date.now() - t0;
        const v = validateLlmWikiResult(result);
        const outcome = assertCase(result, expected, v.valid);
        raw.push({
          ...base,
          ok: true,
          latencyMs,
          wiki: { result, rulePasses: outcome.passes, ruleFailures: outcome.failures, ruleWarnings: outcome.warnings },
        });
        console.log(`${outcome.ok ? "✅" : "⚠️ 규칙 위반"} ${latencyMs}ms`);
      } catch (e) {
        raw.push({ ...base, ok: false, latencyMs: Date.now() - t0, error: errMsg(e) });
        console.log(`💥 ${errMsg(e)}`);
      }
      await sleep(CALL_GAP_MS);
    }
  }
}

async function runFeynman(models: string[], apiKey: string, raw: RawOutput[]): Promise<void> {
  for (const caseId of FEYNMAN_CASES) {
    const fx = JSON.parse(readFileSync(join(FEYNMAN_FIXTURES, `${caseId}.json`), "utf-8")) as FeynmanFixture;
    for (const model of models) {
      const rounds: FeynmanRound[] = [];
      const history: Turn[] = [];
      let llmMs = 0;
      let failed: string | undefined;
      process.stdout.write(`  [feynman] ${caseId} × ${model} ... `);
      for (const said of fx.studentSays) {
        history.push({ role: "user", text: said });
        const t0 = Date.now();
        try {
          const probe = await probeExplanation(fx.concept, fx.note, history, apiKey, { model, fetchFn: fetchWithTimeout });
          llmMs += Date.now() - t0;
          history.push({ role: "probe", text: probe.probe });
          rounds.push({ studentSaid: said, probe: probe.probe, targetGap: probe.targetGap });
        } catch (e) {
          llmMs += Date.now() - t0;
          failed = errMsg(e);
          rounds.push({ studentSaid: said, error: failed });
          break; // 라운드 실패 뒤는 의미 없음 (feynman-eval 규약)
        }
        await sleep(CALL_GAP_MS);
      }
      raw.push({
        task: "feynman",
        caseId,
        caseTitle: `${fx.concept} — ${fx.persona}`,
        inputPreview: fx.note.slice(0, PREVIEW_CHARS),
        model,
        ok: !failed,
        latencyMs: llmMs,
        error: failed,
        feynman: { rounds },
      });
      console.log(failed ? `💥 ${failed}` : `✅ ${rounds.length}라운드 ${llmMs}ms`);
    }
  }
}

async function runSummary(models: string[], apiKey: string, raw: RawOutput[]): Promise<void> {
  const files = readdirSync(SUMMARY_FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of files) {
    const fx = JSON.parse(readFileSync(join(SUMMARY_FIXTURES, file), "utf-8")) as SummaryFixture;
    for (const model of models) {
      const base = {
        task: "pdfsummary" as AbTask,
        caseId: fx.id,
        caseTitle: fx.title,
        inputPreview: fx.sourceText.slice(0, PREVIEW_CHARS),
        model,
      };
      process.stdout.write(`  [pdfsummary] ${fx.id} × ${model} ... `);
      const t0 = Date.now();
      try {
        const r = await runPdfSummary({ sourceTitle: fx.title, sourceText: fx.sourceText }, apiKey, { model });
        const latencyMs = Date.now() - t0;
        raw.push({ ...base, ok: true, latencyMs, summaryMarkdown: r.markdown });
        console.log(`✅ ${latencyMs}ms${r.warning ? ` (${r.warning})` : ""}`);
      } catch (e) {
        raw.push({ ...base, ok: false, latencyMs: Date.now() - t0, error: errMsg(e) });
        console.log(`💥 ${errMsg(e)}`);
      }
      await sleep(CALL_GAP_MS);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.error("GEMINI_API_KEY 필요 (.env — CLI 규약. 앱의 localStorage 키와 별개)");
    process.exit(2);
  }

  if (args.includes("--list")) return listModels(apiKey);

  const models = (get("--models") ?? DEFAULT_MODELS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const only = get("--task") as AbTask | undefined;
  if (only && !TASKS.includes(only)) {
    console.error(`알 수 없는 task: ${only} (${TASKS.join(" | ")})`);
    process.exit(2);
  }

  console.log(`\n=== 모델 A/B — 후보: ${models.join(", ")} ===\n\n[1/3] 가용성 프로브`);
  const probe: ProbeResult[] = [];
  for (const m of models) {
    const p = await probeModel(m, apiKey);
    probe.push(p);
    console.log(`  ${p.alive ? "✅" : "❌"} ${m}${p.alive ? ` ${p.latencyMs}ms` : ` — ${p.reason}`}`);
  }
  const alive = probe.filter((p) => p.alive).map((p) => p.model);
  if (alive.length < 2) {
    console.error(`\n생존 모델 ${alive.length}개 — A/B 비교 무의미. 종료.`);
    process.exit(1);
  }

  console.log(`\n[2/3] 생성 — 케이스 × ${alive.length}모델 순차 호출`);
  const raw: RawOutput[] = [];
  if (!only || only === "wiki") await runWiki(alive, raw);
  if (!only || only === "feynman") await runFeynman(alive, apiKey, raw);
  if (!only || only === "pdfsummary") await runSummary(alive, apiKey, raw);

  console.log("\n[3/3] 리포트 생성");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(AB_DIR, "results", runId);
  mkdirSync(join(runDir, "raw"), { recursive: true });
  for (const r of raw) {
    writeFileSync(join(runDir, "raw", `${r.task}-${r.caseId}-${r.model}.json`), JSON.stringify(r, null, 2), "utf-8");
  }
  const data = buildReportData(runId, alive, probe, raw, mulberry32(Date.now() >>> 0));
  const htmlPath = join(runDir, "report.html");
  writeFileSync(htmlPath, renderReportHtml(data), "utf-8");
  console.log(`\n판정 리포트: ${htmlPath}\n브라우저로 열어 블라인드 판정 → 개봉 → (선택) verdicts JSON 저장.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: package.json에 스크립트 추가**

`package.json`의 `"scripts"`에서 `"eval:feynman"` 줄 다음에 추가:

```json
    "eval:ab": "tsx --env-file-if-exists=.env scripts/model-ab.ts"
```

- [ ] **Step 3: .gitignore에 결과 디렉터리 추가**

`.gitignore`의 `docs/30-llm/evals/feynman/results/run-*.json` 줄 아래에 추가:

```
docs/30-llm/evals/model-ab/results/
```

- [ ] **Step 4: 타입체크 + 전체 테스트**

Run: `npm run check:scripts && npm test`
Expected: 둘 다 초록.

- [ ] **Step 5: 스모크 — --list (실 API, GEMINI_API_KEY 필요)**

Run: `npm run eval:ab -- --list`
Expected: gemini 모델 id 목록 출력 (예: `models/gemini-3.1-flash-lite` 등). 키가 없거나 네트워크 불가면 이 단계는 보류하고 사용자에게 보고.

- [ ] **Step 6: Commit**

```bash
git add scripts/model-ab.ts package.json .gitignore
git commit -m "feat(eval): npm run eval:ab — 블라인드 모델 A/B 러너 (프로브+3작업+판정 HTML)"
```

---

### Task 5: 문서화 + 여정 기록 + 최종 검증

**Files:**
- Modify: `docs/30-llm/evals.md` (섹션 추가 — 파일 끝)
- Modify: `docs/00-overview/journey.md` (타임라인 표에 한 줄)

**Interfaces:**
- Consumes: Task 1~4 완료 상태
- Produces: 없음 (문서). feat 브랜치 PR 생성 전제 조건인 journey 행 포함 (journey-guard 훅이 검사).

- [ ] **Step 1: evals.md에 eval:ab 섹션 추가**

`docs/30-llm/evals.md`에서 기존 `## 9. 변경 이력 노트` 헤딩을 `## 10. 변경 이력 노트`로 바꾸고 (`§9` 외부 참조 없음 — 확인 완료), 그 헤딩 바로 앞에 새 §9를 삽입:

````markdown
## 9. 모델 A/B 블라인드 비교 (`npm run eval:ab`)

Gemini 모델 단종/승격 결정용. 후보 모델들을 위키 생성(5케이스)·파인만 되묻기(6케이스)·
PDF 한국어 요약(2케이스)에 돌려 익명 컬럼 `report.html`로 사람이 블라인드 판정한다.

```bash
npm run eval:ab -- --list          # 지금 살아있는 gemini 모델 나열
npm run eval:ab                    # 기본 후보: gemini-3.1-flash-lite vs gemini-3.5-flash
npm run eval:ab -- --models a,b    # 후보 지정
npm run eval:ab -- --task wiki     # 특정 작업만 (wiki|feynman|pdfsummary)
```

- 흐름: 가용성 프로브(404/지속503 탈락) → 생성(순차, 호출 간 500ms) → `results/<runId>/report.html`.
- 판정: 브라우저에서 케이스별 A/B/무승부 선택 → 전부 판정하면 "개봉" 활성화 →
  모델명 공개 + 작업별 승수 + 지연·에러 통계. 결과는 verdicts JSON으로 저장 가능.
- 결정 반영: 승자를 `src/llm/gemini.ts`의 `GEMINI_MODEL` 상수 한 줄로 교체.
- 러너 구조는 eval.ts와 동형 — src/llm 직호출, 재구현 없음. 순수 로직은
  `scripts/model-ab-report.ts`에 분리, vitest 단위 테스트 있음.
````

그리고 (이제 §10이 된) 변경 이력 노트 목록 끝에 한 줄 추가:

```markdown
- 2026-07-12 @gosu1 — §9 모델 A/B 블라인드 비교 러너(`eval:ab`) 추가.
```

- [ ] **Step 2: journey.md에 한 줄 추가**

`docs/00-overview/journey.md`의 `## 2. 마일스톤 타임라인` 표(3열: 날짜 | 사건 | 의미) 마지막 행 아래에 추가:

```markdown
| 07-12 | **블라인드 모델 A/B 하네스** (`npm run eval:ab`) — 가용성 프로브 + 3작업 13케이스 익명 판정 리포트 | 모델 선택을 감이 아니라 데이터로 — LLM 모델이 예고 없이 단종되어도 13개 실사용 케이스의 블라인드 사람 판정으로 하루 안에 후속 모델을 검증·교체한다 |
```

- [ ] **Step 3: 최종 검증 일괄 실행**

Run: `npm run check:scripts && npm test && npm run eval -- --case case-002-deadlock`
Expected: check·test 초록. `npm run eval`(기존 러너)도 여전히 동작 — assertCase re-export가 기존 경로를 깨지 않았음을 확인. (키 없으면 eval 단계는 ERROR가 정상 — check·test 초록만 필수.)

- [ ] **Step 4: 실 API 전체 스모크 (GEMINI_API_KEY 필요, 약 50콜)**

Run: `npm run eval:ab -- --task pdfsummary`
Expected: 프로브 2모델 → pdfsummary 2케이스 × 생존 모델 생성 → `docs/30-llm/evals/model-ab/results/<runId>/report.html` 생성 로그. (3.5-flash가 503 지속이면 "생존 모델 1개 — 종료"가 정상 동작이다. 그 경우도 성공으로 간주하고 보고.)

- [ ] **Step 5: Commit**

```bash
git add docs/30-llm/evals.md docs/00-overview/journey.md
git commit -m "docs(eval): evals.md에 model-ab 러너 문서화 + 여정 기록"
```

---

## 검증 요약 (전체 통과 조건)

1. `npm test` — 기존 전체 + 신규 8 테스트 초록
2. `npm run check:scripts` — strict 타입체크 초록
3. `npm run eval:ab -- --list` — 모델 목록 출력 (실 키)
4. `npm run eval:ab` 전체 실행 → report.html에서 13케이스 블라인드 판정 → 개봉 시 집계·통계 표시 (사람 확인 필요 — 구현자는 report.html 생성과 콘솔 로그까지 확인하고, 브라우저 판정은 사용자 몫)
