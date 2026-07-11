import { create } from "zustand";
import { runPdfSummary, PdfSummaryStreamError } from "../llm/pdfsummary";

// Inbox 초안(title/body)을 스토어로 끌어올린다 — InboxSection 은 탭 전환 시 언마운트되므로(활성 탭만 렌더)
// 로컬 useState 면 스트리밍 중/후 요약이 사라진다. 스토어 소유라 스트림 종결 병합이 마운트와 무관하다.
// PDF 한국어 요약 job 도 여기 둔다(종결 시 body 로 병합 — 응집). StatusBar 가 직접 구독. persist 안 함.

export type PdfSummaryStatus = "streaming" | "done" | "cancelled" | "failed";

export interface PdfSummaryJob {
  space: string; // 이 공간의 Inbox 배너에서만 렌더
  file: string; // 저장된 원본 파일명(표시용)
  status: PdfSummaryStatus;
  text: string; // 스로틀된 스트리밍 스냅샷(미확정 — 종결 시 body 로 병합)
  truncated?: boolean;
  warning?: string;
  error?: string;
}

export interface InboxDraft {
  title: string;
  body: string;
}

interface InboxDraftState {
  drafts: Record<string, InboxDraft>; // key = space slug (Inbox 탭 = inbox:${space})
  job: PdfSummaryJob | null;
  setTitle: (space: string, title: string) => void;
  setBody: (space: string, body: string) => void;
  appendBody: (space: string, chunk: string) => void;
  clearDraft: (space: string) => void;
  runSummary: (p: { space: string; file: string; title: string; text: string }) => Promise<void>;
  cancelSummary: () => void;
  clearJob: () => void;
}

const FLUSH_MS = 100; // CM6 전체 교체 방어 — 초당 10회면 충분

// 모듈 스코프(React 구독 대상 아님): 중단 컨트롤러 + 스로틀 버퍼.
let ac: AbortController | null = null;
let latest = "";
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function apiKey(): string {
  return (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
}
const join = (body: string, chunk: string) => (body ? `${body}\n\n${chunk}` : chunk);

export const useInboxDraftStore = create<InboxDraftState>((set, get) => {
  const draftOf = (space: string): InboxDraft => get().drafts[space] ?? { title: "", body: "" };
  const putDraft = (space: string, d: InboxDraft) => set((s) => ({ drafts: { ...s.drafts, [space]: d } }));

  const stopFlush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
  };
  const onDelta = (full: string) => {
    latest = full;
    if (!flushTimer)
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const job = get().job;
        if (job) set({ job: { ...job, text: latest } });
      }, FLUSH_MS);
  };

  // 종결: 초안 본문 병합 + job 패치를 한 set 으로(중간 렌더에 중복 안 보이게).
  const finish = (space: string, mergeText: string, patch: Partial<PdfSummaryJob>) => {
    stopFlush();
    set((s) => {
      const d = s.drafts[space];
      // 초안이 이미 지워졌으면(탭 버림/닫기 중 abort) 부분 텍스트를 되살리지 않는다 — clearDraft 가 job 도 null.
      return {
        drafts: mergeText && d ? { ...s.drafts, [space]: { ...d, body: join(d.body, mergeText) } } : s.drafts,
        job: s.job ? { ...s.job, ...patch } : s.job,
      };
    });
  };

  return {
    drafts: {},
    job: null,

    setTitle: (space, title) => putDraft(space, { ...draftOf(space), title }),
    setBody: (space, body) => putDraft(space, { ...draftOf(space), body }),
    appendBody: (space, chunk) => putDraft(space, { ...draftOf(space), body: join(draftOf(space).body, chunk) }),

    clearDraft: (space) => {
      if (get().job?.space === space && get().job?.status === "streaming") ac?.abort();
      set((s) => {
        const next = { ...s.drafts };
        delete next[space];
        return { drafts: next, job: s.job?.space === space ? null : s.job };
      });
    },

    cancelSummary: () => {
      if (get().job?.status === "streaming") ac?.abort();
    },

    clearJob: () => {
      if (get().job?.status === "streaming") return; // 진행 중엔 취소 먼저
      set({ job: null });
    },

    runSummary: async (p) => {
      if (get().job?.status === "streaming") return; // single-flight (버튼 disable 백스톱)
      ac = new AbortController();
      latest = "";
      set({ job: { space: p.space, file: p.file, status: "streaming", text: "" } });
      try {
        const r = await runPdfSummary({ sourceTitle: p.title, sourceText: p.text }, apiKey(), {
          onDelta,
          signal: ac.signal,
        });
        finish(p.space, r.markdown, { status: "done", text: r.markdown, truncated: r.truncated, warning: r.warning });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          finish(p.space, latest, { status: "cancelled", text: latest });
        } else if (e instanceof PdfSummaryStreamError) {
          finish(p.space, latest, { status: "failed", text: latest, error: e.message });
        } else {
          finish(p.space, "", { status: "failed", error: e instanceof Error ? e.message : String(e) });
        }
      } finally {
        ac = null;
      }
    },
  };
});
