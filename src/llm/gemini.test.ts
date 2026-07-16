import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildMessages,
  getGeminiModel,
  setGeminiModel,
  GEMINI_MODEL,
  TASK_MODELS,
  taskModel,
  GeminiProvider,
} from "./gemini";
import type { LlmConcept, LlmRelation, LlmWikiInput } from "./provider";

const INPUT = { sourceId: "s1", sourceTitle: "T", sourceText: "본문" } as unknown as LlmWikiInput;

// @types/node 없이 process.env 접근 (readEnv 와 같은 캐스트).
const nodeEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe("buildMessages — 위키 생성 언어 directive", () => {
  it("ko(기본) — system에 혼용 규칙 + JSON 지시 유지", () => {
    const m = buildMessages(INPUT, "wikiConcepts");
    expect(m[0].role).toBe("system");
    expect(m[0].content).toContain("LlmWikiResult");
    expect(m[0].content).toContain("원문 표기를 그대로");
    expect(m[1].content).toContain("본문");
  });

  it("en — English 지시", () => {
    const m = buildMessages(INPUT, "wikiConcepts", "en");
    expect(m[0].content).toContain("Write all prose in English");
    expect(m[0].content).not.toContain("서술은 한국어로 쓴다");
  });
});

describe("buildMessages — 2단 호출 단계 규칙", () => {
  it("wikiConcepts — 개념만 뽑고 relations 는 비우라고 지시", () => {
    const m = buildMessages(INPUT, "wikiConcepts");
    expect(m[0].content).toContain('"relations": []');
  });

  it("wikiRelations — 관계만 + 주어진 제목 고정 + concepts 비움, user 에 newConcepts", () => {
    const m = buildMessages({ ...INPUT, newConcepts: [{ title: "TCP", summary: "s" }] }, "wikiRelations");
    expect(m[0].content).toContain('"concepts": []');
    expect(m[0].content).toContain("newConcepts");
    expect(m[1].content).toContain("TCP");
  });
});

// Map 백엔드 fake localStorage — node vitest 환경엔 없으므로 주입 (settings.test.ts와 동형).
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe("getGeminiModel — 설정 모델 선택", () => {
  const g = globalThis as { localStorage?: Storage };
  beforeEach(() => {
    g.localStorage = new FakeStorage() as unknown as Storage;
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("미설정이면 기본값(3.5 flash)", () => {
    expect(getGeminiModel()).toBe(GEMINI_MODEL);
  });

  it("설정하면 그 모델, 재조회도 유지", () => {
    setGeminiModel("gemini-3.1-flash-lite");
    expect(getGeminiModel()).toBe("gemini-3.1-flash-lite");
  });

  it("목록에 없는 값(옛 단종 모델 등)은 기본값으로 폴백", () => {
    localStorage.setItem("gemini-model", "gemini-2.5-flash");
    expect(getGeminiModel()).toBe(GEMINI_MODEL);
  });

  it("localStorage 없는 환경(CLI·eval)에서도 기본값", () => {
    delete g.localStorage;
    expect(getGeminiModel()).toBe(GEMINI_MODEL);
  });
});

describe("taskModel — 임포트 파이프라인 고정 라우팅", () => {
  const g = globalThis as { localStorage?: Storage };
  afterEach(() => {
    delete g.localStorage;
    delete nodeEnv.PIECEPOOL_LLM_MODEL;
  });

  it("설정 피커와 무관 — 피커를 3.5 로 바꿔도 요약은 lite", () => {
    g.localStorage = new FakeStorage() as unknown as Storage;
    setGeminiModel("gemini-3.5-flash");
    expect(taskModel("summary")).toBe(TASK_MODELS.summary);
    expect(TASK_MODELS.summary).toBe("gemini-3.1-flash-lite");
  });

  it("PIECEPOOL_LLM_MODEL(env) 이 전 태스크를 덮는다 (CLI·eval)", () => {
    nodeEnv.PIECEPOOL_LLM_MODEL = "gemini-env-pinned";
    expect(taskModel("wikiRelations")).toBe("gemini-env-pinned");
  });
});

// ── GeminiProvider 2단 호출 — fetch mock 이 요청 body(model·messages)를 기록한다 ──

const WIKI_INPUT: LlmWikiInput = {
  sourceTitle: "OS 노트",
  sourceText: "프로세스와 스레드",
  subjects: [],
  existingConcepts: [],
};

function concept(title: string): LlmConcept {
  return { title, summary: `${title} 요약`, explanation: "설명", examples: [], sourceRefs: [], sourceEmbeds: [] };
}

function relation(s: string, t: string): LlmRelation {
  return {
    sourceConceptTitle: s,
    targetConceptTitle: t,
    relationType: "prerequisite",
    strength: 0.8,
    confidence: 0.9,
    explanation: "근거",
    evidence: [{ sourceId: "src-1", reason: "본문 근거" }],
  };
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

describe("GeminiProvider — 태스크 라우팅 2단 호출", () => {
  const OK = (call: number) =>
    call === 0
      ? chatJson({ concepts: [concept("프로세스"), concept("스레드")], relations: [] })
      : chatJson({ concepts: [], relations: [relation("프로세스", "스레드")] });

  afterEach(() => {
    delete nodeEnv.PIECEPOOL_LLM_MODEL;
  });

  it("① 개념=lite, ② 관계=3.5 — 합친 결과가 정규화를 통과한다", async () => {
    const { bodies, fetchFn } = fetchMock(OK);
    const r = await makeProvider(fetchFn).generateWikiStructured(WIKI_INPUT);
    expect(bodies.map((b) => b.model)).toEqual([TASK_MODELS.wikiConcepts, TASK_MODELS.wikiRelations]);
    expect(r.concepts.map((c) => c.title)).toEqual(["프로세스", "스레드"]);
    expect(r.relations).toHaveLength(1);
  });

  it("② payload 에 ①의 개념(제목+요약)이 newConcepts 로 실리고, 단계 규칙이 system 에 들어간다", async () => {
    const { bodies, fetchFn } = fetchMock(OK);
    await makeProvider(fetchFn).generateWikiStructured(WIKI_INPUT);
    const user = JSON.parse(bodies[1].messages[1].content) as { newConcepts?: unknown };
    expect(user.newConcepts).toEqual([
      { title: "프로세스", summary: "프로세스 요약" },
      { title: "스레드", summary: "스레드 요약" },
    ]);
    expect(bodies[0].messages[0].content).toContain('"relations": []');
    expect(bodies[1].messages[0].content).toContain('"concepts": []');
  });

  it("②가 concepts 를 채워 보내도 버린다 — phantom 참조 관계는 정규화가 제거", async () => {
    const { fetchFn } = fetchMock((call) =>
      call === 0
        ? chatJson({ concepts: [concept("프로세스")], relations: [] })
        : chatJson({ concepts: [concept("팬텀")], relations: [relation("프로세스", "팬텀")] }),
    );
    const r = await makeProvider(fetchFn).generateWikiStructured(WIKI_INPUT);
    expect(r.concepts.map((c) => c.title)).toEqual(["프로세스"]);
    expect(r.relations).toHaveLength(0);
  });

  it("config.model 주입은 두 호출 모두 덮는다", async () => {
    const { bodies, fetchFn } = fetchMock(OK);
    await makeProvider(fetchFn, { model: "gemini-pinned" }).generateWikiStructured(WIKI_INPUT);
    expect(bodies.map((b) => b.model)).toEqual(["gemini-pinned", "gemini-pinned"]);
  });

  it("env PIECEPOOL_LLM_MODEL 도 두 호출 모두 덮는다 (envConfig 경유)", async () => {
    nodeEnv.PIECEPOOL_LLM_MODEL = "gemini-env-pinned";
    const { bodies, fetchFn } = fetchMock(OK);
    await makeProvider(fetchFn).generateWikiStructured(WIKI_INPUT);
    expect(bodies.map((b) => b.model)).toEqual(["gemini-env-pinned", "gemini-env-pinned"]);
  });

  it("① 실패 → throw, ② 는 발화하지 않는다", async () => {
    const { bodies, fetchFn } = fetchMock(() => new Response("boom", { status: 500 }));
    await expect(makeProvider(fetchFn, { maxRetries: 0 }).generateWikiStructured(WIKI_INPUT)).rejects.toThrow(
      "HTTP 500",
    );
    expect(bodies).toHaveLength(1);
  });

  it("② 실패 → throw (fetch 2회)", async () => {
    const { bodies, fetchFn } = fetchMock((call) =>
      call === 0 ? chatJson({ concepts: [concept("프로세스")], relations: [] }) : new Response("boom", { status: 500 }),
    );
    await expect(makeProvider(fetchFn, { maxRetries: 0 }).generateWikiStructured(WIKI_INPUT)).rejects.toThrow(
      "HTTP 500",
    );
    expect(bodies).toHaveLength(2);
  });

  it("재시도는 단계별 — ① 스키마 위반 1회 후 성공하면 ② 로 진행", async () => {
    const { bodies, fetchFn } = fetchMock((call) => (call === 0 ? chatJson({}) : OK(call - 1)));
    const r = await makeProvider(fetchFn, { maxRetries: 1 }).generateWikiStructured(WIKI_INPUT);
    expect(bodies.map((b) => b.model)).toEqual([
      TASK_MODELS.wikiConcepts,
      TASK_MODELS.wikiConcepts,
      TASK_MODELS.wikiRelations,
    ]);
    expect(r.concepts).toHaveLength(2);
  });
});
