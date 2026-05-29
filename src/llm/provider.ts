// LLM 어댑터 계약. 앱(webview) + eval 하니스(npm run eval) 공유 (결정: TS shared adapter).
// SSOT: docs/30-llm/provider-config.md, docs/10-contracts/llm-output-schema.md.

export type ProviderId = "local" | "openai" | "gemini";

// 최소 placeholder. 전체 형태는 provider-config.md(LlmWikiInput) / llm-output-schema.md(LlmWikiResult).
export type LlmWikiInput = {
  sourceTitle: string;
  sourceText: string;
  // TODO: sourceFiles, subjects, existingConcepts — provider-config.md 참조.
};

export type LlmWikiResult = {
  concepts: unknown[];
  relations: unknown[];
  // TODO: 전체 schema — docs/10-contracts/llm-output-schema.md.
};

export interface LlmProvider {
  id: ProviderId;
  generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult>;
}
