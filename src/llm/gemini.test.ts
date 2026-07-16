import { describe, it, expect, afterEach } from "vitest";
import { buildMessages, GEMINI_MODEL, GeminiProvider } from "./gemini";
import type { LlmConcept, LlmWikiInput } from "./provider";

const INPUT = { sourceId: "s1", sourceTitle: "T", sourceText: "본문" } as unknown as LlmWikiInput;

// @types/node 없이 process.env 접근 (readEnv 와 같은 캐스트).
const nodeEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe("buildMessages — 위키 생성 언어 directive", () => {
  it("ko(기본) — system에 혼용 규칙 + JSON 지시 유지", () => {
    const m = buildMessages(INPUT);
    expect(m[0].role).toBe("system");
    expect(m[0].content).toContain("LlmWikiResult");
    expect(m[0].content).toContain("원문 표기를 그대로");
    expect(m[1].content).toContain("본문");
  });

  it("en — English 지시", () => {
    const m = buildMessages(INPUT, "en");
    expect(m[0].content).toContain("Write all prose in English");
    expect(m[0].content).not.toContain("서술은 한국어로 쓴다");
  });
});

// ── GeminiProvider 단일 구조화 호출 — fetch mock 이 요청 body(model·messages)를 기록한다 ──

const WIKI_INPUT: LlmWikiInput = {
  sourceTitle: "OS 노트",
  sourceText: "프로세스와 스레드",
  subjects: [],
  existingConcepts: [],
};

function concept(title: string): LlmConcept {
  return { title, summary: `${title} 요약`, explanation: "설명", examples: [], sourceRefs: [], sourceEmbeds: [] };
}

function chatJson(result: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
}

type SentBody = { model: string; messages: Array<{ role: string; content: string }> };

function fetchMock(respond: (call: number) => Response) {
  const bodies: SentBody[] = [];
  const fetchFn = (async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)) as SentBody);
    return respond(bodies.length - 1);
  }) as unknown as typeof fetch;
  return { bodies, fetchFn };
}

function makeProvider(fetchFn: typeof fetch, config?: Record<string, unknown>) {
  return new GeminiProvider({ config: { apiKey: "k", backoffMs: 0, ...config }, fetchFn });
}

describe("GeminiProvider — 구조화 호출", () => {
  const RESULT = { concepts: [concept("프로세스")], relations: [] };

  afterEach(() => {
    delete nodeEnv.PIECEPOOL_LLM_MODEL;
  });

  it("기본 모델로 1회 호출, 응답을 정규화해 돌려준다", async () => {
    const { bodies, fetchFn } = fetchMock(() => chatJson(RESULT));
    const r = await makeProvider(fetchFn).generateWikiStructured(WIKI_INPUT);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].model).toBe(GEMINI_MODEL); // 하드코딩 금지 — 단종 시 거짓 실패
    expect(r.concepts.map((c) => c.title)).toEqual(["프로세스"]);
  });

  it("PIECEPOOL_LLM_MODEL(env) 이 모델을 덮는다 (CLI·eval)", async () => {
    nodeEnv.PIECEPOOL_LLM_MODEL = "gemini-env-pinned";
    const { bodies, fetchFn } = fetchMock(() => chatJson(RESULT));
    await makeProvider(fetchFn).generateWikiStructured(WIKI_INPUT);
    expect(bodies[0].model).toBe("gemini-env-pinned");
  });

  it("스키마 위반 응답은 재시도 후 성공", async () => {
    const { bodies, fetchFn } = fetchMock((call) => (call === 0 ? chatJson({}) : chatJson(RESULT)));
    const r = await makeProvider(fetchFn, { maxRetries: 1 }).generateWikiStructured(WIKI_INPUT);
    expect(bodies).toHaveLength(2);
    expect(r.concepts).toHaveLength(1);
  });

  it("전부 실패면 throw — 호출부(runWikiGeneration)가 휴리스틱 폴백", async () => {
    const { bodies, fetchFn } = fetchMock(() => new Response("boom", { status: 500 }));
    await expect(makeProvider(fetchFn, { maxRetries: 0 }).generateWikiStructured(WIKI_INPUT)).rejects.toThrow(
      "HTTP 500",
    );
    expect(bodies).toHaveLength(1);
  });
});
