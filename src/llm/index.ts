import type { LlmProvider, ProviderId } from "./provider";
import { LocalProvider } from "./local";
import { OpenAiProvider } from "./openai";
import { GeminiProvider } from "./gemini";

// Provider 선택 — env PIECEPOOL_LLM_PROVIDER. SSOT: docs/30-llm/provider-config.md §provider 선택.
export function selectProvider(id: ProviderId): LlmProvider {
  switch (id) {
    case "openai":
      return new OpenAiProvider();
    case "gemini":
      return new GeminiProvider();
    case "local":
    default:
      return new LocalProvider();
  }
}

export type { LlmProvider, LlmWikiInput, LlmWikiResult, ProviderId } from "./provider";
