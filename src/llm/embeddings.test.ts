import { describe, it, expect, afterEach } from "vitest";
import { createGeminiEmbedder } from "./embeddings";
import { GEMINI_OPENAI_ENDPOINT } from "./gemini";

// @types/node 없이 process.env 접근 (readEnv 와 같은 캐스트).
const nodeEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

function urlCapture() {
  const urls: string[] = [];
  const fetchFn = (async (url: unknown) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { urls, fetchFn };
}

describe("createGeminiEmbedder — 엔드포인트", () => {
  afterEach(() => {
    delete nodeEnv.PIECEPOOL_LLM_BASE_URL;
  });

  it("env 미설정이면 Gemini 기본 엔드포인트 (기존 동작 불변)", async () => {
    const { urls, fetchFn } = urlCapture();
    await createGeminiEmbedder({ config: { apiKey: "k" }, fetchFn })(["문장"]);
    expect(urls[0]).toBe(`${GEMINI_OPENAI_ENDPOINT}/embeddings`);
  });

  it("PIECEPOOL_LLM_BASE_URL(env) 가 엔드포인트를 덮는다 (CLI·eval 로컬 LLM)", async () => {
    nodeEnv.PIECEPOOL_LLM_BASE_URL = "http://localhost:11434/v1";
    const { urls, fetchFn } = urlCapture();
    await createGeminiEmbedder({ config: { apiKey: "k" }, fetchFn })(["문장"]);
    expect(urls[0]).toBe("http://localhost:11434/v1/embeddings");
  });

  it("config.endpoint 가 env 보다 우선 (앱 설정 주입)", async () => {
    nodeEnv.PIECEPOOL_LLM_BASE_URL = "http://env:1/v1";
    const { urls, fetchFn } = urlCapture();
    await createGeminiEmbedder({ config: { apiKey: "k", endpoint: "http://app:2/v1" }, fetchFn })(["문장"]);
    expect(urls[0]).toBe("http://app:2/v1/embeddings");
  });
});
