import type { LlmProvider, ProviderId } from "./provider";
import { OpenAiProvider } from "./openai";

// Provider 선택 — OpenAI 단일. SSOT: docs/30-llm/provider-config.md §provider 선택.
export function selectProvider(_id: ProviderId): LlmProvider {
  return new OpenAiProvider();
}

export type { LlmProvider, LlmWikiInput, LlmWikiResult, ProviderId } from "./provider";
