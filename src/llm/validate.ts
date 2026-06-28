import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import schema from "./schema/llm-wiki-result.schema.json" with { type: "json" };
import type { LlmWikiResult } from "./provider";

// 런타임 JSON Schema 검증. schema는 SSOT(docs/10-contracts/llm-output-schema.md §4)에서
// 생성됨 — npm run gen:llm-schema. 모든 provider 응답은 본 함수 통과 후에만 다음 계층에 노출.
// SSOT: docs/30-llm/provider-config.md §1, §3.1(Local schema 위반 재시도).

const ajv = new Ajv2020({ allErrors: true });
const validateFn: ValidateFunction<LlmWikiResult> = ajv.compile<LlmWikiResult>(schema);

export type ValidationResult =
  | { valid: true; data: LlmWikiResult; errors: [] }
  | { valid: false; errors: string[] };

export function validateLlmWikiResult(data: unknown): ValidationResult {
  if (validateFn(data)) {
    return { valid: true, data, errors: [] };
  }
  const errors = (validateFn.errors ?? []).map(
    (e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`,
  );
  return { valid: false, errors };
}
