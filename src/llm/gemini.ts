import type { LlmProvider, LlmWikiInput, LlmWikiResult } from "./provider";
import { normalizeLlmResult, validateLlmWikiResult } from "./validate";
import schema from "./schema/llm-wiki-result.schema.json" with { type: "json" };

// Premium — Google Gemini (Generative Language API, responseSchema). SSOT: docs/30-llm/provider-config.md §3.3, §4.
// 출력 검증/정규화는 validate.ts(keystone, 전 provider 공통). 프롬프트 본문 SSOT: prompt-templates.md.
// 되묻기/fact-check round-trip은 Backend 주도(§6) — 본 어댑터는 단일 구조화 호출만.

export type GeminiProviderConfig = {
  apiKey: string;
  endpoint: string; // base URL (default https://generativelanguage.googleapis.com/v1beta)
  model: string;
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number; // 재시도 지수 backoff 기준 (0=즉시, 테스트용)
};

type FetchFn = typeof fetch;

const DEFAULTS: Omit<GeminiProviderConfig, "apiKey"> = {
  endpoint: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-2.5-pro",
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
      contents: buildContents(input),
      systemInstruction: { parts: [{ text: SYSTEM }] },
      // responseSchema는 OpenAPI 3.0 subset — draft-2020-12 전용 키워드($schema/additionalProperties)는
      // live key 확보 시 재조정(후속). validate.ts가 provider 무관 최종 게이트라 drift는 거기서 차단.
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    };
  }

  private async attempt(body: unknown): Promise<AttemptResult> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.endpoint}/models/${this.cfg.model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.cfg.apiKey,
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      return retriable("network", `Gemini not reachable at ${this.cfg.endpoint} (${errMsg(e)})`);
    } finally {
      clearTimeout(timer);
    }

    // 400/401/403 재시도 X — 키 거부 또는 비전이성 잘못된 요청 (provider-config §4.1).
    // Gemini는 잘못된 키를 400 INVALID_ARGUMENT / 403 PERMISSION_DENIED로 반환 → 동일 요청 재시도 무의미.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return terminal("auth", `GEMINI_API_KEY rejected or bad request (HTTP ${res.status})`);
    }
    // 429는 표준 backoff 루프 안에서 재시도 (Retry-After 정밀 존중은 후속).
    if (res.status === 429) return retriable("rate_limit", "rate limited (HTTP 429)");
    if (!res.ok) return retriable("network", `Gemini HTTP ${res.status}`);

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
  return { ok: false, retriable: true, error: `[provider=gemini] ${stage}: ${cause}` };
}

function terminal(stage: Stage, cause: string): AttemptResult {
  return { ok: false, retriable: false, error: `[provider=gemini] ${stage}: ${cause}` };
}

// generateContent 응답 → 구조화 객체. candidates[].content.parts[].text를 모아 JSON.parse.
// SSOT: docs/30-llm/output-validation.md §3.
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function extractStructured(resp: unknown): unknown {
  const text = collectText((resp ?? {}) as GeminiResponse);
  if (!text) return undefined;
  return JSON.parse(text);
}

function collectText(r: GeminiResponse): string {
  const parts: string[] = [];
  for (const c of r.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      if (p.text) parts.push(p.text);
    }
  }
  return parts.join("");
}

// 프롬프트 본문은 docs/30-llm/prompt-templates.md SSOT. 여기서는 최소 직렬화만.
// Gemini contents role은 user/model만 — system은 systemInstruction으로 분리.
const SYSTEM =
  "You extract structured wiki concepts and relations from study notes. " +
  "Respond ONLY with JSON conforming to the LlmWikiResult schema. No prose, no markdown.";

function buildContents(input: LlmWikiInput) {
  return [{ role: "user", parts: [{ text: JSON.stringify(input) }] }];
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
