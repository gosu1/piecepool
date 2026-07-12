import { create } from "zustand";
import { persist } from "zustand/middleware";
import { runPdfSummary, PdfSummaryStreamError } from "../llm/pdfsummary";

// Inbox 노트 초안을 스토어로 끌어올린다 — 노트 = 탭 하나(웹 탭 모델)이고, InboxSection 은 다른 탭으로
// 전환하면 언마운트되므로(활성 탭만 렌더) 로컬 useState 면 작성 중이던 노트·스트리밍 요약이 사라진다.
// key = 노트 탭 id(draftKey = `inbox:${space}:${uid}`, 고유). "새 노트" = 새 탭이라 새 key.
// PDF 한국어 요약 job 도 여기 둔다(종결 시 그 노트 body 로 병합 — 응집). drafts 만 persist(재시작 복원);
// 전역 job 은 비영속(AbortController 참조라 리로드 생존 불가). 탭을 닫으면 clear(key).

export type PdfSummaryStatus = "streaming" | "done" | "cancelled" | "failed";

export interface PdfSummaryJob {
  noteKey: string; // 이 노트 탭에만 스트림을 렌더·병합한다
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
  savedFile: string | null; // 바인딩된 archive 노트(있으면 저장 시 갱신)
  savedSpace: string | null; // savedFile 이 사는 공간 — 저장 대상 공간을 바꿨을 때 대조
  savedSnapshot: string | null; // 마지막 저장 시점 스냅샷 — dirty 판정
  panels: { pdf: boolean; wiki: boolean }; // 보조 패널 열림(탭 전환 생존)
  refSource: string; // PDF 패널에 띄운 원본
  refWikiPath: string; // 위키 패널에 띄운 위키
  targetSpace: string; // 저장될 공간(원본도 여기 산다). "" 면 아직 안 정함 → 호출부가 탭의 space 로 폴백
}

export const EMPTY_DRAFT: InboxDraft = {
  title: "",
  body: "",
  savedFile: null,
  savedSpace: null,
  savedSnapshot: null,
  panels: { pdf: false, wiki: false },
  refSource: "",
  refWikiPath: "",
  targetSpace: "",
};

interface InboxDraftState {
  drafts: Record<string, InboxDraft>; // key = 노트 탭 id(draftKey)
  job: PdfSummaryJob | null;
  write: (key: string, patch: Partial<InboxDraft>) => void;
  setTitle: (key: string, title: string) => void;
  setBody: (key: string, body: string) => void;
  appendBody: (key: string, chunk: string) => void;
  clear: (key: string) => void; // 탭 닫힘 — 초안 제거 + 그 탭이 요약 job 소유면 abort
  runSummary: (p: { noteKey: string; file: string; title: string; text: string }) => Promise<void>;
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

export const useInboxDraftStore = create<InboxDraftState>()(
  persist(
    (set, get) => {
      const draftOf = (key: string): InboxDraft => get().drafts[key] ?? EMPTY_DRAFT;
      const putDraft = (key: string, d: InboxDraft) => set((s) => ({ drafts: { ...s.drafts, [key]: d } }));

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

      // 종결: 그 노트 본문 병합 + job 패치를 한 set 으로(중간 렌더에 중복 안 보이게).
      // 소유권 가드: 뒤늦게 도착한 stale finish 가 그 사이 시작된 다른 노트의 job 을 덮어쓰지 않게 noteKey 대조.
      const finish = (noteKey: string, mergeText: string, patch: Partial<PdfSummaryJob>) => {
        if (get().job?.noteKey === noteKey) stopFlush();
        set((s) => {
          const d = s.drafts[noteKey];
          // 초안이 이미 지워졌으면(탭 닫기 중 abort) 부분 텍스트를 되살리지 않는다 — clear 가 job 도 null.
          return {
            drafts: mergeText && d ? { ...s.drafts, [noteKey]: { ...d, body: join(d.body, mergeText) } } : s.drafts,
            job: s.job && s.job.noteKey === noteKey ? { ...s.job, ...patch } : s.job,
          };
        });
      };

      return {
        drafts: {},
        job: null,

        write: (key, patch) => putDraft(key, { ...draftOf(key), ...patch }),
        setTitle: (key, title) => putDraft(key, { ...draftOf(key), title }),
        setBody: (key, body) => putDraft(key, { ...draftOf(key), body }),
        appendBody: (key, chunk) => putDraft(key, { ...draftOf(key), body: join(draftOf(key).body, chunk) }),

        clear: (key) => {
          if (get().job?.noteKey === key && get().job?.status === "streaming") ac?.abort();
          set((s) => {
            const next = { ...s.drafts };
            delete next[key];
            return { drafts: next, job: s.job?.noteKey === key ? null : s.job };
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
          const myAc = new AbortController();
          ac = myAc;
          latest = "";
          set({ job: { noteKey: p.noteKey, file: p.file, status: "streaming", text: "" } });
          try {
            const r = await runPdfSummary({ sourceTitle: p.title, sourceText: p.text }, apiKey(), {
              onDelta,
              signal: myAc.signal,
            });
            finish(p.noteKey, r.markdown, { status: "done", text: r.markdown, truncated: r.truncated, warning: r.warning });
          } catch (e) {
            if (e instanceof Error && e.name === "AbortError") {
              finish(p.noteKey, latest, { status: "cancelled", text: latest });
            } else if (e instanceof PdfSummaryStreamError) {
              finish(p.noteKey, latest, { status: "failed", text: latest, error: e.message });
            } else {
              finish(p.noteKey, "", { status: "failed", error: e instanceof Error ? e.message : String(e) });
            }
          } finally {
            if (ac === myAc) ac = null; // 내가 시작한 컨트롤러일 때만 정리(다른 노트 요약을 건드리지 않게)
          }
        },
      };
    },
    { name: "piecepool-inbox-drafts", partialize: (s) => ({ drafts: s.drafts }) },
  ),
);
