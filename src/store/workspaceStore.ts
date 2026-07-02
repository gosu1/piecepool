import { create } from "zustand";

// 워크스페이스 UI/네비 상태 소유 = Study Vault shell(리디자인 P0~P3). 열린 탭 · 활성 탭 ·
// 패널 접힘/서브탭 · 트리 확장만 담는다. ImportJob 상태는 절대 여기 두지 않음 — 그건
// useImportStore 단일 소유(두 스토어 드리프트 방지). 순수 뷰 상태라 백엔드/계약 무관.

export type TabKind = "home" | "wiki" | "archive" | "source" | "inbox" | "graph";

export interface WorkspaceTab {
  id: string; // 안정 식별자. 예: "home" · "wiki/operating-systems/paging.md"
  kind: TabKind;
  title: string;
  space?: string; // KnowledgeSpace slug (home/graph 는 선택)
  file?: string; // wiki/archive/source 파일명
  dirty?: boolean; // 미저장 표시(●)
}

export type LeftPaneTab = "files" | "search" | "starred";
export type RightPaneTab = "outline" | "ai";

interface WorkspaceState {
  openTabs: WorkspaceTab[];
  activeTabId: string | null;
  leftPaneTab: LeftPaneTab;
  rightPaneTab: RightPaneTab;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  expandedTreeIds: string[];

  openTab: (tab: WorkspaceTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setTabDirty: (id: string, dirty: boolean) => void;
  setLeftPaneTab: (t: LeftPaneTab) => void;
  setRightPaneTab: (t: RightPaneTab) => void;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
  toggleTreeNode: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  openTabs: [],
  activeTabId: null,
  leftPaneTab: "files",
  rightPaneTab: "ai",
  leftCollapsed: false,
  rightCollapsed: false,
  expandedTreeIds: [],

  // 이미 열린 탭이면 활성화만, 아니면 추가 후 활성화
  openTab: (tab) =>
    set((s) => ({
      openTabs: s.openTabs.some((t) => t.id === tab.id) ? s.openTabs : [...s.openTabs, tab],
      activeTabId: tab.id,
    })),

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

  setActiveTab: (id) => set({ activeTabId: id }),

  setTabDirty: (id, dirty) =>
    set((s) => ({ openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, dirty } : t)) })),

  setLeftPaneTab: (t) => set({ leftPaneTab: t }),
  setRightPaneTab: (t) => set({ rightPaneTab: t }),
  toggleLeftPane: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRightPane: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),

  toggleTreeNode: (id) =>
    set((s) => ({
      expandedTreeIds: s.expandedTreeIds.includes(id)
        ? s.expandedTreeIds.filter((x) => x !== id)
        : [...s.expandedTreeIds, id],
    })),
}));
