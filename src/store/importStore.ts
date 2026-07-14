import { create } from "zustand";
import type { ImportJobStatus, WikiPage, ArchiveNote } from "../lib/types";
import * as ipc from "../lib/ipc";
import { runWikiGeneration } from "../llm/generate";
import { runWikiMerge } from "../llm/mergeWiki";
import type { LlmWikiInput, LlmWikiResult } from "../llm/provider";
import { applyLlmResult, embedSourceFiles, toExistingConcepts, normalizeTitle } from "../lib/llmApply";
import { maybeFactCheck } from "../lib/factCheck";
import { chunkOpts } from "../lib/settings";
import { useFeynmanStore, type SectionStatus } from "./feynmanStore";

// ImportJob 상태머신 소유 = TS 오케스트레이터(결정 A). useImportStore 가 상태 전이 + Rust atomic-step
// 커맨드(create_note/save_wiki/append_relations) + LLM 어댑터 호출을 조율한다.
// 전이: parsing → archiving → llm_processing → writing → completed | failed.
//
// 파인만은 더 이상 이 파이프라인의 한 단계가 아니다 — 사용자가 에디터에서 언제든 여는 도구다
// (섹션을 드래그하거나 [파인만] 을 눌러 글 전체를). 여기서 하는 일은 하나뿐이다:
// 저장 시, 아직 노트가 아니던 초안(inbox:<space>)에서 한 파인만을 진짜 노트로 옮기고(adopt),
// 사용자가 자기 말로 쓴 설명을 위키 생성의 재료로 함께 넣는다. 그러라고 쓰게 한 글이다.
//
// 마지막 job 은 localStorage 에 persist. config/import-jobs.json 디스크 persist 는 후속(쓰기 커맨드 필요).

export interface ImportJobView {
  id: string;
  space: string;
  title: string;
  status: ImportJobStatus;
  errorMessage?: string;
  engine?: "gemini" | "heuristic";
  wikiCount?: number;
  relationCount?: number;
  mergedCount?: number;
  factChecked?: number; // Liner fact-check 로 출처가 붙은 관계 수
  firstWikiPath?: string; // 이번 임포트로 생성/갱신된 첫 위키 경로 — 위키 패널이 방금 만든 위키를 열도록
  noteFile?: string; // 생성/갱신된 archive 노트 파일명 — Inbox 가 바인딩해 이어서 편집(살아있는 노트)
  feynmanUsed?: boolean; // 초안에서 한 파인만의 설명을 위키 생성 재료로 함께 넣었다
}

/** 다른 지식 공간의 개념 — 폴더 간(cross-space) 관계를 만들기 위한 LLM 힌트. */
export interface CrossConcept {
  id: string; // conceptId
  title: string;
  space: string; // 소속 공간 slug (디버그/표시용)
}

export interface RunImportParams {
  space: string;
  spaceId: string;
  title: string;
  markdown: string;
  subjectIds: string[];
  withLlm: boolean;
  existing: WikiPage[];
  /**
   * 다른 공간의 개념들. LLM 입력에 함께 넣어 폴더를 넘나드는 관계를 만들게 한다.
   * existing 과 달리 병합(merge) 대상이 아니다 — 저장은 언제나 이 공간에만 한다.
   * 그래프 "전체 과목" 뷰가 전 공간 관계를 병합해 그리므로, 여기 저장된 교차 관계가 다리로 보인다.
   */
  crossConcepts?: CrossConcept[];
  /** 살아있는 노트 — 이미 저장된 노트의 파일명. 있으면 새로 만들지 않고 그 노트를 갱신한다(재저장 중복 방지). */
  noteFile?: string;
  /** 저장 전 초안에서 한 파인만의 노트 id (inbox:<space>) — 저장되면 진짜 sourceId 로 옮긴다 */
  feynmanNoteId?: string;
}

interface ImportState {
  job: ImportJobView | null;
  runImport: (p: RunImportParams) => Promise<ImportJobView>;
  clear: () => void;
}

/** 파인만에서 사용자가 쓴 설명을 위키 생성 입력에 덧댈 블록으로 만든다. 없으면 null. */
function feynmanTranscript(statuses: SectionStatus[]): string | null {
  const said = statuses.filter((s) => s.explanations.length > 0);
  if (!said.length) return null;
  return said
    .map((s) => `[내가 "${s.title}" 을(를) 설명해 본 기록]\n${s.explanations.map((e) => `나: ${e}`).join("\n")}`)
    .join("\n\n");
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
  return (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
}
function buildInput(note: ArchiveNote, existing: WikiPage[], cross?: CrossConcept[]): LlmWikiInput {
  // 이 공간의 기존 개념 — 중복 병합(dedup) 힌트이자 관계 대상.
  const own = toExistingConcepts(existing);
  // 다른 공간의 개념 — 폴더 간 관계를 만들라고 함께 넘긴다. 같은 제목이면 conceptId 가 같으므로
  // (concept-{제목slug}) normalizedTitle 로 중복을 접는다. resolve 와 같은 normalizeTitle 을 써야 매칭된다.
  const seen = new Set(own.map((c) => c.normalizedTitle));
  const foreign = (cross ?? [])
    .map((c) => ({ id: c.id, title: c.title, normalizedTitle: normalizeTitle(c.title) }))
    .filter((c) => c.normalizedTitle && !seen.has(c.normalizedTitle) && seen.add(c.normalizedTitle));

  return {
    sourceTitle: note.title,
    sourceText: note.markdown,
    // 노트가 참조하는 원본 파일 — 없으면 sanitizeSourceRefs 가 모든 sourceRefs 를 제거한다.
    sourceFiles: embedSourceFiles(note.sourceId, note.markdown),
    subjects: note.subjectIds.map((id) => ({ id, name: id })),
    existingConcepts: [...own, ...foreign],
  };
}

export const useImportStore = create<ImportState>((set) => {
  const commit = (j: ImportJobView) => {
    const s = save(j);
    set({ job: s });
    return s;
  };

  // writing → completed 공통 단계. 저장 직전 Liner fact-check(설정 게이트, advisory).
  const writeAndComplete = async (
    job: ImportJobView,
    result: LlmWikiResult,
    engine: "gemini" | "heuristic",
    note: ArchiveNote,
    p: RunImportParams,
    extra?: Partial<ImportJobView>,
  ): Promise<ImportJobView> => {
    commit({ ...job, status: "writing", engine });
    const fc = await maybeFactCheck(result);
    const applied = await applyLlmResult(
      p.space,
      p.spaceId,
      note.subjectIds,
      fc.result,
      { sourceId: note.sourceId, archivePath: `archive/${note.path}`, title: note.title },
      p.existing,
      {
        // 본문 축적(방식 A) — 기존 개념에 얹힐 때만 2차 LLM 호출로 통합한다.
        mergeMarkdown: (md, c, src) => runWikiMerge(md, c, src, apiKey()),
        // 폴더 간 관계용 타 공간 개념 — 관계 resolve 에만 쓰이고 위키 저장/병합엔 영향 없다.
        cross: p.crossConcepts,
      },
    );
    const done = commit({
      ...job,
      status: "completed",
      engine,
      wikiCount: applied.pages.length,
      relationCount: applied.relationCount,
      mergedCount: applied.merged,
      factChecked: fc.checked,
      firstWikiPath: applied.pages[0]?.path,
      ...extra,
    });
    return done;
  };

  return {
    job: typeof localStorage !== "undefined" ? loadLast() : null,
    clear: () => set({ job: null }),

    runImport: async (p) => {
      let job: ImportJobView = { id: `job-${Date.now()}`, space: p.space, title: p.title, status: "parsing" };
      commit(job);
      try {
        job = commit({ ...job, status: "archiving" });
        // 살아있는 노트 — noteFile 이 있으면 새로 만들지 않고 그 노트를 갱신한다(재저장 시 archive 중복 방지).
        const note = p.noteFile
          ? await ipc.saveNote(p.space, p.noteFile, p.markdown, p.title)
          : await ipc.createNote(p.space, p.title, p.markdown, p.subjectIds);
        // 생성/갱신된 노트 파일명을 job 에 실어 Inbox 가 바인딩하게 한다(이후 모든 return 에 전파).
        job = { ...job, noteFile: note.path };

        // 초안에서 한 파인만을 방금 생긴 노트로 옮긴다. 저장 여부와 무관하게 사용자의 판정은
        // 그 글에 대한 것이었으므로, LLM 을 켰든 껐든 옮긴다.
        const adopted = p.feynmanNoteId
          ? useFeynmanStore.getState().adopt(p.feynmanNoteId, note.sourceId)
          : [];

        if (!p.withLlm) {
          commit({ ...job, status: "writing" });
          return commit({ ...job, status: "completed" });
        }

        job = commit({ ...job, status: "llm_processing" });
        const input = buildInput(note, p.existing, p.crossConcepts);
        // 사용자가 자기 말로 쓴 설명을 위키의 재료로 넣는다 — 원문(archive)은 건드리지 않는다.
        const transcript = feynmanTranscript(adopted);
        if (transcript) input.sourceText = `${input.sourceText}\n\n${transcript}`;

        const { result, engine } = await runWikiGeneration(input, apiKey(), { chunk: chunkOpts() });
        return writeAndComplete(job, result, engine, note, p, transcript ? { feynmanUsed: true } : undefined);
      } catch (e) {
        return commit({ ...job, status: "failed", errorMessage: String(e) });
      }
    },
  };
});
