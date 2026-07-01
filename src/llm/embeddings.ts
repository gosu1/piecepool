import type { EmbedFn } from "./chunk";

// OpenAI 임베딩 어댑터 — semantic chunking(chunk.ts §C)이 쓰는 실 EmbedFn 제공.
// 모델 기본 text-embedding-3-small (open-questions §5 후보). openai.ts 패턴(env/fetch/retry) 재사용.
// 이 임베딩 자산은 Concept 중복 판정·relation scoring에서도 공유 예정 — chunking 전용이 아니다.

export type OpenAiEmbedConfig = {
  apiKey: string;
  endpoint: string; // base URL (default https://api.openai.com/v1)
  model: string;
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number;
  batchSize: number; // 한 호출에 보낼 최대 문장 수
};

type FetchFn = typeof fetch;

const DEFAULTS: Omit<OpenAiEmbedConfig, "apiKey"> = {
  endpoint: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  timeoutMs: 60000,
  maxRetries: 2,
  backoffMs: 250,
  batchSize: 256,
};

// 실 임베더 팩토리. 반환값을 semanticChunk({ embed }) 에 그대로 넣는다.
export function createOpenAiEmbedder(opts?: {
  config?: Partial<OpenAiEmbedConfig>;
  fetchFn?: FetchFn;
}): EmbedFn {
  const cfg: OpenAiEmbedConfig = { ...envConfig(), ...opts?.config };
  const fetchFn = opts?.fetchFn ?? globalThis.fetch;

  return async (texts: string[]): Promise<number[][]> => {
    if (!cfg.apiKey) throw new Error("[embed=openai] auth: OPENAI_API_KEY missing");
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += cfg.batchSize) {
      const batch = texts.slice(i, i + cfg.batchSize);
      out.push(...(await embedBatch(batch, cfg, fetchFn)));
    }
    return out;
  };
}

async function embedBatch(batch: string[], cfg: OpenAiEmbedConfig, fetchFn: FetchFn): Promise<number[][]> {
  const body = JSON.stringify({ model: cfg.model, input: batch });
  let lastError = "[embed=openai] network: no attempt made";
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) await sleep(cfg.backoffMs * 2 ** (attempt - 1));
    const r = await attempt_(body, cfg, fetchFn);
    if (r.ok) return r.data;
    lastError = r.error;
    if (!r.retriable) break;
  }
  throw new Error(lastError);
}

type AttemptResult =
  | { ok: true; data: number[][] }
  | { ok: false; retriable: boolean; error: string };

async function attempt_(body: string, cfg: OpenAiEmbedConfig, fetchFn: FetchFn): Promise<AttemptResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);
  let res: Response;
  try {
    res = await fetchFn(`${cfg.endpoint}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body,
      signal: ac.signal,
    });
  } catch (e) {
    return { ok: false, retriable: true, error: `[embed=openai] network: unreachable (${errMsg(e)})` };
  } finally {
    clearTimeout(timer);
  }

  // 401/403 재시도 X — 사용자 인증 문제(openai.ts와 동일 정책).
  if (res.status === 401 || res.status === 403) {
    return { ok: false, retriable: false, error: `[embed=openai] auth: OPENAI_API_KEY rejected (HTTP ${res.status})` };
  }
  if (res.status === 429) return { ok: false, retriable: true, error: "[embed=openai] rate_limit: HTTP 429" };
  if (!res.ok) return { ok: false, retriable: true, error: `[embed=openai] network: HTTP ${res.status}` };

  try {
    const parsed = extractEmbeddings(await res.json());
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, retriable: true, error: `[embed=openai] parse: ${errMsg(e)}` };
  }
}

// { data: [{ index, embedding }] } → index 순 정렬된 벡터 배열.
type EmbedResponse = { data?: Array<{ index?: number; embedding?: number[] }> };

function extractEmbeddings(resp: unknown): number[][] {
  const data = (resp as EmbedResponse)?.data;
  if (!Array.isArray(data) || data.length === 0) throw new Error("no embeddings in response");
  const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return sorted.map((d, i) => {
    if (!Array.isArray(d.embedding)) throw new Error(`embedding[${i}] missing`);
    return d.embedding;
  });
}

function envConfig(): OpenAiEmbedConfig {
  const env = readEnv();
  return {
    apiKey: env.OPENAI_API_KEY || "",
    endpoint: DEFAULTS.endpoint,
    model: env.PIECEPOOL_EMBED_MODEL || DEFAULTS.model,
    timeoutMs: numEnv(env.PIECEPOOL_LLM_TIMEOUT_MS, DEFAULTS.timeoutMs),
    maxRetries: numEnv(env.PIECEPOOL_LLM_MAX_RETRIES, DEFAULTS.maxRetries),
    backoffMs: DEFAULTS.backoffMs,
    batchSize: numEnv(env.PIECEPOOL_EMBED_BATCH, DEFAULTS.batchSize),
  };
}

// @types/node 없이 process.env 접근 (openai.ts와 동일).
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
