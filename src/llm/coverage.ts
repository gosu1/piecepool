import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "./gemini";
import schema from "./schema/coverage-result.schema.json" with { type: "json" };
import type { Facet } from "./facets";

// 커버리지 판정(프롬프트 B) — 이해지표 파이프라인의 2단. 사용자의 파인만 설명을
// facet 목록과 **대조만** 하여 다룸/부분/간극/어긋남을 돌려준다. 품질 채점은 하지 않는다
// — "LLM은 채점하지 않는다"(파인만 원칙)가 이 모듈의 존재 이유다.
// 설계: docs/superpowers/specs/2026-07-26-facet-coverage-design.md §3~§5.
// 프롬프트 본문 SSOT: docs/30-llm/prompt-templates.md §12.
//
// LLM 을 못 믿는 부분은 전부 코드로(설계 §4):
//   1. Ajv 검증 + id 집합 일치 검사 — 불일치 1회 재시도, 실패 시 판정 폐기(throw)
//   2. evidence 원문 대조 — 인용이 설명에 실제로 없으면 missing 강등
//   3. 위키 복붙 감지 — 문자 3-gram Jaccard, LLM 없이 TS 만으로
//   4. 상태 전이는 결정적 코드(clearOk) — 스칼라 점수는 저장·표시하지 않는다
//   5. fail-closed — 실패는 전부 throw, 호출부는 상태 불변(안개 유지). 낙관적 승급 금지.

export type CoverageStatus = "covered" | "partial" | "missing" | "contradicted";

export interface FacetJudgment {
  /** 대응하는 Facet.id (f1, f2, …) */
  id: string;
  status: CoverageStatus;
  /** 사용자 설명에서 그대로 옮긴 인용(최대 한 문장). missing 이면 null. */
  evidence: string | null;
}

export interface CoverageResult {
  judgments: FacetJudgment[];
  /** 위키 복붙 의심(3-gram Jaccard > 문턱) — 승급 보류 + "자기 말로 다시 써볼까요?" 넛지용 */
  pasteSuspected: boolean;
}

// 튜닝 대상 상수 — 한 파일(여기)에 모은다 (설계 §4-4).
export const COVERAGE_POLICY = {
  /** 설명이 이보다 짧으면 LLM 호출 없이 전부 missing (설계 §5) */
  minExplanationChars: 20,
  /** clearScore = (covered + 0.5*partial)/total 의 승급 문턱 */
  clearThreshold: 0.6,
  /** 설명↔위키 문자 3-gram Jaccard 가 이를 넘으면 복붙 의심 */
  pasteJaccardThreshold: 0.6,
} as const;

export interface CoverageDeps {
  fetchFn?: typeof fetch;
  endpoint?: string;
  model?: string;
  maxRetries?: number; // gemini.ts 와 같은 규약(기본 2)
  backoffMs?: number; // 0 = 즉시(테스트용)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 429·5xx·네트워크만 재시도한다. 401/400 은 재시도해도 같은 답이라 즉시 던진다. (feynman.ts 와 동일 규약)
const isRetriable = (status: number) => status === 429 || status >= 500;

const ajv = new Ajv2020({ allErrors: true });
type RawCoverageResult = { judgments: Array<{ id: string; status: CoverageStatus; evidence: string | null }> };
const validateFn: ValidateFunction<RawCoverageResult> = ajv.compile<RawCoverageResult>(schema);

// 프롬프트 B — 설계 §3 원문 그대로. 규칙 5(verbatim 인용)가 진짜 방어선:
// LLM judge 최대 실패 모드인 "친절한 환각"을 아래 enforceEvidence 가 기계 검증으로 잡는다.
const SYSTEM = [
  "당신은 채점자가 아니다. 당신의 유일한 임무는, 사용자가 자기 말로 쓴",
  "설명이 아래 요점 각각의 '의미'를 담고 있는지 대조하는 것이다.",
  "",
  "절대 규칙:",
  "1. 품질을 평가하지 않는다. 문체·길이·정확한 용어·맞춤법은 판정과",
  "   무관하다. 요점의 의미가 어떤 표현으로든 담겨 있으면 covered다.",
  "2. 자기 말 환언을 정답 표현과 동등하게 인정한다. 비유·구어체·서툰",
  "   표현도 의미가 맞으면 covered다.",
  "3. 점수·총평·칭찬·비판·조언을 출력하지 않는다. 요점별 판정만 출력한다.",
  "4. status는 4가지다:",
  "   - covered: 요점의 핵심 의미가 설명에 있다",
  "   - partial: 언급했지만 핵심의 절반 이하만 담았다",
  "   - missing: 설명에서 이 요점을 찾을 수 없다",
  "   - contradicted: 설명이 이 요점과 명백히 반대되는 주장을 한다",
  "5. covered / partial / contradicted에는 반드시 evidence를 붙인다 —",
  "   사용자 설명에서 한 글자도 바꾸지 말고 그대로 옮긴 인용(최대 한 문장).",
  "   missing은 evidence를 null로 둔다.",
  "6. contradicted는 명백한 의미 충돌만이다. 애매하면 partial 또는",
  "   missing으로 둔다.",
  "7. 사용자가 요점 밖의 내용을 말했더라도 무시한다. 사용자의 의도를",
  "   추측으로 보완하지 않는다.",
  "8. JSON만 출력한다.",
].join("\n");

const normWs = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

// 문자 3-gram 집합 — 복붙 감지용. 공백 정규화 + 소문자로 표기 흔들림을 흡수한다.
function trigrams(s: string): Set<string> {
  const t = normWs(s).toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** 가드레일 3 — 설명↔위키 본문의 문자 3-gram Jaccard 유사도. LLM 없이 TS 만으로. */
export function pasteJaccard(explanation: string, wikiBody: string): number {
  const a = trigrams(explanation);
  const b = trigrams(wikiBody);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

// 가드레일 2 — evidence 원문 대조. 공백 정규화 후 사용자 설명 내 substring 검사.
// 인용이 실제로 없으면 해당 facet 을 missing 으로 강등한다("친절한 환각" 차단).
function enforceEvidence(judgments: FacetJudgment[], explanation: string): FacetJudgment[] {
  const hay = normWs(explanation);
  return judgments.map((j) => {
    if (j.status === "missing") return { ...j, evidence: null };
    if (j.evidence && hay.includes(normWs(j.evidence))) return j;
    return { id: j.id, status: "missing" as const, evidence: null };
  });
}

// 가드레일 1(후반) — judgments 의 id 집합이 입력 facet 집합과 정확히 일치해야 한다
// (누락·추가·중복 전부 불일치). 스키마로는 못 잡아 TS 가 검사한다.
function idSetMatches(judgments: RawCoverageResult["judgments"], facets: Facet[]): boolean {
  if (judgments.length !== facets.length) return false;
  const want = new Set(facets.map((f) => f.id));
  const seen = new Set<string>();
  for (const j of judgments) {
    if (!want.has(j.id) || seen.has(j.id)) return false;
    seen.add(j.id);
  }
  return true;
}

/**
 * 상태 전이(설계 §4-4) — 전부 결정적 코드. LLM 은 요점별 status 만 준다.
 * clearScore = (covered + 0.5*partial)/total ≥ 문턱, contradicted 0, 복붙 아님일 때만 승급.
 * 스칼라 점수는 저장·표시하지 않는다 — 파생 상태(boolean)만 내보낸다.
 */
export function clearOk(result: CoverageResult): boolean {
  const { judgments, pasteSuspected } = result;
  if (pasteSuspected || judgments.length === 0) return false;
  if (judgments.some((j) => j.status === "contradicted")) return false;
  const covered = judgments.filter((j) => j.status === "covered").length;
  const partial = judgments.filter((j) => j.status === "partial").length;
  return (covered + 0.5 * partial) / judgments.length >= COVERAGE_POLICY.clearThreshold;
}

/**
 * 사용자 설명을 facet 목록과 대조해 요점별 판정을 돌려준다.
 * 실패는 전부 throw(fail-closed) — 호출부는 이해 상태를 바꾸지 않는다(안개 유지).
 */
export async function judgeCoverage(
  facets: Facet[],
  explanation: string,
  wikiBody: string,
  apiKey: string,
  deps?: CoverageDeps,
): Promise<CoverageResult> {
  const pasteSuspected = pasteJaccard(explanation, wikiBody) > COVERAGE_POLICY.pasteJaccardThreshold;

  // 스텁 위키(facet 없음)는 커버리지 비활성 — LLM 호출 없이 빈 판정 (설계 §5).
  if (facets.length === 0) return { judgments: [], pasteSuspected };

  // 사전 체크 — 너무 짧은 설명("몰라")은 LLM 호출 없이 전부 missing (설계 §5).
  if (normWs(explanation).length < COVERAGE_POLICY.minExplanationChars) {
    return { judgments: facets.map((f) => ({ id: f.id, status: "missing" as const, evidence: null })), pasteSuspected };
  }

  const key = apiKey?.trim();
  if (!key) throw new Error("[provider=gemini] coverage: API key 필요 — 설정에서 Gemini 키를 등록하세요");

  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const endpoint = deps?.endpoint ?? GEMINI_OPENAI_ENDPOINT;
  const maxRetries = deps?.maxRetries ?? 2;
  const backoffMs = deps?.backoffMs ?? 250;

  const facetLines = facets.map((f) => `${f.id}. (${f.kind}) ${f.text}`).join("\n");
  const body = JSON.stringify({
    model: deps?.model ?? GEMINI_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `[요점 목록]\n${facetLines}\n\n[사용자 설명]\n${explanation}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "CoverageResult", strict: false, schema } },
  });

  // 스키마 위반·id 집합 불일치는 1회만 재시도하고 판정을 폐기한다(설계 §4-1).
  // 네트워크·HTTP·파싱 실패는 feynman.ts 와 같은 규약(maxRetries)으로 재시도.
  let semanticFails = 0;
  let lastErr = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetchFn(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
      });
    } catch (e) {
      lastErr = `network: ${e instanceof Error ? e.message : String(e)}`;
      continue; // 네트워크 오류는 재시도
    }
    if (!res.ok) {
      lastErr = `HTTP ${res.status}`;
      if (!isRetriable(res.status)) break;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = extractChatJson(await res.json());
    } catch {
      lastErr = "LLM 응답 형식 오류 — 다시 시도해 주세요";
      continue;
    }
    if (!validateFn(parsed)) {
      lastErr = `schema violation: ${(validateFn.errors ?? [])
        .map((e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`)
        .join("; ")}`;
      if (++semanticFails > 1) break;
      continue;
    }
    if (!idSetMatches(parsed.judgments, facets)) {
      lastErr = "judgment id 집합이 facet 집합과 불일치";
      if (++semanticFails > 1) break;
      continue;
    }
    // 판정을 facet 순서로 정렬해 돌려준다 — 출력 순서를 LLM 에 의존하지 않는다.
    const byId = new Map(parsed.judgments.map((j) => [j.id, j]));
    const judgments = enforceEvidence(
      facets.map((f) => byId.get(f.id) as FacetJudgment),
      explanation,
    );
    return { judgments, pasteSuspected };
  }
  throw new Error(`[provider=gemini] coverage: ${lastErr}`);
}
