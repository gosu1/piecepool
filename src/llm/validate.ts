import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import schema from "./schema/llm-wiki-result.schema.json" with { type: "json" };
import type { LlmWikiInput, LlmWikiResult } from "./provider";

// 런타임 JSON Schema 검증. schema는 SSOT(docs/10-contracts/llm-output-schema.md §4)에서
// 생성됨 — npm run gen:llm-schema. 모든 provider 응답은 본 함수 통과 후에만 다음 계층에 노출.
// SSOT: docs/30-llm/provider-config.md §1 (schema 위반 재시도).

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

// §5(4) — sourceRefs[].sourceId는 호출 입력 Source.id 중 하나여야 한다. 입력에 없는 source를
// 가리키는 (환각) ref는 정규화 단계에서 제거하고 file을 입력값으로 교정한다. ref가 사라진
// sourceEmbeds도 함께 정리한다. SSOT: docs/10-contracts/llm-output-schema.md §5(4).
export function sanitizeSourceRefs(
  result: LlmWikiResult,
  input: LlmWikiInput,
): { data: LlmWikiResult; dropped: number } {
  const fileById = new Map((input.sourceFiles ?? []).map((f) => [f.id, f.file]));
  let dropped = 0;

  const concepts = result.concepts.map((c) => {
    const sourceRefs = c.sourceRefs
      .filter((r) => fileById.has(r.sourceId))
      .map((r) => ({ ...r, file: fileById.get(r.sourceId) as string }));
    dropped += c.sourceRefs.length - sourceRefs.length;

    const keptFiles = new Set(sourceRefs.map((r) => r.file));
    const sourceEmbeds = c.sourceEmbeds.filter((e) =>
      [...keptFiles].some((f) => e.includes(f)),
    );

    return { ...c, sourceRefs, sourceEmbeds };
  });

  return { data: { concepts, relations: result.relations }, dropped };
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

// LLM relation은 전부 Concept→Concept(title↔title)이라 node 호환 매트릭스상 아래 타입은 표현
// 불가하거나 금지다: extracted_from(target=Source), explained_by(target=WikiPage),
// review_needed(사용자 전용, LLM 자동 부여 금지). SSOT: docs/10-contracts/relation-types.md §6.
const RELATION_NODE_INVALID = new Set(["extracted_from", "explained_by", "review_needed"]);

// §5(2)(3) — relation 양끝 title이 알려진 Concept(같은 응답 concepts ∪ 기존 workspace)과 일치하고,
// relationType이 node 호환 매트릭스에 부합해야 한다. 위반 edge는 정규화에서 제거한다.
// SSOT: docs/10-contracts/llm-output-schema.md §5(2,3), relation-types.md §6.
export function normalizeRelations(
  result: LlmWikiResult,
  input: LlmWikiInput,
): { data: LlmWikiResult; droppedTitle: number; droppedNode: number } {
  const known = new Set<string>([
    ...result.concepts.map((c) => normTitle(c.title)),
    ...input.existingConcepts.map((c) => c.normalizedTitle),
  ]);
  let droppedTitle = 0;
  let droppedNode = 0;

  const relations = result.relations.filter((r) => {
    if (RELATION_NODE_INVALID.has(r.relationType)) {
      droppedNode++;
      return false;
    }
    if (!known.has(normTitle(r.sourceConceptTitle)) || !known.has(normTitle(r.targetConceptTitle))) {
      droppedTitle++;
      return false;
    }
    return true;
  });

  return { data: { concepts: result.concepts, relations }, droppedTitle, droppedNode };
}

// ajv(§5-1) 이후 의미 정규화(§5-2,3,4) 일괄 적용 + 경고 수집. provider가 raw → SSOT 정규화 시
// 1회 호출한다. SSOT: docs/10-contracts/llm-output-schema.md §5, CLAUDE.md §LLM Output Schema.
export function normalizeLlmResult(
  result: LlmWikiResult,
  input: LlmWikiInput,
): { data: LlmWikiResult; warnings: string[] } {
  const warnings: string[] = [];

  const refs = sanitizeSourceRefs(result, input);
  if (refs.dropped > 0) {
    warnings.push(`sourceRef: dropped ${refs.dropped} ref(s) referencing unknown sources`);
  }

  const rels = normalizeRelations(refs.data, input);
  if (rels.droppedTitle > 0) {
    warnings.push(`relation: dropped ${rels.droppedTitle} edge(s) referencing unknown concept titles`);
  }
  if (rels.droppedNode > 0) {
    warnings.push(`relation: dropped ${rels.droppedNode} edge(s) with node-incompatible relationType`);
  }

  const relations = rels.data.relations;
  if (relations.length > 0) {
    const ratio = relations.filter((r) => r.relationType === "related_to").length / relations.length;
    if (ratio > 0.5) {
      warnings.push(`related_to ratio ${(ratio * 100).toFixed(0)}% > 50% — 관계 다양성 점검 필요`);
    }
  }

  return { data: rels.data, warnings };
}
