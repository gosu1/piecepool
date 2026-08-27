import { create } from "zustand";
import { persist } from "zustand/middleware";

// 워크스페이스 UI/네비 상태 소유 = Study Vault shell(리디자인 P0~P3). 열린 탭 · 활성 탭 ·
// 사이드바 접기/폭 · 트리 접힘만 담는다. ImportJob 상태는 절대 여기 두지 않음 — 그건
// useImportStore 단일 소유(두 스토어 드리프트 방지). 순수 뷰 상태라 백엔드/계약 무관.
// localStorage persist — 재시작 시 열린 탭·활성 탭·사이드바 상태 복원(수용기준 §1).

export type TabKind = "home" | "wiki" | "archive" | "inbox" | "graph" | "original" | "empty";

export interface WorkspaceTab {
  id: string; // 안정 식별자. 예: "home" · "wiki:operating-systems:paging.md"
  kind: TabKind;
  title: string;
  space?: string; // KnowledgeSpace slug (home/graph 는 선택)
  file?: string; // wiki/archive 파일명. original 은 sources/original-files/ 의 원본 파일명
  dirty?: boolean; // 미저장 표시(●)
}

export type TreeSortKey = "name" | "updated" | "created";
export type TreeSortDir = "asc" | "desc";
export interface TreeSort {
  key: TreeSortKey;
  dir: TreeSortDir;
}

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
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
  // "Study Home에 추가"(파일 우클릭) — 홈 화면에 큰 파일 카드로 뜨는 문서 id 목록. 북마크(pinnedDocs)와
  // 별개다: 북마크는 사이드바 별 드롭다운, 이건 홈 타일. 같은 뷰 상태라 localStorage 에만 둔다.
  studyHomeDocs: string[];
  // 최근 연 문서 id(`kind:space:file`, 최신순) — 새 탭 런처의 "최근 문서" 섹션. persist.
  recentDocs: string[];
  // 사이드바 파일 트리 정렬(이름/업데이트/생성일 × 오름·내림). persist.
  treeSort: TreeSort;
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
  setCollapsedTree: (ids: string[]) => void; // 전체 접기/펼치기 — 폴더 id 목록 통째 교체
  togglePinned: (id: string) => void;
  toggleStudyHome: (id: string) => void;
  setTreeSort: (s: TreeSort) => void;
  // 공간 rename 은 slug(=폴더명)까지 바꾼다(rename_space) — slug 가 박힌 탭 id·문서 id·트리 id 리매핑.
  remapSpace: (oldSlug: string, newSlug: string) => void;
}

const NAV_CAP = 50;
const pushNav = (stack: string[], id: string) => [...stack, id].slice(-NAV_CAP);
const RECENT_CAP = 12;

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      openTabs: [],
      activeTabId: null,
      leftCollapsed: false,
      sidebarWidth: SIDEBAR_DEFAULT,
      collapsedTreeIds: [],
      pinnedDocs: [],
      studyHomeDocs: [],
      recentDocs: [],
      treeSort: { key: "name", dir: "asc" },
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
            // 문서 탭만 최근 목록에 (런처의 "최근 문서")
            recentDocs:
              tab.kind === "wiki" || tab.kind === "archive"
                ? [tab.id, ...s.recentDocs.filter((x) => x !== tab.id)].slice(0, RECENT_CAP)
                : s.recentDocs,
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

      // 값이 그대로면 새 배열을 만들지 않는다 — 매 렌더 호출하는 구독자가 리렌더 루프를 돌지 않게.
      setTabDirty: (id, dirty) =>
        set((s) =>
          s.openTabs.some((t) => t.id === id && !!t.dirty !== dirty)
            ? { openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, dirty } : t)) }
            : s,
        ),

      // 값이 그대로면 새 배열을 만들지 않는다 — 노트 제목 타이핑마다 탭 스트립 전체가 리렌더되지 않게(setTabDirty 와 동일 가드).
      renameTab: (id, title) =>
        set((s) =>
          s.openTabs.some((t) => t.id === id && t.title !== title)
            ? { openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, title } : t)) }
            : s,
        ),

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

      setCollapsedTree: (ids) => set({ collapsedTreeIds: ids }),

      togglePinned: (id) =>
        set((s) => ({
          pinnedDocs: s.pinnedDocs.includes(id) ? s.pinnedDocs.filter((x) => x !== id) : [...s.pinnedDocs, id],
        })),

      toggleStudyHome: (id) =>
        set((s) => ({
          studyHomeDocs: s.studyHomeDocs.includes(id) ? s.studyHomeDocs.filter((x) => x !== id) : [...s.studyHomeDocs, id],
        })),

      setTreeSort: (treeSort) => set({ treeSort }),

      // 옛 slug 가 박힌 id 를 안 이으면 열린 탭 저장이 "unknown space" 로 무소음 실패하고
      // 고정·홈·최근·접힘 항목이 고아가 된다.
      remapSpace: (oldSlug, newSlug) =>
        set((s) => {
          const mapDocId = (id: string) => {
            const [kind, space, ...rest] = id.split(":");
            return (kind === "wiki" || kind === "archive") && space === oldSlug ? [kind, newSlug, ...rest].join(":") : id;
          };
          // 탭 id: wiki/archive 는 문서 id 와 같은 꼴, graph 는 `graph:<slug>`.
          // inbox 탭 id 속 slug 는 생성 시점의 불투명 키 일부(초안 스토어 key 와 묶임)라 그대로 둔다.
          const mapTabId = (id: string) => (id === `graph:${oldSlug}` ? `graph:${newSlug}` : mapDocId(id));
          const mapFolderId = (id: string) =>
            id === `sp:${oldSlug}` || id === `af:${oldSlug}` || id === `wf:${oldSlug}` ? `${id.slice(0, 3)}${newSlug}` : id;
          return {
            openTabs: s.openTabs.map((t) => ({ ...t, id: mapTabId(t.id), space: t.space === oldSlug ? newSlug : t.space })),
            activeTabId: s.activeTabId === null ? null : mapTabId(s.activeTabId),
            collapsedTreeIds: s.collapsedTreeIds.map(mapFolderId),
            pinnedDocs: s.pinnedDocs.map(mapDocId),
            studyHomeDocs: s.studyHomeDocs.map(mapDocId),
            recentDocs: s.recentDocs.map(mapDocId),
            navBack: s.navBack.map(mapTabId),
            navForward: s.navForward.map(mapTabId),
          };
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
        studyHomeDocs: s.studyHomeDocs,
        recentDocs: s.recentDocs,
        treeSort: s.treeSort,
      }),
    },
  ),
);
