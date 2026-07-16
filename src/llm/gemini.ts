import type { LlmProvider, LlmWikiInput, LlmWikiResult } from "./provider";
import { normalizeLlmResult, validateLlmWikiResult } from "./validate";
import schema from "./schema/llm-wiki-result.schema.json" with { type: "json" };
import { languageDirective, type OutputLanguage } from "./language";

// Gemini (OpenAI 호환 엔드포인트 /chat/completions, response_format json_schema). SSOT: docs/30-llm/provider-config.md §3.2, §4.
// Google 의 OpenAI 호환층(v1beta/openai)을 쓴다 — Bearer 인증 그대로, Chat Completions 형태.
// 출력 검증/정규화는 validate.ts(keystone). 프롬프트 본문 SSOT: prompt-templates.md.

export type GeminiProviderConfig = {
  apiKey: string;
  endpoint: string; // base URL (default Gemini OpenAI 호환 엔드포인트)
  model?: string; // 명시 override(테스트 주입·env PIECEPOOL_LLM_MODEL)만 — 없으면 단계별 TASK_MODELS 라우팅
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number; // 재시도 지수 backoff 기준 (0=즉시, 테스트용)
};

type FetchFn = typeof fetch;

// Gemini OpenAI 호환 base URL. /chat/completions · /embeddings 를 append 한다.
export const GEMINI_OPENAI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai";

// Gemini 채팅 모델 — 목록·기본값·라우팅을 여기서만 관리한다. 모델은 예고 없이 단종된다:
//   gemini-2.5-flash    → 404 NOT_FOUND ("no longer available to new users", 2026-07)
//   gemini-3.5-flash    → 블라인드 A/B 판정 승자로 승격 (`npm run eval:ab` 13케이스, 2026-07-12).
//                         한때 503 UNAVAILABLE 지속이었음 — 재발하면 flash-lite로 임시 강등.
//   gemini-3.1-flash-lite → 무료 티어 여유가 크고 빠르다 — 글 생성 태스크의 라우팅 대상.
// 임포트 파이프라인(PDF요약·위키 개념·관계추출·본문 병합)은 TASK_MODELS 고정 라우팅(속도),
// 그 밖(파인만·되물을거리·OCR·목차·정리글)은 설정 모달 피커(gemini-key 와 동형, localStorage).
// 우선순위 — 파이프라인: PIECEPOOL_LLM_MODEL(env — CLI·eval 용) > 태스크 라우팅. 피커 기능: 사용자 설정 > 기본값(env 무관).
export const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"] as const;
export type GeminiModelId = (typeof GEMINI_MODELS)[number];
export const GEMINI_MODEL: GeminiModelId = "gemini-3.5-flash";

const GEMINI_MODEL_KEY = "gemini-model";

// 브라우저 밖(CLI·eval)엔 localStorage가 없다 — 그땐 항상 기본값.
export function getGeminiModel(): GeminiModelId {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(GEMINI_MODEL_KEY) : null;
  return v && (GEMINI_MODELS as readonly string[]).includes(v) ? (v as GeminiModelId) : GEMINI_MODEL;
}

export function setGeminiModel(m: GeminiModelId): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(GEMINI_MODEL_KEY, m);
}

// ── 임포트 파이프라인 태스크별 고정 모델 라우팅 ──
// 속도가 목적: 글 생성(요약·개념·병합)은 빠른 lite, 12종 관계추출만 3.5.
// 설정 피커(getGeminiModel)는 파이프라인 밖 기능만 따른다. SSOT: docs/30-llm/prompt-templates.md §12.
export const TASK_MODELS = {
  summary: "gemini-3.1-flash-lite", // PDF 요약+쉬운설명 (pdfsummary.ts)
  wikiConcepts: "gemini-3.1-flash-lite", // 위키 개념/본문 — 2단 호출 ①
  wikiRelations: "gemini-3.5-flash", // 12종 관계추출 — 2단 호출 ②
  wikiMerge: "gemini-3.1-flash-lite", // 위키 본문 축적 병합 (mergeWiki.ts)
} as const satisfies Record<string, GeminiModelId>;

export function taskModel(task: keyof typeof TASK_MODELS): string {
  return readEnv().PIECEPOOL_LLM_MODEL || TASK_MODELS[task];
}

// 2단 호출의 단계 — 단계가 모델(TASK_MODELS)과 프롬프트 규칙(STAGE_RULES)을 정한다.
export type WikiStage = "wikiConcepts" | "wikiRelations";
// ② 관계 호출의 wire 입력 — LlmWikiInput(계약)에 ①이 방금 뽑은 이번 노트 개념(제목+요약)을 얹는다.
export type WikiWireInput = LlmWikiInput & { newConcepts?: Array<{ title: string; summary: string }> };

const DEFAULTS: Omit<GeminiProviderConfig, "apiKey"> = {
  endpoint: GEMINI_OPENAI_ENDPOINT,
  timeoutMs: 60000,
  maxRetries: 2,
  backoffMs: 250,
};

export class GeminiProvider implements LlmProvider {
  id = "gemini" as const;
  private readonly cfg: GeminiProviderConfig;
  private readonly fetchFn: FetchFn;

  constructor(opts?: { config?: Partial<GeminiProviderConfig>; fetchFn?: FetchFn }) {
    this.cfg = { ...envConfig(), ...opts?.config };
    // globalThis.fetch 는 window 바인딩 필수 — 변수/프로퍼티로 담아 호출하면 브라우저에서 "Illegal invocation" throw.
    this.fetchFn = opts?.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult> {
    if (!this.cfg.apiKey) throw new Error("[provider=gemini] auth: GEMINI_API_KEY missing");
    // 2단 호출(태스크 라우팅) — ① 개념(lite): 글 생성. relations 는 비우라고 지시하고, 채워 와도 버린다.
    const first = await this.requestWiki(this.buildRequestBody(input, "wikiConcepts"));
    // ② 관계(3.5): ①의 개념(+기존 개념) 사이 12종 관계만. concepts 는 버린다.
    const newConcepts = first.concepts.map((c) => ({ title: c.title, summary: c.summary }));
    const second = await this.requestWiki(this.buildRequestBody({ ...input, newConcepts }, "wikiRelations"));
    // 하나의 LlmWikiResult 로 합쳐 기존 정규화(llm-output-schema §5)를 그대로 1회 통과 —
    // ①의 개념이 result.concepts 에 있으므로 ②의 관계 제목 대조에 별도 주입이 필요 없다.
    const { data, warnings } = normalizeLlmResult({ concepts: first.concepts, relations: second.relations }, input);
    for (const w of warnings) console.warn(`[provider=gemini] ${w}`);
    return data;
  }

  // 요청 하나의 재시도 루프 — 단계별로 각자 재시도하고, 실패는 throw(호출부가 휴리스틱 폴백).
  private async requestWiki(body: unknown): Promise<LlmWikiResult> {
    let lastError = "[provider=gemini] network: no attempt made";
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.cfg.backoffMs * 2 ** (attempt - 1));
      const r = await this.attempt(body);
      if (r.ok) return r.data;
      lastError = r.error;
      if (!r.retriable) break;
    }
    throw new Error(lastError);
  }

  private buildRequestBody(input: WikiWireInput, stage: WikiStage) {
    return {
      model: this.cfg.model ?? TASK_MODELS[stage], // 명시 override > 태스크 라우팅
      messages: buildMessages(input, stage),
      // Chat Completions 구조화 출력 — SSOT: provider-config.md §3.2. strict:false + 다운스트림 ajv 가 실제 강제.
      // 두 단계가 같은 LlmWikiResult 스키마를 쓴다(빈 배열 유효) — 단계별 스키마 분기 없음.
      response_format: { type: "json_schema", json_schema: { name: "LlmWikiResult", strict: false, schema } },
    };
  }

  private async attempt(body: unknown): Promise<AttemptResult> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      return retriable("network", `Gemini not reachable at ${this.cfg.endpoint} (${errMsg(e)})`);
    } finally {
      clearTimeout(timer);
    }

    // 401/403 재시도 X — 사용자 인증 문제 (provider-config §4.1).
    if (res.status === 401 || res.status === 403) {
      return terminal("auth", `GEMINI_API_KEY rejected (HTTP ${res.status})`);
    }
    // 429는 표준 backoff 루프 안에서 재시도.
    if (res.status === 429) return retriable("rate_limit", "rate limited (HTTP 429)");
    if (!res.ok) return retriable("network", `Gemini HTTP ${res.status}`);

    let parsed: unknown;
    try {
      parsed = extractChatJson(await res.json());
    } catch (e) {
      return retriable("parse", `response body not parseable (${errMsg(e)})`);
    }
    if (parsed === undefined) return retriable("parse", "no structured output in response");

    const v = validateLlmWikiResult(parsed);
    if (!v.valid) return retriable("schema", `schema violation: ${v.errors.join("; ")}`);
    return { ok: true, data: v.data };
  }
}

type AttemptResult =
  | { ok: true; data: LlmWikiResult }
  | { ok: false; retriable: boolean; error: string };

type Stage = "network" | "parse" | "schema" | "auth" | "rate_limit";

function retriable(stage: Stage, cause: string): AttemptResult {
  return { ok: false, retriable: true, error: `[provider=gemini] ${stage}: ${cause}` };
}

function terminal(stage: Stage, cause: string): AttemptResult {
  return { ok: false, retriable: false, error: `[provider=gemini] ${stage}: ${cause}` };
}

// Chat Completions 응답 → 구조화 객체. choices[0].message.content(JSON 문자열)을 parse.
// gaps.ts(소크라테스 되묻기)도 재사용. SSOT: docs/30-llm/output-validation.md §3.
type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export function extractChatJson(resp: unknown): unknown {
  const text = extractChatText(resp);
  if (!text) return undefined;
  return JSON.parse(text);
}

// Chat Completions 응답 → 평문 텍스트(choices[0].message.content). ocr 도 재사용.
export function extractChatText(resp: unknown): string {
  const r = (resp ?? {}) as ChatResponse;
  return r.choices?.[0]?.message?.content ?? "";
}

// 프롬프트 본문은 docs/30-llm/prompt-templates.md SSOT(§12). 여기서는 최소 직렬화만.
// 언어 규칙: 사용자 노출 텍스트 필드 전부(summary/explanation/examples/relations[].explanation)가 directive를 따른다.
const STAGE_RULES: Record<WikiStage, string> = {
  wikiConcepts: 'This call extracts CONCEPTS only. Return "relations": [] (an empty array).',
  wikiRelations:
    "This call extracts RELATIONS only, between the concepts given in input.newConcepts and input.existingConcepts. " +
    'Use those exact titles as sourceConceptTitle/targetConceptTitle. Return "concepts": [] (an empty array). ' +
    "Ground every relation's evidence in input.sourceText (quote or location).",
};

export function buildMessages(input: WikiWireInput, stage: WikiStage, lang?: OutputLanguage) {
  const system =
    "You extract structured wiki concepts and relations from study notes. " +
    "Respond ONLY with JSON conforming to the LlmWikiResult schema. No prose, no markdown.\n" +
    `${STAGE_RULES[stage]}\n` +
    "All user-facing text fields (summary, explanation, examples, relations[].explanation) follow this language rule:\n" +
    languageDirective(lang);
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(input) },
  ];
}

function envConfig(): GeminiProviderConfig {
  const env = readEnv();
  return {
    apiKey: env.GEMINI_API_KEY || "",
    endpoint: DEFAULTS.endpoint,
    model: env.PIECEPOOL_LLM_MODEL || undefined,
    timeoutMs: numEnv(env.PIECEPOOL_LLM_TIMEOUT_MS, DEFAULTS.timeoutMs),
    maxRetries: numEnv(env.PIECEPOOL_LLM_MAX_RETRIES, DEFAULTS.maxRetries),
    backoffMs: DEFAULTS.backoffMs,
  };
}

// @types/node 없이 process.env 접근 (eval=Node / app=webview 공유).
function readEnv(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

function numEnv(raw: string | undefined, fallback: number): number {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
