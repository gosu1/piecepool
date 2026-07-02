import { create } from "zustand";
import type { ArchiveNote, WikiPage } from "../lib/types";
import * as ipc from "../lib/ipc";
import { runSynthesis, SynthesisStreamError } from "../llm/synthesize";
import { synthesisPage } from "../lib/llmApply";

// 정리 글(합성) 변환 job — ImportJob 이 아니다(entities.md 상태머신 오염 금지, 별도 상태).
// SSOT: docs/40-frontend/screens/convert.md §3. 스토어 소유라 탭 전환에도 스트림이 계속되고
// StatusBar 가 직접 구독한다(importStore 패턴). 비종결 job 은 복원 의미가 없어 persist 하지 않는다.

export type ConvertStatus = "idle" | "streaming" | "saving" | "done" | "cancelled" | "failed";

export interface ConvertJob {
  space: string;
  notePath: string; // job 정체성 — 미리보기는 이 노트의 화면에서만 렌더
  noteTitle: string;
  sourceId: string;
  status: ConvertStatus;
  text: string; // 스로틀된 스트리밍 텍스트 스냅샷
  engine?: "openai" | "heuristic";
  warning?: string;
  error?: string;
  wikiPath?: string; // done 시 "열기" 대상
}

export interface RunConvertParams {
  space: string;
  spaceId: string;
  note: ArchiveNote;
  existing: WikiPage[];
}

interface ConvertState {
  job: ConvertJob | null;
  runConvert: (p: RunConvertParams) => Promise<void>;
  cancel: () => void; // 스트림만 중단 — 병렬 실행 중인 개념 추출은 계속(비파괴적)
  clear: () => void;
}

const RUNNING: ConvertStatus[] = ["streaming", "saving"];
const FLUSH_MS = 100; // react-markdown 전체 재파싱 방어 — 초당 10회면 충분

// 모듈 스코프(React 구독 대상 아님): 중단 컨트롤러 + 스로틀 버퍼.
let ac: AbortController | null = null;
let latest = "";
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function apiKey(): string {
  return (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
}

export const useConvertStore = create<ConvertState>((set, get) => {
  const patch = (p: Partial<ConvertJob>) => {
    const job = get().job;
    if (job) set({ job: { ...job, ...p } });
  };
  const stopFlush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
  };
  const onDelta = (full: string) => {
    latest = full;
    if (!flushTimer)
      flushTimer = setTimeout(() => {
        flushTimer = null;
        patch({ text: latest });
      }, FLUSH_MS);
  };

  return {
    job: null,

    clear: () => {
      const j = get().job;
      if (j && RUNNING.includes(j.status)) return; // 진행 중엔 닫기 금지 — 취소 먼저
      set({ job: null });
    },

    cancel: () => {
      if (get().job?.status === "streaming") ac?.abort();
    },

    runConvert: async (p) => {
      const cur = get().job;
      if (cur && RUNNING.includes(cur.status)) return; // single-flight (버튼 disable 의 백스톱)
      ac = new AbortController();
      latest = "";
      set({
        job: {
          space: p.space,
          notePath: p.note.path,
          noteTitle: p.note.title,
          sourceId: p.note.sourceId,
          status: "streaming",
          text: "",
        },
      });
      try {
        const r = await runSynthesis({ sourceTitle: p.note.title, sourceText: p.note.markdown }, apiKey(), {
          onDelta,
          signal: ac.signal,
        });
        stopFlush();
        patch({ text: r.markdown, engine: r.engine, warning: r.warning, status: "saving" });
        const saved = await ipc.saveWiki(p.space, synthesisPage(p.spaceId, p.note, r.markdown, p.existing));
        patch({ status: "done", wikiPath: saved.path });
      } catch (e) {
        stopFlush();
        if (e instanceof Error && e.name === "AbortError") {
          patch({ status: "cancelled", text: latest }); // 부분 텍스트 화면 유지, 저장 없음
        } else if (e instanceof SynthesisStreamError) {
          patch({ status: "failed", text: latest, error: e.message }); // 도중 실패 — 부분 유지, 저장 없음
        } else {
          patch({ status: "failed", error: String(e) });
        }
      } finally {
        ac = null;
      }
    },
  };
});
