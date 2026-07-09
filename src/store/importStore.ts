import { create } from "zustand";
import type { ImportJobStatus, WikiPage, ArchiveNote } from "../lib/types";
import * as ipc from "../lib/ipc";
import { runWikiGeneration } from "../llm/generate";
import type { LlmWikiInput, LlmWikiResult } from "../llm/provider";
import { probeExplanation, pickWeakestConcept, type Turn } from "../llm/feynman";
import { applyLlmResult, embedSourceFiles, isSynthesisPage } from "../lib/llmApply";
import { maybeFactCheck } from "../lib/factCheck";
import { chunkOpts } from "../lib/settings";

// ImportJob 상태머신 소유 = TS 오케스트레이터(결정 A). useImportStore 가 상태 전이 + Rust atomic-step
// 커맨드(create_note/save_wiki/append_relations) + LLM 어댑터 호출을 조율한다.
// 전이: parsing → archiving → llm_processing → [clarify_pending → llm_processing(2차)] → writing → completed | failed.
//
// clarify(되묻기) = 파인만식. 1차 생성이 개념 목록을 주면 가장 취약한 개념 하나를 골라
// 사용자에게 "자기 말로 설명해보세요" 라고 청한다. 사용자가 쓰면 LLM 이 구멍 하나를 짚어
// 되묻고, 이 루프는 사용자가 [그만] 을 누를 때까지 돈다. 루프 중에는 디스크를 쓰지 않는다.
// 종료 시 사용자가 직접 선언한다: [네, 이해했어요] / [아직 모르겠어요].
// 후자면 review_needed self-loop 를 기록한다 — LLM 이 아니라 사용자가 붙인다(relation-types.md).
// 설계: docs/superpowers/specs/2026-07-10-feynman-clarify-design.md
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
  reviewMarked?: string; // 사용자가 "아직 모르겠어요" 로 표시한 개념 제목
  reviewMissed?: boolean; // 표시하려 했으나 2차 생성 결과에 그 개념이 없어 건너뜀(경고용)
  reviewNoEvidence?: boolean; // 설명을 한 번도 안 써서 표시할 근거가 없음(evidence ≥ 1 계약)
  clarifySkipped?: boolean; // 되묻기를 켰으나 키가 없어 건너뜀 — 조용히 넘기지 않는다
  regenDowngraded?: boolean; // 2차 생성이 실패해 휴리스틱으로 떨어짐 → 1차 결과를 지켰다
}

/** 파인만 되묻기 루프의 상태. 디스크에 쓰지 않는 메모리 전용. */
export interface FeynmanState {
  concept: string | null; // 지금 설명 중인 개념
  candidates: string[]; // [다른 개념으로] 후보
  history: Turn[]; // 설명 ↔ 되물음
  probing: boolean; // LLM 되묻는 중
  error?: string; // 되묻기 실패(재시도 가능) — 대화는 보존한다
}

const EMPTY_FEYNMAN: FeynmanState = { concept: null, candidates: [], history: [], probing: false };

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
  engine: "gemini" | "heuristic";
  params: RunImportParams;
}

interface ImportState {
  job: ImportJobView | null;
  pending: Pending | null;
  feynman: FeynmanState;
  runImport: (p: RunImportParams) => Promise<ImportJobView>;
  /** 사용자가 설명을 제출 → LLM 이 구멍 하나를 짚어 되묻는다. 디스크 안 씀. */
  explain: (text: string) => Promise<void>;
  /** 되묻기 실패 후 재시도 — 설명은 history 에 이미 있으므로 다시 타이핑하지 않는다. */
  retryProbe: () => Promise<void>;
  /** 대상 개념을 갈아탄다. 대화는 개념마다 새로 시작한다. */
  switchConcept: (title: string) => void;
  /** [그만] — understood=false 면 review_needed self-loop 를 기록한다. */
  finishFeynman: (understood: boolean) => Promise<ImportJobView>;
  clear: () => void;
}

/** llm-output-schema.md §중복 병합 규칙과 같은 정규화. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

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
function buildInput(note: ArchiveNote, existing: WikiPage[]): LlmWikiInput {
  return {
    sourceTitle: note.title,
    sourceText: note.markdown,
    // 노트가 참조하는 원본 파일 — 없으면 sanitizeSourceRefs 가 모든 sourceRefs 를 제거한다.
    sourceFiles: embedSourceFiles(note.sourceId, note.markdown),
    subjects: note.subjectIds.map((id) => ({ id, name: id })),
    // 정리 글(합성) 페이지는 개념이 아니다 — 중복 힌트에서 제외.
    existingConcepts: existing
      .filter((w) => !isSynthesisPage(w))
      .map((w) => ({ id: w.conceptId, title: w.title, normalizedTitle: w.title.toLowerCase() })),
  };
}

export const useImportStore = create<ImportState>((set, get) => {
  const commit = (j: ImportJobView) => {
    const s = save(j);
    set({ job: s });
    return s;
  };

  // writing → completed 공통 단계. 저장 직전 Liner fact-check(설정 게이트, advisory).
  // 생성된 위키를 함께 돌려준다 — review_needed 를 붙일 conceptId 가 여기에만 있다.
  const writeAndComplete = async (
    job: ImportJobView,
    result: LlmWikiResult,
    engine: "gemini" | "heuristic",
    note: ArchiveNote,
    p: RunImportParams,
    extra?: Partial<ImportJobView>,
  ): Promise<{ job: ImportJobView; pages: WikiPage[] }> => {
    commit({ ...job, status: "writing", engine });
    const fc = await maybeFactCheck(result);
    const applied = await applyLlmResult(
      p.space,
      p.spaceId,
      note.subjectIds,
      fc.result,
      { sourceId: note.sourceId, archivePath: `archive/${note.path}` },
      p.existing,
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
    return { job: done, pages: applied.pages };
  };

  // 되묻기 1회. explain/retryProbe 공통.
  // 응답이 늦게 도착했을 때(개념 전환·[그만] 이후) stale 대화를 되살리면 안 된다 → concept 대조.
  const runProbe = async (concept: string, note: string, history: Turn[]) => {
    const fresh = () => get().feynman.concept === concept;
    try {
      const { probe } = await probeExplanation(concept, note, history, apiKey());
      if (!fresh()) return;
      set((s) => ({ feynman: { ...s.feynman, history: [...history, { role: "probe", text: probe }], probing: false } }));
    } catch (e) {
      if (!fresh()) return;
      // 사용자가 쓴 설명은 history 에 그대로 둔다 — retryProbe 로 재타이핑 없이 다시 시도한다.
      set((s) => ({ feynman: { ...s.feynman, history, probing: false, error: String(e) } }));
    }
  };

  return {
    job: typeof localStorage !== "undefined" ? loadLast() : null,
    pending: null,
    feynman: EMPTY_FEYNMAN,
    clear: () => set({ job: null, pending: null, feynman: EMPTY_FEYNMAN }),

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

        // 파인만 되묻기 분기 — 저장 전에 사용자가 개념을 자기 말로 설명하게 한다.
        // 키가 없으면(engine==="heuristic") 되묻기를 만들 수 없다. 있는 척하지 않고 건너뛴다.
        const candidates = result.concepts.map((c) => c.title);
        if (p.clarify && engine === "gemini" && candidates.length > 0) {
          const concept = pickWeakestConcept(candidates, note.markdown);
          if (concept) {
            set({
              pending: { result, input, note, engine, params: p },
              feynman: { concept, candidates, history: [], probing: false },
            });
            return commit({ ...job, status: "clarify_pending", engine });
          }
        }
        // 되묻기를 켰는데 못 띄웠다면 조용히 넘기지 않는다 — 사용자는 켰다고 믿는다.
        const clarifySkipped = p.clarify && engine !== "gemini";
        return (await writeAndComplete(job, result, engine, note, p, clarifySkipped ? { clarifySkipped } : undefined)).job;
      } catch (e) {
        return commit({ ...job, status: "failed", errorMessage: String(e) });
      }
    },

    explain: async (text) => {
      const { pending, feynman } = get();
      const said = text.trim();
      if (!pending || !feynman.concept || !said || feynman.probing) return;
      const history: Turn[] = [...feynman.history, { role: "user", text: said }];
      set({ feynman: { ...feynman, history, probing: true, error: undefined } });
      await runProbe(feynman.concept, pending.note.markdown, history);
    },

    retryProbe: async () => {
      const { pending, feynman } = get();
      const last = feynman.history[feynman.history.length - 1];
      if (!pending || !feynman.concept || feynman.probing || last?.role !== "user") return;
      set({ feynman: { ...feynman, probing: true, error: undefined } });
      await runProbe(feynman.concept, pending.note.markdown, feynman.history);
    },

    switchConcept: (title) => {
      const { feynman } = get();
      // probing 중 전환하면 늦게 온 응답이 새 개념 아래에 옛 대화를 되살린다.
      if (feynman.probing || !feynman.candidates.includes(title)) return;
      set({ feynman: { ...feynman, concept: title, history: [], probing: false, error: undefined } });
    },

    finishFeynman: async (understood) => {
      const { pending, job, feynman } = get();
      if (!pending || !job) return job ?? ({ id: "none", space: "", title: "", status: "idle" } as ImportJobView);
      const concept = feynman.concept;
      const explanations = feynman.history.filter((t) => t.role === "user").map((t) => t.text);

      try {
        let result = pending.result;
        let engine = pending.engine;
        let regenDowngraded = false;

        // 사용자가 설명을 남겼으면 2차 생성 — 그 설명이 위키의 재료가 된다.
        if (explanations.length > 0) {
          commit({ ...job, status: "llm_processing", engine });
          const transcript = feynman.history
            .map((t) => (t.role === "user" ? `나: ${t.text}` : `되물음: ${t.text}`))
            .join("\n");
          const augmented: LlmWikiInput = {
            ...pending.input,
            // 2차 생성에 대상 개념을 반드시 포함시킨다 — 없으면 review_needed 를 붙일 곳이 사라진다.
            sourceText: `${pending.input.sourceText}\n\n[내가 "${concept}"을(를) 설명해 본 기록]\n${transcript}`,
          };
          const r2 = await runWikiGeneration(augmented, apiKey(), { chunk: chunkOpts() });
          // runWikiGeneration 은 실패를 휴리스틱 폴백으로 삼킨다(generate.ts:62).
          // 그걸 그대로 채택하면 멀쩡한 1차 Gemini 위키가 헤딩 분해 결과로 조용히 대체된다.
          if (r2.engine === "gemini") {
            result = r2.result;
            engine = r2.engine;
          } else {
            regenDowngraded = true; // 1차 결과를 지킨다
          }
        }

        // evidence ≥ 1 이 계약이다(graph.rs). 설명이 없으면 표시할 근거가 없다.
        const noEvidence = !understood && !!concept && explanations.length === 0;
        const marking = !understood && concept && explanations.length > 0;
        const { job: done, pages } = await writeAndComplete(job, result, engine, pending.note, pending.params, {
          ...(regenDowngraded ? { regenDowngraded } : {}),
          ...(noEvidence ? { reviewNoEvidence: true } : {}),
        });

        let final = done;
        if (marking) {
          // conceptId 는 방금 저장된 위키에만 있다. 정규화 제목으로 찾는다.
          const page = pages.find((w) => norm(w.title) === norm(concept!));
          if (page) {
            await ipc.markReviewNeeded(pending.params.space, page.conceptId, pending.note.sourceId, explanations);
            final = commit({ ...done, reviewMarked: concept! });
          } else {
            // 2차 생성이 그 개념을 안 만들었다 — 크래시 금지, 경고만.
            final = commit({ ...done, reviewMissed: true });
          }
        }
        set({ pending: null, feynman: EMPTY_FEYNMAN });
        return final;
      } catch (e) {
        set({ pending: null, feynman: EMPTY_FEYNMAN });
        return commit({ ...job, status: "failed", errorMessage: String(e) });
      }
    },
  };
});
