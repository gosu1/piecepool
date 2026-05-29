import type { LlmProvider, LlmWikiInput, LlmWikiResult } from "./provider";

// Premium — Google Gemini (responseSchema). SSOT: docs/30-llm/provider-config.md.
export class GeminiProvider implements LlmProvider {
  id = "gemini" as const;

  async generateWikiStructured(_input: LlmWikiInput): Promise<LlmWikiResult> {
    throw new Error("not implemented — docs/30-llm/provider-config.md");
  }
}
