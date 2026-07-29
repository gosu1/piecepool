import type { LlmWikiResult, LlmRelation } from "./provider";
import { errMsg, sleep } from "./http";

// Liner 어댑터 (feature 3: 정보 간극 메우기 · fact-check 출처 검색).
// SSOT: docs/30-llm/provider-config.md §3.3 — LLM 아님(위키 생성 X). 권위 있는 출처를 검색해
// 정답 기준(label)을 세우고, 검증 결과 URL 을 evidence[].reason 에 누적한다(schema 무변경).
// 응답 필드명은 배포 버전에 따라 다를 수 있어 방어적으로 정규화한다(§normalize).

export type LinerConfig = {
  apiKey: string;
  endpoint: string; // base URL. LINER_API_ENDPOINT / localStorage("liner-endpoint") 로 override.
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number;
};

const DEFAULTS: Omit<LinerConfig, "apiKey"> = {
  endpoint: "https://api.getliner.com/v1",
  timeoutMs: 20000,
  maxRetries: 1,
  backoffMs: 250,
};

export interface LinerSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface LinerAnswer {
  answer?: string;
  sources: LinerSource[];
}

type FetchFn = typeof fetch;

export class LinerClient {
  private readonly cfg: LinerConfig;
  private readonly fetchFn: FetchFn;

  constructor(opts?: { config?: Partial<LinerConfig>; fetchFn?: FetchFn }) {
    this.cfg = { ...DEFAULTS, apiKey: "", ...opts?.config };
    this.fetchFn = opts?.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /** 출처 검색. 결과가 비어도 throw 하지 않는다 — 없음(sources: [])과 실패(throw)를 구분. */
  async search(query: string): Promise<LinerAnswer> {
    if (!this.cfg.apiKey) throw new Error("[provider=liner] auth: LINER_API_KEY missing");
    let lastError = "[provider=liner] network: no attempt made";
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.cfg.backoffMs * 2 ** (attempt - 1));
      const r = await this.attempt(query);
      if (r.ok) return r.data;
      lastError = r.error;
      if (!r.retriable) break;
    }
    throw new Error(lastError);
  }

  private async attempt(query: string): Promise<{ ok: true; data: LinerAnswer } | { ok: false; retriable: boolean; error: string }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.endpoint}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({ query }),
        signal: ac.signal,
      });
    } catch (e) {
      return { ok: false, retriable: true, error: `[provider=liner] network: Liner not reachable at ${this.cfg.endpoint} (${errMsg(e)})` };
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, retriable: false, error: `[provider=liner] auth: LINER_API_KEY rejected (HTTP ${res.status})` };
    }
    if (res.status === 429) return { ok: false, retriable: true, error: "[provider=liner] rate_limit: rate limited (HTTP 429)" };
    if (!res.ok) return { ok: false, retriable: true, error: `[provider=liner] network: Liner HTTP ${res.status}` };

    try {
      return { ok: true, data: normalizeAnswer(await res.json()) };
    } catch (e) {
      return { ok: false, retriable: true, error: `[provider=liner] parse: response body not parseable (${errMsg(e)})` };
    }
  }
}

// ── 응답 정규화 — sources/references/documents/results/citations 등 필드 변형 흡수 ──
type Raw = Record<string, unknown>;

function normalizeAnswer(raw: unknown): LinerAnswer {
  const r = (raw ?? {}) as Raw;
  const answer = firstString(r, ["answer", "summary", "text"]);
  const arr = firstArray(r, ["sources", "references", "documents", "results", "citations"]);
  const sources: LinerSource[] = [];
  for (const item of arr) {
    const it = (item ?? {}) as Raw;
    const url = firstString(it, ["url", "link", "sourceUrl", "source_url"]);
    if (!url) continue;
    sources.push({
      url,
      title: firstString(it, ["title", "name"]) ?? url,
      snippet: firstString(it, ["snippet", "text", "content", "description"]),
    });
  }
  return { answer, sources };
}

function firstString(r: Raw, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function firstArray(r: Raw, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = r[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

// ── fact-check: 관계 근거에 출처 URL 누적 (수용기준 §3.2, schema 무변경) ──
// confidence 낮은 관계부터 최대 maxQueries 개 검증. 실패는 advisory — 결과를 망치지 않는다.
export interface FactCheckReport {
  result: LlmWikiResult;
  checked: number; // 출처가 실제로 붙은 관계 수
  failed: number; // 검색 실패(네트워크 등) 수
}

export async function factCheckRelations(
  result: LlmWikiResult,
  client: LinerClient,
  opts?: { maxQueries?: number; maxUrls?: number },
): Promise<FactCheckReport> {
  const maxQueries = opts?.maxQueries ?? 5;
  const maxUrls = opts?.maxUrls ?? 2;
  const targets = [...result.relations].sort((a, b) => a.confidence - b.confidence).slice(0, maxQueries);

  let checked = 0;
  let failed = 0;
  // 검색은 관계별 독립 — 순차 대기하면 maxQueries 번 왕복이 합산되므로 병렬.
  // 결과 순서는 아래 원본 배열 기준 map 이 보존한다.
  const enriched = new Map<LlmRelation, LlmRelation>();
  await Promise.all(
    targets.map(async (r) => {
      try {
        const { sources } = await client.search(`${r.sourceConceptTitle} ${r.targetConceptTitle}: ${r.explanation}`.slice(0, 300));
        const urls = sources.slice(0, maxUrls).map((s) => s.url);
        if (urls.length === 0) return;
        const suffix = ` · 출처: ${urls.join(" · ")}`;
        checked++;
        // evidence 가 있으면 각 reason 에 누적. 없으면 explanation 에 누적 —
        // applyLlmResult 가 빈 evidence 를 explanation 기반으로 합성하므로 결국 evidence[].reason 에 도달한다.
        enriched.set(
          r,
          r.evidence.length > 0
            ? { ...r, evidence: r.evidence.map((e) => ({ ...e, reason: e.reason + suffix })) }
            : { ...r, explanation: r.explanation + suffix },
        );
      } catch {
        failed++;
      }
    }),
  );
  const relations = result.relations.map((r) => enriched.get(r) ?? r);
  return { result: { ...result, relations }, checked, failed };
}
