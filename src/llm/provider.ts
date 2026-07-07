// LLM 어댑터 계약. 앱(webview) + eval 하니스(npm run eval) 공유 (결정: TS shared adapter).
// SSOT: docs/30-llm/provider-config.md(§1 입력), docs/10-contracts/llm-output-schema.md(§1~§3 출력).
// 본 파일 타입은 위 SSOT 문서의 TS 정의를 그대로 실현한다. 런타임 검증 schema는
// docs 문서에서 생성: npm run gen:llm-schema → src/llm/schema/llm-wiki-result.schema.json.

export type ProviderId = "gemini";

// 입력 — provider-config.md §1.
export type LlmWikiInput = {
  sourceTitle: string;
  sourceText: string;
  sourceFiles?: Array<{ id: string; file: string; type: "pdf" | "image" }>;
  subjects: Array<{ id: string; name: string }>;
  existingConcepts: Array<{ id: string; title: string; normalizedTitle: string }>;
  features?: {
    clarify: boolean; // 되묻기 활성
    factCheck: boolean; // fact-check 활성
  };
};

// 출력 — llm-output-schema.md §1~§3 (SSOT). 런타임 enum/필수 강제는 ajv schema가 담당.
export type LlmWikiResult = {
  concepts: LlmConcept[];
  relations: LlmRelation[];
};

export type LlmConcept = {
  title: string;
  aliases?: string[];
  summary: string;
  explanation: string;
  examples: string[];
  sourceRefs: LlmSourceRef[];
  sourceEmbeds: string[];
  confusingConcepts?: string[];
  relatedQuestions?: string[];
};

export type LlmSourceRef = {
  sourceId: string;
  file: string;
  page?: number; // PDF page (1-indexed)
  embed: boolean; // true=![[...]], false=[[...]]
  label?: string;
  reason?: string;
};

export type LlmRelation = {
  sourceConceptTitle: string;
  targetConceptTitle: string;
  // 12종 enum (docs/10-contracts/relation-types.md). 런타임 ajv가 enum을 강제하므로 TS는 string.
  relationType: string;
  strength: number; // 0.0 ~ 1.0
  confidence: number; // 0.0 ~ 1.0
  explanation: string;
  evidence: LlmEvidence[];
};

export type LlmEvidence = {
  sourceId: string;
  archivePath?: string;
  originalFilePath?: string;
  page?: number;
  quote?: string;
  location?: string;
  reason: string;
};

export interface LlmProvider {
  id: ProviderId;
  generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult>;
}
