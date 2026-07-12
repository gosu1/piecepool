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

/** SourceRef → 본문 임베드 문자열. frontmatter 와 본문이 같은 (file, page) 를 쓰게 하는 단일 규칙. */
export function refEmbed(r: { file: string; page?: number }): string {
  return r.page ? `![[${r.file}#page=${r.page}]]` : `![[${r.file}]]`;
}

// §5(4) — sourceRefs[].sourceId는 호출 입력 Source.id 중 하나여야 한다. 입력에 없는 source를
// 가리키는 (환각) ref는 정규화 단계에서 제거하고 file을 입력값으로 교정한다.
// SSOT: docs/10-contracts/llm-output-schema.md §5(4).
//
// sourceEmbeds 는 모델이 준 문자열을 쓰지 않고 sourceRefs 에서 **파생**한다. 계약이 이 필드를
// "(참고)" 로 표시한 대로, 권위 있는 채널은 sourceRefs 뿐이다 — 파일명이 실제 업로드 원본으로
// 교정되고 환각이 걸러지는 쪽이 여기다. 모델은 두 채널을 동기화하지 않는다(embed: true 라고
// 해놓고 sourceEmbeds: [] 를 주는 응답이 실제로 나왔다). 그러면 frontmatter 는 "임베드하라"는데
// 본문엔 임베드가 없어 "출처와 본문 임베드가 어긋나요" 경고가 뜬다.
// 파생시키면 둘은 구조적으로 일치하고, 그 충돌 자체가 존재할 수 없게 된다.
//
// embed 플래그도 true 로 못박는다. 근거 섹션의 존재 이유가 원본을 보여주는 것인데, 모델의
// embed 선택은 근거 없는 동전던지기였다(한 런은 전부 true, 다른 런은 전부 false). 그 선택에
// 사용자가 PDF 를 볼 수 있는지가 걸려서는 안 된다.
export function sanitizeSourceRefs(
  result: LlmWikiResult,
  input: LlmWikiInput,
): { data: LlmWikiResult; dropped: number } {
  const fileById = new Map((input.sourceFiles ?? []).map((f) => [f.id, f.file]));
  let dropped = 0;

  const concepts = result.concepts.map((c) => {
    const sourceRefs = c.sourceRefs
      .filter((r) => fileById.has(r.sourceId))
      .map((r) => ({ ...r, file: fileById.get(r.sourceId) as string, embed: true }));
    dropped += c.sourceRefs.length - sourceRefs.length;

    const sourceEmbeds = [...new Set(sourceRefs.map(refEmbed))];

    return { ...c, sourceRefs, sourceEmbeds };
  });

  return { data: { concepts, relations: result.relations }, dropped };
}

function normTitle(t: string): string {
  return t.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

// 12행 node-compat 매트릭스 (relation-types.md §6). Rust graph.rs::compat 와 동일 규약을
// 하나의 canonical predicate 로 구현한다(enum 값 복붙 아님 — 로직).
type NodeKind = "concept" | "wikiPage" | "source";
function compat(s: NodeKind, t: NodeKind, rt: string): boolean {
  switch (rt) {
    case "extracted_from":
      return (s === "concept" || s === "wikiPage") && t === "source";
    case "explained_by":
      return s === "concept" && t === "wikiPage";
    case "prerequisite":
    case "part_of":
    case "used_in":
    case "causes":
    case "solves":
    case "contrasts":
    case "confused_with":
      return s === "concept" && t === "concept";
    case "related_to":
      return s === "concept" || s === "wikiPage";
    case "tested_in":
      return s === "concept" && (t === "source" || t === "concept");
    case "review_needed":
      return s === "concept" && t === "concept"; // 자동 경로에서는 아래에서 별도 거부
    default:
      return false;
  }
}

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

  // LLM 관계는 title↔title = Concept→Concept. review_needed 는 사용자 전용(자동 부여 금지),
  // 나머지는 12행 매트릭스의 Concept→Concept 슬라이스로 판별한다.
  const relations = result.relations.filter((r) => {
    if (r.relationType === "review_needed" || !compat("concept", "concept", r.relationType)) {
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
