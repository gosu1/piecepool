import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "./gemini";
import schema from "./schema/facet-list.schema.json" with { type: "json" };

// Facet 추출(프롬프트 A) — 이해지표 커버리지 판정 파이프라인의 1단.
// 위키 본문에서 "진짜 이해한 사람이라면 자기 말로 표현할 수 있어야 하는" 핵심 요점을 뽑는다.
// 위키 버전당 1회 호출하고 캐시한다(캐시 키 = facetCacheKey(위키 본문)).
// 설계: docs/superpowers/specs/2026-07-26-facet-coverage-design.md §2, §4.
// 프롬프트 본문 SSOT: docs/30-llm/prompt-templates.md §12.
//
// id 는 LLM 이 아니라 TS 가 부여한다(f1, f2, …) — LLM 에게 id 관리를 시키면 흔들린다.

export type FacetKind = "definition" | "mechanism" | "rationale" | "boundary" | "connection" | "example";

export interface Facet {
  /** f1, f2, … — TS 가 부여. 커버리지 판정(coverage.ts)의 대조 키. */
  id: string;
  /** "~다"로 끝나는 완결된 한 문장. 원자적 — 사실/원리 하나만 담는다. */
  text: string;
  kind: FacetKind;
}

export interface FacetDeps {
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
type RawFacetList = { facets: Array<{ text: string; kind: FacetKind }> };
const validateFn: ValidateFunction<RawFacetList> = ajv.compile<RawFacetList>(schema);

/** 위키 본문 → facet 캐시 키. 같은 본문이면 같은 키 — 위키 버전당 1회 호출을 보장한다. */
export function facetCacheKey(wikiBody: string): string {
  const n = wikiBody.normalize("NFC");
  let h = 5381;
  for (let i = 0; i < n.length; i++) h = ((h << 5) + h + n.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// 프롬프트 A — 설계 §2 원문 그대로. 규칙 2(원자성)가 전체 설계의 열쇠:
// facet 이 원자적이면 커버리지 판정이 거의 이진 판정이 되어 주관성(=채점 느낌)이 준다.
const SYSTEM = [
  "당신은 학습 도구의 내부 부품이다. 아래 위키 문서에서, 이 개념을 진짜",
  "이해한 사람이라면 자기 말로 표현할 수 있어야 하는 핵심 요점(facet)을",
  "추출한다.",
  "",
  "규칙:",
  "1. 요점은 5~9개. 문서가 짧으면 3개까지 허용한다. 3개를 만들 수 없으면",
  "   빈 배열을 반환한다.",
  "2. 각 요점은 원자적이다 — 한 요점에는 정확히 하나의 사실/원리만 담아,",
  "   어떤 설명이 그것을 다뤘는지 독립적으로 판정할 수 있어야 한다.",
  "3. 반드시 아래 문서에 실제로 있는 내용만 쓴다. 문서에 없는 지식을",
  "   보태지 않는다.",
  '4. 각 요점은 "~다"로 끝나는 완결된 한 문장으로 쓴다.',
  "5. kind는 하나를 고른다: definition(무엇인가) | mechanism(어떻게 동작하나)",
  "   | rationale(왜 필요한가) | boundary(무엇과 다른가·한계)",
  "   | connection(다른 개념과의 관계) | example(대표 사례)",
  "6. 문서의 서식·링크·파일 경로·메타데이터는 요점이 아니다.",
  "7. JSON만 출력한다.",
].join("\n");

/**
 * 위키 본문에서 facet 목록을 추출한다. 3개 미만이면 스텁 위키 — 빈 배열을 반환한다
 * (커버리지 비활성, 설계 §5). 실패는 throw — 호출부는 기존 캐시/상태를 유지한다(fail-closed).
 */
export async function extractFacets(wikiBody: string, apiKey: string, deps?: FacetDeps): Promise<Facet[]> {
  const key = apiKey?.trim();
  if (!key) throw new Error("[provider=gemini] facets: API key 필요 — 설정에서 Gemini 키를 등록하세요");

  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const endpoint = deps?.endpoint ?? GEMINI_OPENAI_ENDPOINT;
  const maxRetries = deps?.maxRetries ?? 2;
  const backoffMs = deps?.backoffMs ?? 250;

  const body = JSON.stringify({
    model: deps?.model ?? GEMINI_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `[위키 문서]\n${wikiBody}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "FacetList", strict: false, schema } },
  });

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
    // 파싱·스키마 실패도 재시도 대상 — gemini.ts attempt() 의 parse/schema 분류와 동일.
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
      continue;
    }
    // 스텁 위키(3개 미만) → 커버리지 비활성. id 는 여기서 순서대로 부여한다.
    if (parsed.facets.length < 3) return [];
    return parsed.facets.map((f, i) => ({ id: `f${i + 1}`, text: f.text.trim(), kind: f.kind }));
  }
  throw new Error(`[provider=gemini] facets: ${lastErr}`);
}
