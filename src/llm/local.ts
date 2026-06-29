import type { LlmProvider, LlmWikiInput, LlmWikiResult } from "./provider";
import { normalizeLlmResult, validateLlmWikiResult } from "./validate";
import schema from "./schema/llm-wiki-result.schema.json" with { type: "json" };

// Free 플랜 — Local. Tauri sidecar llama.cpp `llama-server` (OpenAI 호환 localhost HTTP).
// SSOT: docs/30-llm/provider-config.md §2~§4. 출력 검증: validate.ts (keystone).
// 프롬프트 본문 SSOT: docs/30-llm/prompt-templates.md.

export type LocalProviderConfig = {
  endpoint: string; // llama-server base URL
  model: string; // GGUF 모델명 (PIECEPOOL_LLM_MODEL override)
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number; // 재시도 지수 backoff 기준 (0=즉시, 테스트용)
};

type FetchFn = typeof fetch;

const DEFAULTS: LocalProviderConfig = {
  endpoint: "http://localhost:8080",
  model: "gemma-4-e4b",
  timeoutMs: 60000,
  maxRetries: 2,
  backoffMs: 250,
};

export class LocalProvider implements LlmProvider {
  id = "local" as const;
  private readonly cfg: LocalProviderConfig;
  private readonly fetchFn: FetchFn;

  constructor(opts?: { config?: Partial<LocalProviderConfig>; fetchFn?: FetchFn }) {
    this.cfg = { ...envConfig(), ...opts?.config };
    this.fetchFn = opts?.fetchFn ?? globalThis.fetch;
  }

  async generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult> {
    const body = this.buildRequestBody(input);
    let lastError = `[provider=local] network: no attempt made`;
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.cfg.backoffMs * 2 ** (attempt - 1));
      const r = await this.attempt(body);
      if (r.ok) {
        const { data, warnings } = normalizeLlmResult(r.data, input);
        for (const w of warnings) console.warn(`[provider=local] ${w}`);
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
      // llama-server가 GBNF로 강제 (provider-config.md §3.1).
      response_format: {
        type: "json_schema",
        json_schema: { name: "LlmWikiResult", strict: true, schema },
      },
      temperature: 0,
      stream: false,
    };
  }

  private async attempt(body: unknown): Promise<AttemptResult> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      return fail("network", `local llama-server not reachable at ${this.cfg.endpoint} (${errMsg(e)})`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return fail("network", `llama-server HTTP ${res.status}`);

    let content: string;
    try {
      const json = (await res.json()) as ChatCompletionResponse;
      content = json.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      return fail("parse", `response body not JSON (${errMsg(e)})`);
    }
    if (!content) return fail("parse", "empty completion content");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return fail("parse", "completion content not valid JSON");
    }

    const v = validateLlmWikiResult(parsed);
    if (!v.valid) return fail("schema", `schema violation: ${v.errors.join("; ")}`);
    return { ok: true, data: v.data };
  }
}

type AttemptResult =
  | { ok: true; data: LlmWikiResult }
  | { ok: false; retriable: boolean; error: string };

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

// network/parse/schema 위반 전부 재시도 대상 (provider-config.md §4.1). local은 인증 없음 → 401/403 미발생.
function fail(stage: "network" | "parse" | "schema", cause: string): AttemptResult {
  return { ok: false, retriable: true, error: `[provider=local] ${stage}: ${cause}` };
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

function envConfig(): LocalProviderConfig {
  const env = readEnv();
  return {
    endpoint: env.PIECEPOOL_LOCAL_LLM_ENDPOINT || DEFAULTS.endpoint,
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
