import { create } from "zustand";
import { persist } from "zustand/middleware";
import { probeExplanation, analogyHint, type Turn, type AnalogyHint } from "../llm/feynman";
import { extractFacets, facetCacheKey, type Facet } from "../llm/facets";
import { judgeCoverage, clearOk, type CoverageResult } from "../llm/coverage";
import { splitFeynmanSection, joinFeynmanSection, bodyHash, type FeynmanSession, type FeynmanTurn } from "../lib/feynmanSection";
import type { WikiPage } from "../lib/types";
import * as ipc from "../lib/ipc";
import { useUnderstandingStore } from "./understandingStore";

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
  /** WikiPage.conceptId — 커버리지 승급(이해 안개 hazy→clear)의 키 */
  conceptId: string;
  title: string;
  /** 기록을 걷어낸 본문. probe 입력이자 bodyHash 의 재료. */
  body: string;
  history: Turn[];
  probing: boolean;
  /** finish 진행 중 — 판정 버튼 더블클릭이 readWiki/saveWiki 왕복을 두 번 태우는 걸 막는다. */
  saving?: boolean;
  error?: string;
  /** [아직 모르겠어요] 1단계가 받은 비유 힌트. 세션이 곧 페이지라, 세션과 함께 산다. */
  hint?: AnalogyHint;
  hinting?: boolean;
  hintError?: string;
  /** 커버리지 판정(facet-coverage 설계 §3) — 요점별 대조 결과. 점수가 아니라 거울이다. */
  coverage?: CoverageResult;
  /** 판정에 쓴 facet 목록 — coverage.judgments 의 id → 요점 문장 매핑용 */
  facets?: Facet[];
}

let sessionSeq = 0;

interface FeynmanState {
  session: WikiSession | null;
  /** key = wikiKey(space, path) → 표시한 시각(ISO). 값은 디버깅용이고 판정은 존재 여부로 한다. */
  dismissed: Record<string, string>;
  start: (space: string, page: WikiPage) => void;
  explain: (text: string) => Promise<void>;
  retryProbe: () => Promise<void>;
  /** [아직 모르겠어요] 1단계 — 비유 힌트를 받아 세션에 싣는다. 이미 있으면 다시 부르지 않는다. */
  requestHint: () => Promise<void>;
  /**
   * 사용자 판정 → 위키 본문에 기록을 append 하고 저장. 저장 실패면 세션을 유지한다.
   *
   * **저장된 WikiPage 를 돌려준다** — 스토어는 디스크에만 쓰고 앱의 메모리 사본(`wikiBySlug`)은
   * 모른다. 호출부가 이 반환값으로 그걸 갱신하지 않으면 판정 직후 접힌 카드가 같은 앱 세션에서
   * **영영 안 나타난다**(패널의 page prop 이 stale 인 채로 남는다). saveWikiDoc·toggleWikiSubject
   * 가 저장 후 setWikiBySlug 를 부르는 것과 같은 이유다.
   */
  finish: (understood: boolean) => Promise<WikiPage | null>;
  /** [닫기] — 세션을 닫고 이 페이지의 자동 열기를 끈다. */
  dismiss: () => void;
  /** 위키·공간 삭제로 대상이 사라진 세션 정리 — path 생략이면 그 공간 전체. dismissed 는 남긴다. */
  clearSessionFor: (space: string, path?: string) => void;
  /** 공간 rename 은 slug 까지 바꾼다(rename_space) — 세션·dismissed 의 옛 slug 를 새 slug 로 잇는다. */
  remapSpace: (oldSlug: string, newSlug: string) => void;
}

export const wikiKey = (space: string, path: string) => `${space}::${path}`;

/**
 * 기록에 남길 발화 — 답 없이 매달린 마지막 되물음을 뗀다.
 *
 * 흐름이 `나 → 되묻기 → 나 → 되묻기…` 라 판정 버튼은 항상 되물음 직후에 눌린다. 그대로 저장하면
 * 기록이 물음표로 끝나 복기할 때 "그래서 뭐라고 답했더라" 가 된다. 내 답변으로 끝나야
 * "여기까지 말하고 이해했다고 했구나" 가 읽힌다.
 *
 * 첫 발화는 구조상 항상 사용자 것이다(feynman.ts 가 "질문은 설명 뒤에만" 을 강제한다).
 * [네, 이해했어요] 는 answered 일 때만 열리므로 떼고 나도 사용자 발화가 남는다.
 * [그래도 모르겠어요] 는 설명 없이도 눌린다 — turns 가 빈 not_yet 기록은 "시도조차 못 함"의 기록이다.
 */
function settledTurns(history: Turn[]): FeynmanTurn[] {
  const out = history.map((t) => ({ role: t.role, text: t.text }));
  while (out.length && out[out.length - 1].role === "probe") out.pop();
  return out;
}

export function hasGeminiKey(): boolean {
  return !!(typeof localStorage !== "undefined" && localStorage.getItem("gemini-key"));
}

function apiKey(): string {
  return (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
}

// 커버리지 파이프라인 캐시(앱 세션 한정) — facet 은 위키 버전당 1회(캐시 키 = 본문 해시),
// 판정은 같은 (위키, 설명) 재제출 시 재호출하지 않는다(설계 §1·§5 디바운스).
const facetCache = new Map<string, Facet[]>();
const coverageCache = new Map<string, CoverageResult>();

/** 커버리지 입력 = 이 세션에서 사용자가 말한 설명 전부(멀티턴 누적). */
const userExplanation = (history: Turn[]) =>
  history
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join("\n");

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

      // 커버리지 판정(이해 안개) — 되묻기(runProbe)와 병렬로 돈다. 판정은 부가 신호라 파인만
      // 흐름을 절대 막지 않는다: 실패는 전부 조용한 경고 + 상태 불변(안개 유지, 낙관적 승급 금지).
      // 설계: docs/superpowers/specs/2026-07-26-facet-coverage-design.md.
      const runCoverage = async (sid: number, s: WikiSession, history: Turn[]) => {
        const key = apiKey();
        if (!key) return; // 키 없으면 커버리지도 없다 — 키 오류 안내는 probe 쪽이 이미 한다
        const explanation = userExplanation(history);
        try {
          const ck = facetCacheKey(s.body);
          let facets = facetCache.get(ck);
          if (!facets) {
            facets = await extractFacets(s.body, key);
            facetCache.set(ck, facets);
          }
          if (facets.length === 0) return; // 스텁 위키 — 커버리지 비활성(설계 §5)
          const jk = `${ck}::${facetCacheKey(explanation)}`;
          let result = coverageCache.get(jk);
          if (!result) {
            result = await judgeCoverage(facets, explanation, s.body, key);
            coverageCache.set(jk, result);
          }
          const cur = get().session;
          if (cur?.id !== sid) return;
          // 그 사이 더 새 설명이 제출됐다면 늦은 판정은 버린다 — runProbe 의 세션 대조와 같은 이유.
          if (userExplanation(cur.history) !== explanation) return;
          set((c) => ({ session: c.session && { ...c.session, coverage: result, facets } }));
          // 승급은 결정적 코드(clearOk)만 결정한다 — 복붙·contradicted·문턱 미달이면 보류.
          if (clearOk(result)) void useUnderstandingStore.getState().promote(s.space, s.conceptId);
        } catch (e) {
          // fail-closed — 상태 불변(안개 유지). 세션에 error 를 싣지 않는다(probe 흐름과 무관).
          console.warn(`[coverage] 판정 실패 — 안개 유지: ${e}`);
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
              conceptId: page.conceptId,
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
          // 이전 판정은 걷어낸다 — 새 설명을 판정하는 동안 옛 간극 목록이 남아 있으면 거울이 어긋난다.
          set({ session: { ...s, history, probing: true, error: undefined, coverage: undefined } });
          await Promise.all([runProbe(s.id, s, history), runCoverage(s.id, s, history)]);
        },

        retryProbe: async () => {
          const s = get().session;
          const last = s?.history[s.history.length - 1];
          if (!s || s.probing || last?.role !== "user") return;
          set({ session: { ...s, probing: true, error: undefined } });
          await runProbe(s.id, s, s.history);
        },

        requestHint: async () => {
          const s = get().session;
          if (!s || s.probing || s.saving || s.hinting || s.hint) return;
          set({ session: { ...s, hinting: true, hintError: undefined } });
          // 늦은 힌트가 다른 페이지·닫힌 세션에 붙으면 안 된다 — runProbe 와 같은 가드.
          const fresh = () => get().session?.id === s.id;
          try {
            const hint = await analogyHint(s.title, s.body, apiKey());
            if (!fresh()) return;
            set((c) => ({ session: c.session && { ...c.session, hint, hinting: false } }));
          } catch (e) {
            if (!fresh()) return;
            set((c) => ({ session: c.session && { ...c.session, hinting: false, hintError: String(e) } }));
          }
        },

        finish: async (understood) => {
          const s = get().session;
          if (!s || s.probing || s.saving) return null;
          set({ session: { ...s, saving: true } });
          // 디스크 최신본 기준 — 메모리 stale 본문이 그 사이 갱신된 본문을 덮지 않는다.
          try {
            const cur = await ipc.readWiki(s.space, s.path);
            const { body, sessions, unparsed } = splitFeynmanSection(cur.markdown);
            const session: FeynmanSession = {
              at: new Date().toISOString(),
              verdict: understood ? "understood" : "not_yet",
              bodyHash: bodyHash(body),
              turns: settledTurns(s.history),
            };
            const saved = await ipc.saveWiki(s.space, { ...cur, markdown: joinFeynmanSection(body, [session, ...sessions], unparsed) });
            if (get().session?.id === s.id) set({ session: null });
            // 호출부가 이걸로 wikiBySlug 를 갱신해야 접힌 카드가 화면에 나타난다 — 스토어는 디스크만 안다.
            return saved;
          } catch (e) {
            // 설명을 잃지 않는다 — 세션을 유지하고 다시 시도하게 한다.
            if (get().session?.id === s.id) set((c) => ({ session: c.session && { ...c.session, saving: false, error: String(e) } }));
            return null;
          }
        },

        dismiss: () => {
          const s = get().session;
          set((c) => ({
            session: null,
            dismissed: s ? { ...c.dismissed, [wikiKey(s.space, s.path)]: new Date().toISOString() } : c.dismissed,
          }));
        },

        // 세션은 전역 싱글턴이고 자동 열기 effect 가 세션 존재 시 bail out 한다 — 삭제된 위키·공간의
        // 세션을 안 걷어내면 앱 종료까지 신규 개념 파인만 자동 열기가 전부 막힌다. dismiss 와 달리
        // dismissed 에는 기록하지 않는다(같은 경로가 재생성되면 자동 열기가 살아있어야 한다).
        clearSessionFor: (space, path) => {
          const s = get().session;
          if (s && s.space === space && (path === undefined || s.path === path)) set({ session: null });
        },

        remapSpace: (oldSlug, newSlug) =>
          set((c) => ({
            session: c.session && c.session.space === oldSlug ? { ...c.session, space: newSlug } : c.session,
            dismissed: Object.fromEntries(
              Object.entries(c.dismissed).map(([k, v]) => [
                k.startsWith(`${oldSlug}::`) ? wikiKey(newSlug, k.slice(oldSlug.length + 2)) : k,
                v,
              ]),
            ),
          })),
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
