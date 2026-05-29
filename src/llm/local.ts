import type { LlmProvider, LlmWikiInput, LlmWikiResult } from "./provider";

// Free 플랜 — Local Ollama. SSOT: docs/30-llm/provider-config.md §Ollama.
export class LocalProvider implements LlmProvider {
  id = "local" as const;

  async generateWikiStructured(_input: LlmWikiInput): Promise<LlmWikiResult> {
    throw new Error("not implemented — docs/30-llm/provider-config.md");
  }
}
