import { create } from "zustand";
import { persist } from "zustand/middleware";

// 워크스페이스 UI/네비 상태 소유 = Study Vault shell(리디자인 P0~P3). 열린 탭 · 활성 탭 ·
// 사이드바 접기/폭 · 트리 접힘만 담는다. ImportJob 상태는 절대 여기 두지 않음 — 그건
// useImportStore 단일 소유(두 스토어 드리프트 방지). 순수 뷰 상태라 백엔드/계약 무관.
// localStorage persist — 재시작 시 열린 탭·활성 탭·사이드바 상태 복원(수용기준 §1).

export type TabKind = "home" | "wiki" | "archive" | "inbox" | "graph" | "empty";

export interface WorkspaceTab {
  id: string; // 안정 식별자. 예: "home" · "wiki:operating-systems:paging.md"
  kind: TabKind;
  title: string;
  space?: string; // KnowledgeSpace slug (home/graph 는 선택)
  file?: string; // wiki/archive 파일명
  dirty?: boolean; // 미저장 표시(●)
}

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 240;

interface WorkspaceState {
  openTabs: WorkspaceTab[];
  activeTabId: string | null;
  leftCollapsed: boolean;
  sidebarWidth: number;
  collapsedTreeIds: string[]; // 기본 전체 펼침 — 사용자가 접은 폴더만 기억
  // 페이지 헤더의 "고정하기" — 문서 id(`kind:space:file`) 목록. 사이드바 고정 섹션에 표시.
  // frontmatter 는 계약(SSOT) 필드라 pinned 를 넣을 수 없음 — 순수 뷰 상태로 localStorage 에만 둔다.
  pinnedDocs: string[];
  // 페이지 아이콘(이모지) — 문서 id → emoji. 위와 동일하게 뷰 상태.
  docIcons: Record<string, string>;
  // 탭 활성화 히스토리(세션 전용, persist 제외) — 뒤로/앞으로. 닫힌 탭 id 는 pop 시 건너뛴다.
  navBack: string[];
  navForward: string[];

  openTab: (tab: WorkspaceTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setTabDirty: (id: string, dirty: boolean) => void;
  renameTab: (id: string, title: string) => void;
  reorderTab: (dragId: string, targetId: string) => void;
  goBack: () => void;
  goForward: () => void;
  toggleLeftPane: () => void;
  setSidebarWidth: (w: number) => void;
  toggleTreeNode: (id: string) => void;
  togglePinned: (id: string) => void;
  setDocIcon: (id: string, emoji: string | null) => void;
}

const NAV_CAP = 50;
const pushNav = (stack: string[], id: string) => [...stack, id].slice(-NAV_CAP);

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      openTabs: [],
      activeTabId: null,
      leftCollapsed: false,
      sidebarWidth: SIDEBAR_DEFAULT,
      collapsedTreeIds: [],
      pinnedDocs: [],
      docIcons: {},
      navBack: [],
      navForward: [],

      // 이미 열린 탭이면 활성화만, 아니면 추가 후 활성화. 활성 탭이 바뀌면 히스토리 기록.
      openTab: (tab) =>
        set((s) => {
          const changed = s.activeTabId !== null && s.activeTabId !== tab.id;
          return {
            openTabs: s.openTabs.some((t) => t.id === tab.id) ? s.openTabs : [...s.openTabs, tab],
            activeTabId: tab.id,
            navBack: changed ? pushNav(s.navBack, s.activeTabId!) : s.navBack,
            navForward: changed ? [] : s.navForward,
          };
        }),

      // 닫은 탭이 활성이면 이웃 탭으로 활성 이동(오른쪽 우선, 없으면 왼쪽)
      closeTab: (id) =>
        set((s) => {
          const idx = s.openTabs.findIndex((t) => t.id === id);
          if (idx === -1) return s;
          const openTabs = s.openTabs.filter((t) => t.id !== id);
          let activeTabId = s.activeTabId;
          if (s.activeTabId === id) {
            const neighbor = openTabs[idx] ?? openTabs[idx - 1] ?? null;
            activeTabId = neighbor ? neighbor.id : null;
          }
          return { openTabs, activeTabId };
        }),

      setActiveTab: (id) =>
        set((s) => {
          if (s.activeTabId === id) return s;
          return {
            activeTabId: id,
            navBack: s.activeTabId ? pushNav(s.navBack, s.activeTabId) : s.navBack,
            navForward: [],
          };
        }),

      setTabDirty: (id, dirty) =>
        set((s) => ({ openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, dirty } : t)) })),

      renameTab: (id, title) =>
        set((s) => ({ openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, title } : t)) })),

      // 뒤로/앞으로 — 열려 있지 않은(닫힌) id 는 건너뛰며 pop. 이동 자체는 히스토리에 기록하지 않는다.
      goBack: () =>
        set((s) => {
          const back = [...s.navBack];
          let target: string | null = null;
          while (back.length) {
            const id = back.pop()!;
            if (id !== s.activeTabId && s.openTabs.some((t) => t.id === id)) {
              target = id;
              break;
            }
          }
          if (!target) return { navBack: back };
          return {
            navBack: back,
            navForward: s.activeTabId ? pushNav(s.navForward, s.activeTabId) : s.navForward,
            activeTabId: target,
          };
        }),

      goForward: () =>
        set((s) => {
          const fwd = [...s.navForward];
          let target: string | null = null;
          while (fwd.length) {
            const id = fwd.pop()!;
            if (id !== s.activeTabId && s.openTabs.some((t) => t.id === id)) {
              target = id;
              break;
            }
          }
          if (!target) return { navForward: fwd };
          return {
            navForward: fwd,
            navBack: s.activeTabId ? pushNav(s.navBack, s.activeTabId) : s.navBack,
            activeTabId: target,
          };
        }),

      // 드래그 재정렬 — dragId 탭을 targetId 위치로 이동(target 앞에 삽입)
      reorderTab: (dragId, targetId) =>
        set((s) => {
          const tabs = [...s.openTabs];
          const from = tabs.findIndex((t) => t.id === dragId);
          const to = tabs.findIndex((t) => t.id === targetId);
          if (from === -1 || to === -1 || from === to) return s;
          const [moved] = tabs.splice(from, 1);
          tabs.splice(to, 0, moved);
          return { openTabs: tabs };
        }),

      toggleLeftPane: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),

      setSidebarWidth: (w) =>
        set({ sidebarWidth: Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w))) }),

      toggleTreeNode: (id) =>
        set((s) => ({
          collapsedTreeIds: s.collapsedTreeIds.includes(id)
            ? s.collapsedTreeIds.filter((x) => x !== id)
            : [...s.collapsedTreeIds, id],
        })),

      togglePinned: (id) =>
        set((s) => ({
          pinnedDocs: s.pinnedDocs.includes(id) ? s.pinnedDocs.filter((x) => x !== id) : [...s.pinnedDocs, id],
        })),

      setDocIcon: (id, emoji) =>
        set((s) => {
          const docIcons = { ...s.docIcons };
          if (emoji) docIcons[id] = emoji;
          else delete docIcons[id];
          return { docIcons };
        }),
    }),
    {
      name: "pp-workspace",
      // dirty 는 세션 상태(드래프트가 메모리에만 있음) — 복원 시 항상 false 로 되돌린다.
      // navBack/navForward 도 세션 전용(미포함) — 재시작 후 stale 탭 id 문제를 원천 차단.
      partialize: (s) => ({
        openTabs: s.openTabs.map(({ dirty: _d, ...t }) => t),
        activeTabId: s.activeTabId,
        leftCollapsed: s.leftCollapsed,
        sidebarWidth: s.sidebarWidth,
        collapsedTreeIds: s.collapsedTreeIds,
        pinnedDocs: s.pinnedDocs,
        docIcons: s.docIcons,
      }),
    },
  ),
);
