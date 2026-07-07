import type { LlmProvider, LlmWikiInput, LlmWikiResult } from "./provider";
import { normalizeLlmResult, validateLlmWikiResult } from "./validate";
import schema from "./schema/llm-wiki-result.schema.json" with { type: "json" };

// Gemini (OpenAI 호환 엔드포인트 /chat/completions, response_format json_schema). SSOT: docs/30-llm/provider-config.md §3.2, §4.
// Google 의 OpenAI 호환층(v1beta/openai)을 쓴다 — Bearer 인증 그대로, Chat Completions 형태.
// 출력 검증/정규화는 validate.ts(keystone). 프롬프트 본문 SSOT: prompt-templates.md.

export type GeminiProviderConfig = {
  apiKey: string;
  endpoint: string; // base URL (default Gemini OpenAI 호환 엔드포인트)
  model: string;
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number; // 재시도 지수 backoff 기준 (0=즉시, 테스트용)
};

type FetchFn = typeof fetch;

// Gemini OpenAI 호환 base URL. /chat/completions · /embeddings 를 append 한다.
export const GEMINI_OPENAI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai";

const DEFAULTS: Omit<GeminiProviderConfig, "apiKey"> = {
  endpoint: GEMINI_OPENAI_ENDPOINT,
  model: "gemini-2.5-flash",
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
    this.fetchFn = opts?.fetchFn ?? globalThis.fetch;
  }

  async generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult> {
    if (!this.cfg.apiKey) throw new Error("[provider=gemini] auth: GEMINI_API_KEY missing");
    const body = this.buildRequestBody(input);
    let lastError = "[provider=gemini] network: no attempt made";
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.cfg.backoffMs * 2 ** (attempt - 1));
      const r = await this.attempt(body);
      if (r.ok) {
        const { data, warnings } = normalizeLlmResult(r.data, input);
        for (const w of warnings) console.warn(`[provider=gemini] ${w}`);
        return data;
      }
      lastError = r.error;
      if (!r.retriable) break;
    }
    throw new Error(lastError);
  }

  private buildRequestBody(input: LlmWikiInput) {
    return {
      model: this.cfg.model,
      messages: buildMessages(input),
      // Chat Completions 구조화 출력 — SSOT: provider-config.md §3.2. strict:false + 다운스트림 ajv 가 실제 강제.
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

// Chat Completions 응답 → 평문 텍스트(choices[0].message.content). ocr/pdfdigest 도 재사용.
export function extractChatText(resp: unknown): string {
  const r = (resp ?? {}) as ChatResponse;
  return r.choices?.[0]?.message?.content ?? "";
}

// 프롬프트 본문은 docs/30-llm/prompt-templates.md SSOT. 여기서는 최소 직렬화만.
function buildMessages(input: LlmWikiInput) {
  const system =
    "You extract structured wiki concepts and relations from study notes. " +
    "Respond ONLY with JSON conforming to the LlmWikiResult schema. No prose, no markdown.";
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
    model: env.PIECEPOOL_LLM_MODEL || DEFAULTS.model,
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
