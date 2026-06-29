import type { LlmProvider, LlmWikiInput, LlmWikiResult } from "./provider";
import { normalizeLlmResult, validateLlmWikiResult } from "./validate";
import schema from "./schema/llm-wiki-result.schema.json" with { type: "json" };

// Premium — OpenAI GPT (Responses API, json_schema strict). SSOT: docs/30-llm/provider-config.md §3.2, §4.
// 출력 검증/정규화는 validate.ts(keystone, 전 provider 공통). 프롬프트 본문 SSOT: prompt-templates.md.
// 되묻기/fact-check round-trip은 Backend 주도(§6) — 본 어댑터는 단일 구조화 호출만.

export type OpenAiProviderConfig = {
  apiKey: string;
  endpoint: string; // base URL (default https://api.openai.com/v1)
  model: string;
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number; // 재시도 지수 backoff 기준 (0=즉시, 테스트용)
};

type FetchFn = typeof fetch;

const DEFAULTS: Omit<OpenAiProviderConfig, "apiKey"> = {
  endpoint: "https://api.openai.com/v1",
  model: "gpt-5-mini",
  timeoutMs: 60000,
  maxRetries: 2,
  backoffMs: 250,
};

export class OpenAiProvider implements LlmProvider {
  id = "openai" as const;
  private readonly cfg: OpenAiProviderConfig;
  private readonly fetchFn: FetchFn;

  constructor(opts?: { config?: Partial<OpenAiProviderConfig>; fetchFn?: FetchFn }) {
    this.cfg = { ...envConfig(), ...opts?.config };
    this.fetchFn = opts?.fetchFn ?? globalThis.fetch;
  }

  async generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult> {
    if (!this.cfg.apiKey) throw new Error("[provider=openai] auth: OPENAI_API_KEY missing");
    const body = this.buildRequestBody(input);
    let lastError = "[provider=openai] network: no attempt made";
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.cfg.backoffMs * 2 ** (attempt - 1));
      const r = await this.attempt(body);
      if (r.ok) {
        const { data, warnings } = normalizeLlmResult(r.data, input);
        for (const w of warnings) console.warn(`[provider=openai] ${w}`);
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
      input: buildMessages(input),
      // Responses API structured output — SSOT: provider-config.md §3.2.
      response_format: {
        type: "json_schema",
        json_schema: { name: "LlmWikiResult", strict: true, schema },
      },
    };
  }

  private async attempt(body: unknown): Promise<AttemptResult> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.endpoint}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      return retriable("network", `OpenAI not reachable at ${this.cfg.endpoint} (${errMsg(e)})`);
    } finally {
      clearTimeout(timer);
    }

    // 401/403 재시도 X — 사용자 인증 문제 (provider-config §4.1).
    if (res.status === 401 || res.status === 403) {
      return terminal("auth", `OPENAI_API_KEY rejected (HTTP ${res.status})`);
    }
    // 429는 표준 backoff 루프 안에서 재시도 (Retry-After 정밀 존중은 후속).
    if (res.status === 429) return retriable("rate_limit", "rate limited (HTTP 429)");
    if (!res.ok) return retriable("network", `OpenAI HTTP ${res.status}`);

    let parsed: unknown;
    try {
      parsed = extractStructured(await res.json());
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
  return { ok: false, retriable: true, error: `[provider=openai] ${stage}: ${cause}` };
}

function terminal(stage: Stage, cause: string): AttemptResult {
  return { ok: false, retriable: false, error: `[provider=openai] ${stage}: ${cause}` };
}

// Responses API 응답 → 구조화 객체. output_parsed 우선, 없으면 output text를 JSON.parse.
// SSOT: docs/30-llm/output-validation.md §3.
type OpenAiResponse = {
  output_parsed?: unknown;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function extractStructured(resp: unknown): unknown {
  const r = (resp ?? {}) as OpenAiResponse;
  if (r.output_parsed && typeof r.output_parsed === "object") return r.output_parsed;
  const text = r.output_text ?? collectOutputText(r);
  if (!text) return undefined;
  return JSON.parse(text);
}

function collectOutputText(r: OpenAiResponse): string {
  const parts: string[] = [];
  for (const item of r.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && c.text) parts.push(c.text);
    }
  }
  return parts.join("");
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

function envConfig(): OpenAiProviderConfig {
  const env = readEnv();
  return {
    apiKey: env.OPENAI_API_KEY || "",
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
