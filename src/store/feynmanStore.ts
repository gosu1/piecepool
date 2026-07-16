import { create } from "zustand";
import { persist } from "zustand/middleware";
import { probeExplanation, type Turn } from "../llm/feynman";
import { splitFeynmanSection, joinFeynmanSection, bodyHash, type FeynmanSession } from "../lib/feynmanSection";
import type { WikiPage } from "../lib/types";
import * as ipc from "../lib/ipc";

// ══ 위키 파인만 — 페이지 하나(=개념 하나)를 자기 말로 설명하게 한다 ══
//
// 위키 개념은 학습자가 만든 것이 아니다. 그래서 "이해했다"고 넘어가기 전에 자기 말로
// 설명하게 하고, 그 사고 과정을 개념과 같은 파일에 남긴다.
//
// 대화(session)는 메모리 전용이다. 진행 중인 설명은 미완이지 결과가 아니다.
// 디스크에 남는 것은 사용자가 판정을 내린 세션뿐 — 위키 .md 본문의 `## 파인만 기록`.
//
// dismissed 는 "이 페이지에서 나중에 하겠다고 했다"는 이 기기의 표시다. 계약
// (workspace-layout.md)에 없는 파일을 만들 수 없으므로 localStorage 에 둔다.
// 유실되면 자동 열기가 한 번 더 뜰 뿐이다 — 학습 보조 신호이지 보안 경계가 아니다.

interface WikiSession {
  /** 세션마다 새로 매기는 번호. 늦게 온 응답이 어느 세션의 것인지 가리는 유일한 근거다. */
  id: number;
  space: string;
  /** WikiPage.path — rename 에도 불변(commands/wiki.rs:106-107) */
  path: string;
  title: string;
  /** 기록을 걷어낸 본문. probe 입력이자 bodyHash 의 재료. */
  body: string;
  history: Turn[];
  probing: boolean;
  /** finish 진행 중 — 판정 버튼 더블클릭이 readWiki/saveWiki 왕복을 두 번 태우는 걸 막는다. */
  saving?: boolean;
  error?: string;
}

let sessionSeq = 0;

interface FeynmanState {
  session: WikiSession | null;
  /** key = wikiKey(space, path) → 표시한 시각(ISO). 값은 디버깅용이고 판정은 존재 여부로 한다. */
  dismissed: Record<string, string>;
  start: (space: string, page: WikiPage) => void;
  explain: (text: string) => Promise<void>;
  retryProbe: () => Promise<void>;
  /** 사용자 판정 → 위키 본문에 기록을 append 하고 저장. 저장 실패면 세션을 유지한다. */
  finish: (understood: boolean) => Promise<void>;
  /** [나중에]·[닫기] — 세션을 닫고 이 페이지의 자동 열기를 끈다. */
  dismiss: () => void;
}

export const wikiKey = (space: string, path: string) => `${space}::${path}`;

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
      // 늦게 온 응답이 다른 페이지·다른 세션 위에 옛 대화를 되살리면 안 된다 → 세션 번호 대조.
      const runProbe = async (sid: number, s: WikiSession, history: Turn[]) => {
        const fresh = () => get().session?.id === sid;
        try {
          const { probe } = await probeExplanation(s.title, s.body, history, apiKey());
          if (!fresh()) return;
          set((c) => ({
            session: c.session && { ...c.session, history: [...history, { role: "probe", text: probe }], probing: false },
          }));
        } catch (e) {
          if (!fresh()) return;
          // 사용자가 쓴 설명은 history 에 남긴다 — retryProbe 로 재타이핑 없이 다시 시도한다.
          set((c) => ({ session: c.session && { ...c.session, history, probing: false, error: String(e) } }));
        }
      };

      return {
        session: null,
        dismissed: {},

        start: (space, page) => {
          set({
            session: {
              id: ++sessionSeq,
              space,
              path: page.path,
              title: page.title,
              // 기록을 걷어낸 본문만 넘긴다 — 옛 발화가 note 로 들어가면 conversation 과
              // 이중 노출되고, 과거의 옳은 설명을 되물음이 인용하면 그게 곧 답 유출이다.
              body: splitFeynmanSection(page.markdown).body,
              history: [],
              probing: false,
            },
          });
        },

        explain: async (text) => {
          const s = get().session;
          const said = text.trim();
          if (!s || !said || s.probing) return;
          const history: Turn[] = [...s.history, { role: "user", text: said }];
          set({ session: { ...s, history, probing: true, error: undefined } });
          await runProbe(s.id, s, history);
        },

        retryProbe: async () => {
          const s = get().session;
          const last = s?.history[s.history.length - 1];
          if (!s || s.probing || last?.role !== "user") return;
          set({ session: { ...s, probing: true, error: undefined } });
          await runProbe(s.id, s, s.history);
        },

        finish: async (understood) => {
          const s = get().session;
          if (!s || s.probing || s.saving) return;
          set({ session: { ...s, saving: true } });
          // 디스크 최신본 기준 — 메모리 stale 본문이 그 사이 갱신된 본문을 덮지 않는다.
          try {
            const cur = await ipc.readWiki(s.space, s.path);
            const { body, sessions, unparsed } = splitFeynmanSection(cur.markdown);
            const session: FeynmanSession = {
              at: new Date().toISOString(),
              verdict: understood ? "understood" : "not_yet",
              bodyHash: bodyHash(body),
              turns: s.history.map((t) => ({ role: t.role, text: t.text })),
            };
            await ipc.saveWiki(s.space, { ...cur, markdown: joinFeynmanSection(body, [session, ...sessions], unparsed) });
            if (get().session?.id === s.id) set({ session: null });
          } catch (e) {
            // 설명을 잃지 않는다 — 세션을 유지하고 다시 시도하게 한다.
            if (get().session?.id === s.id) set((c) => ({ session: c.session && { ...c.session, saving: false, error: String(e) } }));
          }
        },

        dismiss: () => {
          const s = get().session;
          set((c) => ({
            session: null,
            dismissed: s ? { ...c.dismissed, [wikiKey(s.space, s.path)]: new Date().toISOString() } : c.dismissed,
          }));
        },
      };
    },
    {
      name: "pp-feynman-dismissed",
      version: 1,
      // 진행 중인 대화는 복원하지 않는다 — 재시작 후 미완의 설명이 되살아나면 사용자가
      // 자기가 뭘 하던 중이었는지 알 수 없다. 판정된 기록은 위키 .md 가 갖는다.
      partialize: (s) => ({ dismissed: s.dismissed }),
    },
  ),
);
