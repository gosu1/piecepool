import type { LlmProvider, ProviderId } from "./provider";
import { GeminiProvider } from "./gemini";

// Provider 선택 — Gemini 단일. SSOT: docs/30-llm/provider-config.md §provider 선택.
export function selectProvider(_id: ProviderId): LlmProvider {
  return new GeminiProvider();
}

export type { LlmProvider, LlmWikiInput, LlmWikiResult, ProviderId } from "./provider";
