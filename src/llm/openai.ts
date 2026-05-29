import type { LlmProvider, LlmWikiInput, LlmWikiResult } from "./provider";

// Premium — OpenAI GPT (Responses API, json_schema strict). SSOT: docs/30-llm/provider-config.md.
export class OpenAiProvider implements LlmProvider {
  id = "openai" as const;

  async generateWikiStructured(_input: LlmWikiInput): Promise<LlmWikiResult> {
    throw new Error("not implemented — docs/30-llm/provider-config.md");
  }
}
