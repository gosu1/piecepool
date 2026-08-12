import type { LlmConcept } from "./provider";
import { normalizeTitle } from "../lib/normalizeTitle";

// 한 LLM 응답 안에서 같은 개념(정규화 제목 동일)이 두 번 나오면, 저장 단계가 같은 파일 경로에
// 두 번 써서 뒤가 앞을 덮는다(applyLlmResult 의 병렬 saveWikiBatch). 저장 전에 내용을 결합한다 —
// 덮어쓰기가 아니라 summary/explanation/sourceRefs 등 필드 결합이다.
// 판정 키는 normalizeTitle 공용 구현 — 규칙이 어긋나면 여기서 안 접힌 변형이
// slugOrHash 로 같은 경로에 저장돼 유실이 재발한다.

const norm = normalizeTitle;

/** 응답 내 동일 개념을 첫 등장 기준으로 결합한다. 순서는 첫 등장 순서를 보존한다. */
export function mergeDuplicateConcepts(concepts: LlmConcept[]): LlmConcept[] {
  const byNorm = new Map<string, LlmConcept>();
  for (const c of concepts) {
    const k = norm(c.title);
    const prev = byNorm.get(k);
    byNorm.set(k, prev ? mergeConcept(prev, c) : c);
  }
  return [...byNorm.values()];
}

// 제목·요약은 첫 표기를 유지하고, 본문·배열 필드는 중복 없이 결합한다.
function mergeConcept(a: LlmConcept, b: LlmConcept): LlmConcept {
  return {
    ...a,
    aliases: mergeStrs(a.aliases, b.aliases),
    summary: a.summary?.trim() ? a.summary : b.summary,
    explanation: joinTexts(a.explanation, b.explanation),
    examples: mergeStrs(a.examples, b.examples) ?? [],
    sourceRefs: mergeRefs(a.sourceRefs, b.sourceRefs),
    sourceEmbeds: mergeStrs(a.sourceEmbeds, b.sourceEmbeds) ?? [],
    confusingConcepts: mergeStrs(a.confusingConcepts, b.confusingConcepts),
    relatedQuestions: mergeStrs(a.relatedQuestions, b.relatedQuestions),
  };
}

function joinTexts(x?: string, y?: string): string {
  const parts: string[] = [];
  for (const s of [x?.trim(), y?.trim()]) if (s && !parts.includes(s)) parts.push(s);
  return parts.join("\n\n");
}

function mergeStrs(x?: string[], y?: string[]): string[] | undefined {
  if (!x && !y) return undefined;
  return [...new Set([...(x ?? []), ...(y ?? [])])];
}

// toSourceRefs(llmApply)와 같은 (sourceId,file,page,embed) 키로 중복 제거.
function mergeRefs(x: LlmConcept["sourceRefs"], y: LlmConcept["sourceRefs"]): LlmConcept["sourceRefs"] {
  const seen = new Set<string>();
  return [...(x ?? []), ...(y ?? [])].filter((r) => {
    const k = `${r.sourceId}|${r.file}|${r.page ?? ""}|${r.embed}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
