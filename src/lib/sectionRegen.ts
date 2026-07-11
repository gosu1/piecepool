import { runWikiGeneration } from "../llm/generate";
import type { LlmWikiInput } from "../llm/provider";
import { applyLlmResult, embedSourceFiles, isSynthesisPage, normalizeTitle, type ApplyResult } from "./llmApply";
import { maybeFactCheck } from "./factCheck";
import { chunkOpts } from "./settings";
import type { SectionTopic } from "./noteSections";
import type { ArchiveNote, WikiPage } from "./types";

// ══ "이해했어요" → 그 섹션의 위키를 사용자의 설명으로 다시 쓴다 ══
//
// 사용자가 자기 말로 설명한 그 글이 위키의 재료가 된다. 그러라고 쓰게 한 것이다.
// 노트 원문(archive/)은 건드리지 않는다 — 위키만 바뀐다.
//
// 스코프는 그 섹션이다. 노트 전체를 다시 넣으면 상관없는 개념까지 새로 만들어져,
// "이 섹션을 이해했다" 는 행동이 노트 전체를 흔드는 부작용을 낳는다.

export interface RegenResult {
  applied: ApplyResult | null;
  /** Gemini 가 아니라 휴리스틱으로 떨어졌다 → 적용하지 않았다(기존 위키를 지켰다) */
  downgraded: boolean;
}

export async function regenerateSectionWiki(p: {
  space: string;
  spaceId: string;
  note: ArchiveNote;
  topic: SectionTopic;
  /** 사용자가 자기 말로 쓴 설명 (LLM 의 되물음은 넣지 않는다) */
  explanations: string[];
  existing: WikiPage[];
  apiKey: string;
}): Promise<RegenResult> {
  const transcript = p.explanations.map((e) => `나: ${e}`).join("\n");
  const input: LlmWikiInput = {
    sourceTitle: p.note.title,
    sourceText: `${p.topic.text}\n\n[내가 "${p.topic.title}" 을(를) 설명해 본 기록]\n${transcript}`,
    sourceFiles: embedSourceFiles(p.note.sourceId, p.note.markdown),
    subjects: p.note.subjectIds.map((id) => ({ id, name: id })),
    // 기존 개념을 힌트로 준다 — 같은 개념이면 새로 만들지 않고 그 위키에 병합된다(llmApply byNorm).
    existingConcepts: p.existing
      .filter((w) => !isSynthesisPage(w))
      .map((w) => ({ id: w.conceptId, title: w.title, normalizedTitle: normalizeTitle(w.title) })),
  };

  const { result, engine } = await runWikiGeneration(input, p.apiKey, { chunk: chunkOpts() });
  // runWikiGeneration 은 실패를 휴리스틱 폴백으로 삼킨다. 그걸 그대로 적용하면 멀쩡한 위키가
  // 헤딩 분해 결과로 조용히 대체된다 — 사용자는 "이해했다" 고 했는데 위키가 나빠진다.
  if (engine !== "gemini") return { applied: null, downgraded: true };

  const fc = await maybeFactCheck(result);
  const applied = await applyLlmResult(
    p.space,
    p.spaceId,
    p.note.subjectIds,
    fc.result,
    { sourceId: p.note.sourceId, archivePath: `archive/${p.note.path}` },
    p.existing,
  );
  return { applied, downgraded: false };
}
