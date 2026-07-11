import { create } from "zustand";
import { persist } from "zustand/middleware";
import { probeExplanation, type Turn } from "../llm/feynman";
import type { SectionTopic } from "../lib/noteSections";

// ══ 섹션 단위 파인만 — 노트의 ##/### 주제 하나씩 자기 말로 설명하게 한다 ══
//
// 대화(session)는 메모리 전용이다. 앱을 나가면 사라진다 — 진행 중인 설명은 미완이지
// 결과가 아니다. 디스크/localStorage 에 남는 것은 사용자가 내린 **판정**(statuses)뿐이다.
//
// statuses 는 이 기기의 학습 진행 상태다. 계약(workspace-layout.md)에 없는 파일을
// 만들 수 없으므로 localStorage 에 둔다. 유실되면 "아직 안 함"으로 되돌아간다(fail-closed).
// 학습 보조 신호이지 보안 경계가 아니다 — devtools 로 위조할 수 있다는 뜻이고, 그래도 된다.

export interface SectionStatus {
  /** 주제 제목 — 저장 시 위키 생성 재료로 되살릴 때 필요하다 */
  title: string;
  /** 이 주제에 설명을 한 번 이상 남겼다 */
  answered: boolean;
  /** 사용자가 [네, 이해했어요] 를 눌렀다. 판정은 오직 사용자 — LLM 은 채점하지 않는다. */
  understood: boolean;
  /**
   * 사용자가 자기 말로 쓴 설명. LLM 의 되물음은 담지 않는다.
   * 이건 사용자 소유의 글이고, 저장할 때 위키의 재료가 된다 — 그러라고 쓰게 한 것이다.
   */
  explanations: string[];
  updatedAt: string;
}

/** 아직 저장되지 않은 인박스 초안의 노트 id. 저장되면 adopt() 로 진짜 sourceId 에 옮겨진다. */
export const draftNoteId = (space: string) => `inbox:${space}`;

interface Session {
  /** 세션마다 새로 매기는 번호. 늦게 온 응답이 어느 세션의 것인지 가리는 유일한 근거다. */
  id: number;
  noteId: string; // ArchiveNote.sourceId — 파일 rename 에도 불변
  space: string;
  topics: SectionTopic[];
  idx: number;
  history: Turn[]; // 현재 주제의 대화. 주제가 바뀌면 비운다.
  probing: boolean;
  error?: string;
}

// 같은 노트에서 파인만을 닫았다 다시 열면 noteId·idx 가 그대로다 — 그것만으로는
// 닫힌 세션의 늦은 응답을 걸러낼 수 없다. 세션 번호로 가른다.
let sessionSeq = 0;

interface FeynmanState {
  session: Session | null;
  statuses: Record<string, SectionStatus>; // key = sectionKey(noteId, slug)
  start: (noteId: string, space: string, topics: SectionTopic[]) => void;
  explain: (text: string) => Promise<void>;
  retryProbe: () => Promise<void>;
  /** 사용자 판정 → 기록하고 다음 주제로. 마지막이면 세션 종료. */
  finishTopic: (understood: boolean) => { topic: SectionTopic; explanations: string[] } | null;
  /** 판정 없이 다음 주제로 — 아무것도 기록하지 않는다 */
  skipTopic: () => void;
  cancel: () => void;
  /**
   * 초안(inbox:<space>)에서 한 파인만을 방금 저장된 노트에 옮긴다.
   * 옮기지 않으면 저장하는 순간 사용자가 한 설명이 아무 노트에도 속하지 않게 된다.
   * 옮겨간 판정을 돌려준다 — 호출부가 그 설명을 위키 생성 재료로 쓴다.
   */
  adopt: (fromNoteId: string, toNoteId: string) => SectionStatus[];
}

/** @param key SectionTopic.key (slug 아님 — 같은 제목이 여럿일 수 있다) */
export const sectionKey = (noteId: string, key: string) => `${noteId}::${key}`;

export function hasGeminiKey(): boolean {
  return !!(typeof localStorage !== "undefined" && localStorage.getItem("gemini-key"));
}

function apiKey(): string {
  return (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
}

export const useFeynmanStore = create<FeynmanState>()(
  persist(
    (set, get) => {
      // 되물음 1회. explain/retryProbe 공통.
      // 늦게 온 응답이 다른 주제·다른 세션 위에 옛 대화를 되살리면 안 된다 → 세션 번호 + idx 대조.
      const runProbe = async (sid: number, idx: number, topic: SectionTopic, history: Turn[]) => {
        const fresh = () => {
          const s = get().session;
          return !!s && s.id === sid && s.idx === idx;
        };
        try {
          const { probe } = await probeExplanation(topic.title, topic.text, history, apiKey());
          if (!fresh()) return;
          set((s) => ({
            session: s.session && { ...s.session, history: [...history, { role: "probe", text: probe }], probing: false },
          }));
        } catch (e) {
          if (!fresh()) return;
          // 사용자가 쓴 설명은 history 에 남긴다 — retryProbe 로 재타이핑 없이 다시 시도한다.
          set((s) => ({ session: s.session && { ...s.session, history, probing: false, error: String(e) } }));
        }
      };

      return {
        session: null,
        statuses: {},

        start: (noteId, space, topics) => {
          if (!topics.length) return;
          set({ session: { id: ++sessionSeq, noteId, space, topics, idx: 0, history: [], probing: false } });
        },

        explain: async (text) => {
          const s = get().session;
          const said = text.trim();
          if (!s || !said || s.probing) return;
          const history: Turn[] = [...s.history, { role: "user", text: said }];
          set({ session: { ...s, history, probing: true, error: undefined } });
          await runProbe(s.id, s.idx, s.topics[s.idx], history);
        },

        retryProbe: async () => {
          const s = get().session;
          const last = s?.history[s.history.length - 1];
          if (!s || s.probing || last?.role !== "user") return;
          set({ session: { ...s, probing: true, error: undefined } });
          await runProbe(s.id, s.idx, s.topics[s.idx], s.history);
        },

        finishTopic: (understood) => {
          const s = get().session;
          if (!s || s.probing) return null;
          const topic = s.topics[s.idx];
          const explanations = s.history.filter((t) => t.role === "user").map((t) => t.text);
          // answered 는 사실 그대로 기록한다 — 설명 없이 [이해했어요] 를 눌렀다면 answered=false.
          // 게이트가 무엇을 요구할지는 게이트가 정한다. 스토어는 사실만 남긴다.
          const status: SectionStatus = {
            title: topic.title,
            answered: explanations.length > 0,
            understood,
            explanations,
            updatedAt: new Date().toISOString(),
          };
          const last = s.idx >= s.topics.length - 1;
          set((cur) => ({
            statuses: { ...cur.statuses, [sectionKey(s.noteId, topic.key)]: status },
            session: last ? null : { ...s, idx: s.idx + 1, history: [], probing: false, error: undefined },
          }));
          return { topic, explanations };
        },

        skipTopic: () => {
          const s = get().session;
          if (!s || s.probing) return;
          const last = s.idx >= s.topics.length - 1;
          set({ session: last ? null : { ...s, idx: s.idx + 1, history: [], probing: false, error: undefined } });
        },

        cancel: () => set({ session: null }),

        adopt: (fromNoteId, toNoteId) => {
          const prefix = `${fromNoteId}::`;
          const moved: SectionStatus[] = [];
          const next: Record<string, SectionStatus> = {};
          for (const [k, v] of Object.entries(get().statuses)) {
            if (!k.startsWith(prefix)) {
              next[k] = v;
              continue;
            }
            next[`${toNoteId}::${k.slice(prefix.length)}`] = v;
            moved.push(v);
          }
          if (moved.length) set({ statuses: next });
          return moved;
        },
      };
    },
    {
      name: "pp-feynman-sections",
      version: 1,
      // 진행 중인 대화는 복원하지 않는다 — 재시작 후 미완의 설명이 되살아나면 사용자가
      // 자기가 뭘 하던 중이었는지 알 수 없다. 판정된 결과만 남긴다.
      partialize: (s) => ({ statuses: s.statuses }),
    },
  ),
);

const NOT_YET: SectionStatus = { title: "", answered: false, understood: false, explanations: [], updatedAt: "" };

/**
 * 게이트가 조회하는 공개 인터페이스 — 상태가 없으면 "아직 안 함"이다(fail-closed).
 * @param key SectionTopic.key
 *
 * localStorage 는 사용자가 열어볼 수 있는 곳이다. 손상되거나 손으로 고쳐진 값이 들어와도
 * 게이트가 죽으면 안 된다 — 읽을 수 없으면 "아직 안 함"으로 본다(모르는 것은 안 한 것).
 */
export function getSectionStatus(noteId: string, key: string): SectionStatus {
  const st = useFeynmanStore.getState().statuses;
  const v = st && typeof st === "object" ? st[sectionKey(noteId, key)] : undefined;
  if (!v || typeof v !== "object") return NOT_YET;
  return {
    title: typeof v.title === "string" ? v.title : "",
    answered: v.answered === true,
    understood: v.understood === true,
    explanations: Array.isArray(v.explanations) ? v.explanations.filter((e) => typeof e === "string") : [],
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "",
  };
}
