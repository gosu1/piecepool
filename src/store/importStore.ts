import { create } from "zustand";
import type { ImportJobStatus, WikiPage, ArchiveNote } from "../lib/types";
import * as ipc from "../lib/ipc";
import { runWikiGeneration } from "../llm/generate";
import type { LlmWikiInput, LlmWikiResult } from "../llm/provider";
import { heuristicGaps, type GapQuestion } from "../llm/gaps";
import { applyLlmResult } from "../lib/llmApply";
import { chunkOpts } from "../lib/settings";

// ImportJob 상태머신 소유 = TS 오케스트레이터(결정 A). useImportStore 가 상태 전이 + Rust atomic-step
// 커맨드(create_note/save_wiki/append_relations) + OpenAI 어댑터 호출을 조율한다.
// 전이: parsing → archiving → llm_processing → [clarify_pending → llm_processing(2차)] → writing → completed | failed.
// clarify(되묻기): 1차 생성 후 간극이 있으면 사용자에게 되묻고, 응답을 2차 입력에 반영한다(무시 시 1차 결과 저장).
// 마지막 job 은 localStorage 에 persist. config/import-jobs.json 디스크 persist 는 후속(쓰기 커맨드 필요).

export interface ImportJobView {
  id: string;
  space: string;
  title: string;
  status: ImportJobStatus;
  errorMessage?: string;
  engine?: "openai" | "heuristic";
  wikiCount?: number;
  relationCount?: number;
  mergedCount?: number;
}

export interface RunImportParams {
  space: string;
  spaceId: string;
  title: string;
  markdown: string;
  subjectIds: string[];
  withLlm: boolean;
  clarify: boolean;
  existing: WikiPage[];
}

interface Pending {
  result: LlmWikiResult;
  input: LlmWikiInput;
  note: ArchiveNote;
  engine: "openai" | "heuristic";
  params: RunImportParams;
}

interface ImportState {
  job: ImportJobView | null;
  pending: Pending | null;
  gaps: GapQuestion[];
  runImport: (p: RunImportParams) => Promise<ImportJobView>;
  respondClarify: (answers: string[] | null) => Promise<ImportJobView>;
  clear: () => void;
}

const KEY = "piecepool-last-import";
function save(j: ImportJobView): ImportJobView {
  try {
    localStorage.setItem(KEY, JSON.stringify(j));
  } catch {
    /* ignore */
  }
  return j;
}
function loadLast(): ImportJobView | null {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "null") as ImportJobView | null;
    // 비종결 상태 복원 금지 — pending/gaps 는 메모리 전용이라 재시작 후 그 상태로는
    // 진행도 취소도 불가능(Inbox 영구 잠금). 종결 상태(completed/failed)만 복원한다.
    if (j && !["completed", "failed"].includes(j.status)) return null;
    return j;
  } catch {
    return null;
  }
}
function apiKey(): string {
  return (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
}
function buildInput(note: ArchiveNote, existing: WikiPage[]): LlmWikiInput {
  return {
    sourceTitle: note.title,
    sourceText: note.markdown,
    subjects: note.subjectIds.map((id) => ({ id, name: id })),
    existingConcepts: existing.map((w) => ({ id: w.conceptId, title: w.title, normalizedTitle: w.title.toLowerCase() })),
  };
}

export const useImportStore = create<ImportState>((set, get) => {
  const commit = (j: ImportJobView) => {
    const s = save(j);
    set({ job: s });
    return s;
  };

  // writing → completed 공통 단계
  const writeAndComplete = async (
    job: ImportJobView,
    result: LlmWikiResult,
    engine: "openai" | "heuristic",
    note: ArchiveNote,
    p: RunImportParams,
  ) => {
    commit({ ...job, status: "writing", engine });
    const applied = await applyLlmResult(
      p.space,
      p.spaceId,
      note.subjectIds,
      result,
      { sourceId: note.sourceId, archivePath: `archive/${note.path}` },
      p.existing,
    );
    return commit({
      ...job,
      status: "completed",
      engine,
      wikiCount: applied.pages.length,
      relationCount: applied.relationCount,
      mergedCount: applied.merged,
    });
  };

  return {
    job: typeof localStorage !== "undefined" ? loadLast() : null,
    pending: null,
    gaps: [],
    clear: () => set({ job: null, pending: null, gaps: [] }),

    runImport: async (p) => {
      let job: ImportJobView = { id: `job-${Date.now()}`, space: p.space, title: p.title, status: "parsing" };
      commit(job);
      try {
        job = commit({ ...job, status: "archiving" });
        const note = await ipc.createNote(p.space, p.title, p.markdown, p.subjectIds);

        if (!p.withLlm) {
          commit({ ...job, status: "writing" });
          return commit({ ...job, status: "completed" });
        }

        job = commit({ ...job, status: "llm_processing" });
        const input = buildInput(note, p.existing);
        const { result, engine } = await runWikiGeneration(input, apiKey(), { chunk: chunkOpts() });

        // clarify(되묻기) 분기 — 간극이 있으면 저장 전 사용자에게 되묻는다
        if (p.clarify) {
          const gaps = heuristicGaps(note.title, note.markdown);
          if (gaps.length > 0) {
            set({ pending: { result, input, note, engine, params: p }, gaps });
            return commit({ ...job, status: "clarify_pending", engine });
          }
        }
        return writeAndComplete(job, result, engine, note, p);
      } catch (e) {
        return commit({ ...job, status: "failed", errorMessage: String(e) });
      }
    },

    respondClarify: async (answers) => {
      const { pending, job, gaps } = get();
      if (!pending || !job) return job ?? ({ id: "none", space: "", title: "", status: "idle" } as ImportJobView);
      try {
        let result = pending.result;
        let engine = pending.engine;
        // 사용자가 응답 → 2차 생성(응답을 입력에 반영). 무시(건너뛰기) → 1차 결과 저장.
        if (answers && answers.some((a) => a.trim())) {
          commit({ ...job, status: "llm_processing", engine });
          const augmented: LlmWikiInput = {
            ...pending.input,
            sourceText:
              pending.input.sourceText +
              "\n\n[사용자 확인 응답]\n" +
              gaps.map((g, i) => `Q: ${g.prompt}\nA: ${answers[i] ?? ""}`).join("\n"),
          };
          const r2 = await runWikiGeneration(augmented, apiKey(), { chunk: chunkOpts() });
          result = r2.result;
          engine = r2.engine;
        }
        const done = await writeAndComplete(job, result, engine, pending.note, pending.params);
        set({ pending: null, gaps: [] });
        return done;
      } catch (e) {
        set({ pending: null, gaps: [] });
        return commit({ ...job, status: "failed", errorMessage: String(e) });
      }
    },
  };
});
