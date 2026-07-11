import { useEffect, useRef, useState } from "react";
import { AppShell, Sidebar, Card, EmptyState, Icons } from "../ds";
import type { TreeNode } from "../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT, ArchiveNote, GraphData, Workspace, Subject, Relation } from "../lib/types";
import * as ipc from "../lib/ipc";
import { startFileDragOut } from "../lib/dragOut";
import { runWikiGeneration } from "../llm/generate";
import type { LlmWikiInput } from "../llm/provider";
import { applyLlmResult, embedSourceFiles, isSynthesisPage, synthesisConceptId } from "../lib/llmApply";
import { buildGaps } from "../llm/gaps";
import type { GapReport } from "../llm/gaps";
import { maybeFactCheck } from "../lib/factCheck";
import { detectSourceRefConflicts } from "../lib/sourceRefConflicts";
import { chunkOpts, getLinerKey } from "../lib/settings";
import { aggregateProvenance, tierFromSourceType, type SourceMeta } from "../llm/provenance";
import { docKey } from "./types";
import type { SearchItem } from "./types";
import { DocView, AiBar, GapPanel, ConvertPanel, ReviewBar } from "./panes/DocView";
import { PageHeader } from "./panes/PageHeader";
import type { LinkedItem } from "./panes/PageHeader";
import { RelationQuality } from "./panes/RelationQuality";
import { GraphSection } from "./panes/GraphSection";
import { InboxSection, InboxPanelToggles } from "./panes/InboxSection";
import { StudyHome } from "./panes/StudyHome";
import { Ribbon } from "./shell/Ribbon";
import { NewTabPane } from "./shell/NewTabPane";
import type { LauncherDoc } from "./shell/NewTabPane";
import { StatusBar } from "./shell/StatusBar";
import { TitlebarRow } from "./shell/TitlebarRow";
import { SidebarHeader, SidebarShortcuts } from "./shell/SidebarChrome";
import { SearchPalette } from "./shell/SearchPalette";
import { SettingsModal } from "./shell/SettingsModal";
import { QuickMemo } from "./panes/QuickMemo";
import { ContextMenu, ConfirmDialog, PromptDialog } from "./shell/Dialogs";
import { useWorkspaceStore, SIDEBAR_DEFAULT } from "../store/workspaceStore";
import type { TabKind } from "../store/workspaceStore";
import { useConvertStore } from "../store/convertStore";
import { useInboxDraftStore } from "../store/inboxDraftStore";

const KIND_LABEL: Record<TabKind, string> = { wiki: "Wiki", archive: "Source", inbox: "Inbox", graph: "Graph", home: "Home", empty: "새 탭" };

// 트리 id 파서 — 파일명에 ":" 가 없다는 계약(kebab/slug)에 기대지 않고 앞 3개만 분해한다.
function parseDocId(id: string): { kind: string; space: string; file: string } | null {
  const parts = id.split(":");
  if (parts[0] !== "doc" || parts.length < 4) return null;
  return { kind: parts[1], space: parts[2], file: parts.slice(3).join(":") };
}

type ShellDialog =
  | { kind: "rename-note" | "rename-wiki"; space: string; file: string; title: string }
  | { kind: "delete-note" | "delete-wiki"; space: string; file: string; title: string }
  | { kind: "close-dirty"; tabId: string }
  | { kind: "overwrite-syn"; space: string; file: string; title: string }
  | { kind: "new-space" }
  | { kind: "rename-space"; slug: string; name: string }
  | { kind: "delete-space"; slug: string; name: string };

// 노트 탭 id — 노트 하나 = 탭 하나(웹 탭 모델). "새 노트"마다 고유 id 로 새 탭을 append 한다(재활용 없음).
let noteTabSeq = 0;
const noteTabId = (space: string) => `inbox:${space}:${Date.now().toString(36)}${(noteTabSeq++).toString(36)}`;

export default function PiecePoolApp() {
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [wikiBySlug, setWikiBySlug] = useState<Record<string, WikiPageT[]>>({});
  const [notesBySlug, setNotesBySlug] = useState<Record<string, ArchiveNote[]>>({});
  const [graphBySlug, setGraphBySlug] = useState<Record<string, GraphData>>({});
  const [subjectsBySlug, setSubjectsBySlug] = useState<Record<string, Subject[]>>({});

  const [currentSpaceSlug, setCurrentSpaceSlug] = useState<string>("");

  // 인라인 편집 / LLM / 검색 팔레트
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiBusy, setAiBusy] = useState<string>("");
  const [aiStatus, setAiStatus] = useState<Record<string, string>>({});
  const [gaps, setGaps] = useState<Record<string, GapReport & { v: number }>>({});
  const [gapBusy, setGapBusy] = useState<string>("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 퀵메모 — 셸이 소유한다. 탭을 바꿔도 창이 살아있어야 하기 때문(스티커 메모의 성질).
  const [memoOpen, setMemoOpen] = useState(false);

  // 셸 오버레이 — 트리 컨텍스트 메뉴 · 페인 "…" 메뉴 · 확인/입력 다이얼로그 · 상태바 알림
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<ShellDialog | null>(null);
  const [notice, setNotice] = useState("");

  const [error, setError] = useState("");
  const [booting, setBooting] = useState(true);

  // 셸 상태(workspaceStore, localStorage persist) — 열린 탭 · 활성 탭 · 사이드바 접기/폭 · 트리 접힘
  const openTabs = useWorkspaceStore((s) => s.openTabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setTabDirty = useWorkspaceStore((s) => s.setTabDirty);
  const renameTab = useWorkspaceStore((s) => s.renameTab);
  const reorderTab = useWorkspaceStore((s) => s.reorderTab);
  const leftCollapsed = useWorkspaceStore((s) => s.leftCollapsed);
  const toggleLeftPane = useWorkspaceStore((s) => s.toggleLeftPane);
  const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
  const setSidebarWidth = useWorkspaceStore((s) => s.setSidebarWidth);
  const collapsedTreeIds = useWorkspaceStore((s) => s.collapsedTreeIds);
  const toggleTreeNode = useWorkspaceStore((s) => s.toggleTreeNode);
  const setCollapsedTree = useWorkspaceStore((s) => s.setCollapsedTree);
  const pinnedDocs = useWorkspaceStore((s) => s.pinnedDocs);
  const togglePinned = useWorkspaceStore((s) => s.togglePinned);
  const treeSort = useWorkspaceStore((s) => s.treeSort);
  const recentDocs = useWorkspaceStore((s) => s.recentDocs);

  // 정리 글 변환 job(convertStore) — 스트림은 스토어 소유라 탭 전환에도 계속된다 (ADR-0008)
  const convertJob = useConvertStore((s) => s.job);
  const cancelConvert = useConvertStore((s) => s.cancel);
  const clearConvert = useConvertStore((s) => s.clear);

  // 부팅: 시드 → spaces → 각 공간 wiki/notes/graph → 복원된 탭이 없으면 Study Home
  useEffect(() => {
    (async () => {
      try {
        const ws = await ipc.getWorkspace();
        setWorkspace(ws);
        const sp = await ipc.listSpaces();
        setSpaces(sp);
        const w: Record<string, WikiPageT[]> = {};
        const n: Record<string, ArchiveNote[]> = {};
        const g: Record<string, GraphData> = {};
        const sub: Record<string, Subject[]> = {};
        await Promise.all(
          sp.map(async (s) => {
            const [wikis, notes, graph, subjects] = await Promise.all([
              ipc.listWiki(s.slug),
              ipc.listNotes(s.slug),
              ipc.getGraph(s.slug),
              // subjects.json 손상이 부팅 전체를 막으면 안 된다 — 과목 없이도 워크스페이스는 열린다.
              ipc.listSubjects(s.slug).catch(() => []),
            ]);
            w[s.slug] = wikis;
            n[s.slug] = notes;
            g[s.slug] = graph;
            sub[s.slug] = subjects;
          }),
        );
        setWikiBySlug(w);
        setNotesBySlug(n);
        setGraphBySlug(g);
        setSubjectsBySlug(sub);
        if (sp[0]) setCurrentSpaceSlug(sp[0].slug);
        // persist 복원 탭이 있으면 그대로, 없으면 부팅 탭-0 = Study Home
        if (useWorkspaceStore.getState().openTabs.length === 0) {
          openTab({ id: "home", kind: "home", title: "Study Home" });
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 활성 탭 → 현재 공간(아래에서 계산)을 keydown 핸들러([] deps)에서 참조하기 위한 ref
  const currentSpaceRef = useRef("");
  // ⌘W(탭 닫기)도 같은 이유로 ref 경유 — 핸들러는 마운트 시 1회만 등록한다.
  const activeTabIdRef = useRef<string | null>(null);
  activeTabIdRef.current = activeTabId;
  const requestCloseTabRef = useRef<(id: string) => void>(() => {});

  // ⌘K/⌘O → 검색 팔레트 · ⌘N → 새 노트 · ⌘M → 퀵메모 · ⌘W → 탭 닫기 · ⌘Tab → 탭 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      // ⌘Tab / ⌘⇧Tab — 보이는 탭 순서대로 다음/이전. 끝에서 넘어가면 순환한다.
      // 최근 사용순(MRU)이 아니라 순서대로다: 눈에 보이는 순서와 일치해야 예측할 수 있다.
      if (e.key === "Tab") {
        e.preventDefault();
        const tabs = useWorkspaceStore.getState().openTabs;
        if (tabs.length < 2) return;
        const i = tabs.findIndex((t) => t.id === activeTabIdRef.current);
        const next = (i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length;
        setActiveTab(tabs[next].id);
        return;
      }
      if (k === "k" || k === "o") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (k === "n") {
        e.preventDefault();
        openNewNoteRef.current(currentSpaceRef.current);
      } else if (k === "w") {
        // 탭 닫기. 미저장 초안이 있으면 requestCloseTab 이 확인부터 받는다.
        e.preventDefault();
        const id = activeTabIdRef.current;
        if (id) requestCloseTabRef.current(id);
      } else if (k === "m") {
        // 강의 중 급하게 부르는 키다 — 어느 화면에 있든, 메모장에 포커스가 있어도 여닫힌다.
        e.preventDefault();
        setMemoOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 상태바 알림 — 4초 후 자동 사라짐
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // 드래그-아웃 중 파일을 창 위에서 놓으면 webview 가 그 파일 URL 로 navigate 하는 기본동작을 막는다.
  // (폴더 행의 onDrop 은 target 에서 먼저 처리되므로 외부 파일 import 는 영향 없음.)
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  // 활성 탭 → 현재 공간 컨텍스트(브레드크럼·트리가 따라감)
  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;
  const currentSpace = activeTab?.space || currentSpaceSlug || spaces[0]?.slug || "";
  useEffect(() => {
    currentSpaceRef.current = currentSpace;
  }, [currentSpace]);
  const spaceName = spaces.find((s) => s.slug === currentSpace)?.name ?? "";
  const spaceNameOf = (slug: string) => spaces.find((s) => s.slug === slug)?.name ?? slug;

  // ── 탭 열기(=네비게이션) ──
  const openWiki = (space: string, file: string) => {
    const title = (wikiBySlug[space] ?? []).find((w) => w.path === file)?.title ?? file;
    openTab({ id: `wiki:${space}:${file}`, kind: "wiki", title, space, file });
  };
  const openArchive = (space: string, file: string) => {
    const title = (notesBySlug[space] ?? []).find((n) => n.path === file)?.title ?? file;
    openTab({ id: `archive:${space}:${file}`, kind: "archive", title, space, file });
  };
  const openGraph = (space: string) => openTab({ id: `graph:${space}`, kind: "graph", title: "Graph", space });
  const openHome = () => openTab({ id: "home", kind: "home", title: "Study Home" });

  // ── "새 노트" — 노트 하나 = 탭 하나(웹 탭 모델). 고유 id 의 새 탭을 맨 끝에 append 하고 쓰던 탭은 그대로 유지. ──
  // 파일은 "저장/AI 정리" 버튼을 눌러야 생긴다(작성 중 내용은 draft store 로 항상 보존, 탭 X 눌러야 닫힘).
  const openNewNote = (fallbackSpace: string) => {
    const space = activeTab?.kind === "inbox" && activeTab.space ? activeTab.space : fallbackSpace;
    if (!space) return;
    openTab({ id: noteTabId(space), kind: "inbox", title: "새 노트", space });
  };
  const openNewNoteRef = useRef(openNewNote);
  openNewNoteRef.current = openNewNote;

  // 마지막 탭을 닫으면 빈 화면 대신 Study Home 을 연다 — 탭이 0개인 순간이 없다(옵시디언과 같다).
  // "+" 는 언제나 마지막 탭 옆에 붙어야 뜻이 읽힌다("탭 하나 더"). 탭이 없으면 붙을 데가 없어
  // 좌측 크롬 옆으로 밀려나 자리를 잃었다. 탭을 0개로 두지 않으면 그 상황 자체가 생기지 않는다.
  // 부팅 시 복원 탭이 없을 때와 같은 착지점이다 — "탭이 없다" 는 상황의 답이 하나여야 한다.
  useEffect(() => {
    if (booting || openTabs.length > 0) return;
    openTab({ id: "home", kind: "home", title: "Study Home" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, openTabs.length]);

  // 리본 Inbox — 노트 하나 = 탭 하나이므로 "인박스 탭"은 없다. 쓰던 노트가 있으면 그 탭으로,
  // 없으면 새 노트를 연다(초안은 draft store 가 보존하므로 되돌아와도 그대로다).
  const openInbox = () => {
    const note = [...openTabs].reverse().find((t) => t.kind === "inbox");
    if (note) setActiveTab(note.id);
    else openNewNote(currentSpaceRef.current);
  };

  // 새 지식 공간(폴더) 생성 — 백엔드 create_space → 목록/집계 갱신 후 새 공간으로 이동.
  // 만든 slug 를 돌려준다 — 인박스가 저장 위치를 방금 만든 과목으로 바로 옮길 수 있게.
  const createNewSpace = async (name: string): Promise<string | null> => {
    try {
      const sp = await ipc.createSpace(name);
      const spaceList = await ipc.listSpaces();
      setSpaces(spaceList);
      setWikiBySlug((m) => ({ ...m, [sp.slug]: [] }));
      setNotesBySlug((m) => ({ ...m, [sp.slug]: [] }));
      setGraphBySlug((m) => ({ ...m, [sp.slug]: { nodes: [], relations: [] } }));
      setSubjectsBySlug((m) => ({ ...m, [sp.slug]: [] }));
      setCurrentSpaceSlug(sp.slug);
      setNotice(`새 공간 "${sp.name}"을(를) 만들었어요`);
      return sp.slug;
    } catch (e) {
      setNotice(`공간 만들기 실패: ${String(e)}`);
      return null;
    }
  };

  // 공간 이름 변경 — 백엔드 rename_space (slug/폴더는 그대로, 표시 이름만 바뀜)
  const renameSpaceFlow = async (slug: string, newName: string) => {
    try {
      await ipc.renameSpace(slug, newName);
      setSpaces(await ipc.listSpaces());
    } catch (e) {
      setNotice(`이름 변경 실패: ${String(e)}`);
    }
  };

  // 공간 삭제 — 백엔드 delete_space (디렉토리 전체 삭제). 열린 탭·로컬 집계 정리, 현재 공간이면 홈으로.
  const deleteSpaceFlow = async (slug: string, name: string) => {
    try {
      await ipc.deleteSpace(slug);
      const spaceList = await ipc.listSpaces();
      setSpaces(spaceList);
      const drop = <T,>(m: Record<string, T>) => {
        const n = { ...m };
        delete n[slug];
        return n;
      };
      setWikiBySlug(drop);
      setNotesBySlug(drop);
      setGraphBySlug(drop);
      setSubjectsBySlug(drop);
      openTabs.filter((t) => t.space === slug).forEach((t) => closeTabClean(t.id));
      if (currentSpace === slug) {
        setCurrentSpaceSlug(spaceList[0]?.slug ?? "");
        openHome();
      }
      setNotice(`공간 "${name}"을(를) 삭제했어요`);
    } catch (e) {
      setNotice(`공간 삭제 실패: ${String(e)}`);
    }
  };
  // "+" 새 탭 — 파일을 만들지 않는 런처 탭(검색·최근·고정·시작 액션).
  // 이전의 즉시 createNote("제목 없음")는 클릭마다 빈 파일을 쌓았다 — 생성은 저장 시점으로 일원화.
  const openEmptyTab = () => openTab({ id: `empty:${Date.now().toString(36)}`, kind: "empty", title: "새 탭" });
  // 노트 탭을 닫으면 그 초안도 스토어에서 지운다(닫기 = 명시적 폐기, 진행 중 요약도 중단). 저장된 archive 파일은 남는다.
  const closeTabClean = (id: string) => {
    if (id.startsWith("inbox:")) useInboxDraftStore.getState().clear(id);
    closeTab(id);
  };
  // 미저장 편집이 있는 탭은 확인 후 닫기
  const requestCloseTab = (id: string) => {
    const tab = openTabs.find((t) => t.id === id);
    // 재시작으로 복원된 inbox 탭은 한 번도 안 열려 tab.dirty=false 여도, 저장 안 한 초안이 남아있을 수 있다 → 스토어로 확인.
    const d = id.startsWith("inbox:") ? useInboxDraftStore.getState().drafts[id] : undefined;
    const inboxDirty = !!d && !!(d.title.trim() || d.body.trim()) && `${d.title.trim()} ${d.body}` !== d.savedSnapshot;
    if (tab?.dirty || inboxDirty) setDialog({ kind: "close-dirty", tabId: id });
    else closeTabClean(id);
  };
  requestCloseTabRef.current = requestCloseTab;
  // 문서별 세션 상태(드래프트·편집·간극) 일괄 정리 — 저장/이동/삭제/닫기 후 stale 부활 방지.
  const clearDocState = (key: string) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setGaps((g) => {
      const next = { ...g };
      delete next[key];
      return next;
    });
  };
  const discardAndClose = (tabId: string) => {
    const tab = openTabs.find((t) => t.id === tabId);
    if (tab?.space && tab.file) clearDocState(docKey(tab.space, tab.file));
    closeTabClean(tabId); // inbox 노트면 스토어 초안 폐기 + 진행 중 요약 중단
  };

  // ── 사이드바 vault 트리(전체 vault) ──
  // source(archive) md 는 드래그 이동 가능, 공간 루트/ source 폴더가 드랍 대상.
  // 파일 정렬(treeSort): 이름/업데이트/생성일 × 오름·내림. 날짜는 ISO 문자열이라 사전식=시간순.
  const sortDocs = <T extends { title: string; createdAt: string; updatedAt: string }>(list: T[]): T[] => {
    const val = (d: T) => (treeSort.key === "name" ? d.title : treeSort.key === "updated" ? d.updatedAt : d.createdAt);
    return [...list].sort((a, b) => {
      const c = val(a).localeCompare(val(b), "ko");
      return treeSort.dir === "asc" ? c : -c;
    });
  };
  const tree: TreeNode[] = spaces.map((s) => ({
    id: `sp:${s.slug}`,
    label: s.name,
    type: "folder",
    dropTarget: true,
    children: [
      {
        id: `wf:${s.slug}`,
        label: "wiki",
        type: "folder",
        children: sortDocs(wikiBySlug[s.slug] ?? []).map((w) => ({ id: `doc:wiki:${s.slug}:${w.path}`, label: w.title, type: "file" as const })),
      },
      {
        id: `af:${s.slug}`,
        label: "source",
        type: "folder",
        dropTarget: true,
        children: sortDocs(notesBySlug[s.slug] ?? []).map((nt) => ({
          id: `doc:archive:${s.slug}:${nt.path}`,
          label: nt.title,
          type: "file" as const,
          draggable: true,
        })),
      },
    ],
  }));
  const onTreeSelect = (id: string) => {
    const doc = parseDocId(id);
    if (!doc) return;
    if (doc.kind === "wiki") openWiki(doc.space, doc.file);
    else openArchive(doc.space, doc.file);
  };

  // 전체 폴더 접기/펼치기 — 모든 폴더 id 를 collapsedTreeIds 에 넣거나(접기) 비운다(펼치기)
  const collectFolderIds = (nodes: TreeNode[]): string[] =>
    nodes.flatMap((n) => (n.type === "folder" ? [n.id, ...collectFolderIds(n.children ?? [])] : []));
  const allFolderIds = collectFolderIds(tree);
  const allCollapsed = allFolderIds.length > 0 && allFolderIds.every((id) => collapsedTreeIds.includes(id));
  const onToggleCollapseAll = () => setCollapsedTree(allCollapsed ? [] : allFolderIds);
  const selectedTreeId =
    activeTab && (activeTab.kind === "wiki" || activeTab.kind === "archive")
      ? `doc:${activeTab.kind === "wiki" ? "wiki" : "archive"}:${activeTab.space}:${activeTab.file}`
      : "";

  // 고정된 문서(페이지 헤더 "고정하기") — 삭제/이동으로 사라진 문서는 표시에서 걸러낸다.
  const pinnedEntries = pinnedDocs.flatMap((id) => {
    const [kind, space, ...rest] = id.split(":");
    const file = rest.join(":");
    const list = kind === "wiki" ? wikiBySlug[space] : notesBySlug[space];
    const doc = (list ?? []).find((d) => d.path === file);
    return doc ? [{ id, label: doc.title, kind, space, file }] : [];
  });
  const openPinned = (id: string) => {
    const e = pinnedEntries.find((p) => p.id === id);
    if (!e) return;
    if (e.kind === "wiki") openWiki(e.space, e.file);
    else openArchive(e.space, e.file);
  };

  // ── 트리 DnD: source md 를 다른 공간으로 이동 ──
  const slugOfFolder = (folderId: string) => {
    const [kind, slug] = folderId.split(":");
    return kind === "sp" || kind === "af" ? slug : "";
  };
  const handleMoveNode = async (dragId: string, dropFolderId: string) => {
    const doc = parseDocId(dragId);
    const toSpace = slugOfFolder(dropFolderId);
    if (!doc || !toSpace) return;
    if (doc.kind !== "archive") {
      setNotice("위키는 공간 간 이동을 지원하지 않아요 (관계가 공간에 묶여 있어요)");
      return;
    }
    if (doc.space === toSpace) return;
    // 편집 중(미저장 드래프트)인 노트는 이동 금지 — 디스크의 저장본만 이동되어 편집 내용이 유실된다.
    const tabId = `archive:${doc.space}:${doc.file}`;
    if (openTabs.find((t) => t.id === tabId)?.dirty) {
      setNotice("편집 중인 노트예요 — 저장한 뒤 이동하세요");
      return;
    }
    try {
      const moved = await ipc.moveNote(doc.space, doc.file, toSpace);
      clearDocState(docKey(doc.space, doc.file));
      closeTab(tabId);
      // 고정은 kind:space:file 키 — 이동하면 새 키로 이어준다(고아 방지).
      const st = useWorkspaceStore.getState();
      const newTabId = `archive:${toSpace}:${moved.path}`;
      if (st.pinnedDocs.includes(tabId)) {
        st.togglePinned(tabId);
        st.togglePinned(newTabId);
      }
      await Promise.all([refreshSpace(doc.space), refreshSpace(toSpace)]);
      setNotice(`"${moved.title}" → ${spaceNameOf(toSpace)} 이동됨`);
    } catch (e) {
      setNotice(`이동 실패: ${String(e)}`);
    }
  };

  // ── 트리 노드 드래그-아웃: 디스크의 실제 .md 를 앱 밖(다른 앱/LLM 프롬프트)으로 내보내기 ──
  const handleDragOutFile = (id: string) => {
    const doc = parseDocId(id);
    if (!doc) return;
    const space = spaces.find((s) => s.slug === doc.space);
    if (!space) return;
    const subdir = doc.kind === "wiki" ? "wiki" : "archive";
    startFileDragOut(`${space.rootPath}/${subdir}/${doc.file}`);
  };

  // ── 트리 외부 파일 드랍: .md/.txt → 해당 공간 source 노트로 ──
  const handleDropFiles = async (dropFolderId: string, files: FileList) => {
    const toSpace = slugOfFolder(dropFolderId);
    if (!toSpace) return;
    let ok = 0;
    let skipped = 0;
    try {
      for (const f of Array.from(files)) {
        if (/\.(md|markdown|txt)$/i.test(f.name)) {
          const text = await f.text();
          await ipc.createNote(toSpace, f.name.replace(/\.[^.]+$/, ""), text, []);
          ok++;
        } else skipped++;
      }
      if (ok) await refreshSpace(toSpace);
      setNotice(`${spaceNameOf(toSpace)}에 노트 ${ok}개 추가${skipped ? ` · ${skipped}개 건너뜀(md/txt만 지원)` : ""}`);
    } catch (e) {
      setNotice(`가져오기 실패: ${String(e)}`);
    }
  };

  // ── 트리 컨텍스트 메뉴(이름 변경 · 삭제) ──
  const menuDoc = menu ? parseDocId(menu.id) : null;
  // 공간 폴더 우클릭(sp:slug) — 이름 변경·삭제
  const menuSpace = menu && menu.id.startsWith("sp:") ? (spaces.find((s) => s.slug === menu.id.slice(3)) ?? null) : null;
  const menuItems = menuDoc
    ? [
        {
          label: "열기",
          onClick: () => (menuDoc.kind === "wiki" ? openWiki(menuDoc.space, menuDoc.file) : openArchive(menuDoc.space, menuDoc.file)),
        },
        // 공간 이동 — archive 노트만(위키는 공간 이동 불가). 드래그가 드래그-아웃에 쓰이므로 이동은 메뉴로.
        ...(menuDoc.kind === "archive"
          ? spaces
              .filter((s) => s.slug !== menuDoc.space)
              .map((s) => ({
                label: `${s.name}(으)로 이동`,
                onClick: () => handleMoveNode(`doc:${menuDoc.kind}:${menuDoc.space}:${menuDoc.file}`, `af:${s.slug}`),
              }))
          : []),
        {
          label: "이름 변경…",
          onClick: () => {
            const list = menuDoc.kind === "wiki" ? wikiBySlug[menuDoc.space] : notesBySlug[menuDoc.space];
            const cur = (list ?? []).find((x) => x.path === menuDoc.file);
            setDialog({
              kind: menuDoc.kind === "wiki" ? "rename-wiki" : "rename-note",
              space: menuDoc.space,
              file: menuDoc.file,
              title: cur?.title ?? "",
            });
          },
        },
        {
          label: "삭제…",
          danger: true,
          onClick: () => {
            const list = menuDoc.kind === "wiki" ? wikiBySlug[menuDoc.space] : notesBySlug[menuDoc.space];
            const cur = (list ?? []).find((x) => x.path === menuDoc.file);
            setDialog({
              kind: menuDoc.kind === "wiki" ? "delete-wiki" : "delete-note",
              space: menuDoc.space,
              file: menuDoc.file,
              title: cur?.title ?? menuDoc.file,
            });
          },
        },
      ]
    : menuSpace
      ? [
          {
            label: "이름 변경…",
            onClick: () => setDialog({ kind: "rename-space", slug: menuSpace.slug, name: menuSpace.name }),
          },
          {
            label: "삭제…",
            danger: true,
            onClick: () => setDialog({ kind: "delete-space", slug: menuSpace.slug, name: menuSpace.name }),
          },
        ]
      : [];

  const applyRename = async (d: Extract<ShellDialog, { kind: "rename-note" | "rename-wiki" }>, newTitle: string) => {
    try {
      if (d.kind === "rename-wiki") {
        await ipc.renameWiki(d.space, d.file, newTitle);
        renameTab(`wiki:${d.space}:${d.file}`, newTitle);
      } else {
        await ipc.renameNote(d.space, d.file, newTitle);
        renameTab(`archive:${d.space}:${d.file}`, newTitle);
      }
      await refreshSpace(d.space);
      setNotice(`이름 변경됨: ${newTitle}`);
    } catch (e) {
      setNotice(`이름 변경 실패: ${String(e)}`);
    }
  };
  const applyDelete = async (d: Extract<ShellDialog, { kind: "delete-note" | "delete-wiki" }>) => {
    try {
      // 삭제 확인은 이미 받았으므로 문서 세션 상태도 함께 정리(경로 재사용 시 stale 부활 방지).
      clearDocState(docKey(d.space, d.file));
      // 고정도 정리 — localStorage 에 죽은 키가 쌓이지 않게.
      const docId = `${d.kind === "delete-wiki" ? "wiki" : "archive"}:${d.space}:${d.file}`;
      const st = useWorkspaceStore.getState();
      if (st.pinnedDocs.includes(docId)) st.togglePinned(docId);
      if (d.kind === "delete-wiki") {
        const pruned = await ipc.deleteWiki(d.space, d.file);
        closeTab(`wiki:${d.space}:${d.file}`);
        setNotice(`"${d.title}" 삭제됨${pruned > 0 ? ` · 관계 ${pruned}개 정리` : ""}`);
      } else {
        await ipc.deleteNote(d.space, d.file);
        closeTab(`archive:${d.space}:${d.file}`);
        setNotice(`"${d.title}" 삭제됨`);
      }
      await refreshSpace(d.space);
    } catch (e) {
      setNotice(`삭제 실패: ${String(e)}`);
    }
  };

  // 위키 개념 중심 섹션 데이터 (scope §2.7) — 관련 소스 · 타입별 관계 · confused_with · ref 충돌.
  const conceptSections = (space: string, page: WikiPageT) => {
    const g = graphBySlug[space];
    const byType = new Map<string, { label: string; dir: "out" | "in"; onClick: () => void }[]>();
    if (g) {
      for (const r of g.relations) {
        const out = r.sourceNodeId === page.conceptId;
        if (!out && r.targetNodeId !== page.conceptId) continue;
        const otherId = out ? r.targetNodeId : r.sourceNodeId;
        const node = g.nodes.find((n) => n.id === otherId);
        if (!node) continue;
        const items = byType.get(r.relationType) ?? [];
        items.push({ label: node.title, dir: out ? "out" : "in", onClick: () => openWiki(space, node.path) });
        byType.set(r.relationType, items);
      }
    }
    const confused = (byType.get("confused_with") ?? []).map((it) => ({ title: it.label, onClick: it.onClick }));
    // confused_with 는 전용 섹션으로 — 관계 그룹에서 중복 표기하지 않는다.
    const relationGroups = Array.from(byType, ([type, items]) => ({ type, items })).filter((x) => x.type !== "confused_with");

    const notes = notesBySlug[space] ?? [];
    const seen = new Set<string>();
    const sources: { label: string; onClick?: () => void }[] = [];
    for (const sid of page.sourceIds) {
      const n = notes.find((x) => x.sourceId === sid);
      if (n && !seen.has(n.path)) {
        seen.add(n.path);
        sources.push({ label: n.title, onClick: () => openArchive(space, n.path) });
      }
    }
    for (const r of page.sourceRefs) {
      const label = `${r.file}${r.page ? `#p${r.page}` : ""}`;
      if (!seen.has(label)) {
        seen.add(label);
        sources.push({ label });
      }
    }
    return { sources, relationGroups, confused, conflicts: detectSourceRefConflicts(page.sourceRefs, page.markdown) };
  };

  // [[대상]] → 같은 공간 위키 탭 열기. linkExists 로 깨진 링크 표식(수용기준 §2.3).
  const findWiki = (space: string, target: string) => {
    const pages = wikiBySlug[space] ?? [];
    return pages.find((p) => p.title === target) || pages.find((p) => p.title.toLowerCase() === target.toLowerCase());
  };
  const resolveLink = (space: string, target: string) => {
    const hit = findWiki(space, target);
    if (hit) openWiki(space, hit.path);
  };
  const linkExistsIn = (space: string) => (target: string) => !!findWiki(space, target);

  // ── 인라인 편집 ──
  const toggleEdit = (key: string, savedMd: string) => {
    setEditing((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        next.add(key);
        setDrafts((d) => (key in d ? d : { ...d, [key]: savedMd }));
      }
      return next;
    });
  };
  const setDraft = (key: string, md: string) => setDrafts((d) => ({ ...d, [key]: md }));
  // 저장 후에는 드래프트를 비운다 — 남겨두면 다음 편집 진입 시 stale 드래프트가 부활해
  // 그 사이 외부 갱신(AI 병합 등)된 내용을 덮어쓴다.
  const saveWikiDoc = async (space: string, page: WikiPageT, md: string) => {
    const saved = await ipc.saveWiki(space, { ...page, markdown: md });
    setWikiBySlug((m) => ({ ...m, [space]: (m[space] ?? []).map((x) => (x.path === page.path ? saved : x)) }));
    clearDocState(docKey(space, page.path));
    setTabDirty(`wiki:${space}:${page.path}`, false);
  };
  const saveArchiveDoc = async (space: string, file: string, md: string) => {
    const saved = await ipc.saveNote(space, file, md);
    setNotesBySlug((m) => ({ ...m, [space]: (m[space] ?? []).map((x) => (x.path === file ? saved : x)) }));
    clearDocState(docKey(space, file));
    setTabDirty(`archive:${space}:${file}`, false);
  };

  // ── 페이지 헤더(Notion풍) — 과목 토글 · 사용자 직접 연결 ──
  // 토글은 디스크 최신본 기준 + 직렬화 — 연타 레이스로 앞선 토글이 사라지거나,
  // 메모리 stale markdown 이 디스크의 새 본문을 덮어쓰는 것(saveWiki 는 struct 전체 저장)을 막는다.
  const subjectChain = useRef(Promise.resolve());
  const toggleNoteSubject = (space: string, path: string, id: string) => {
    subjectChain.current = subjectChain.current.then(async () => {
      try {
        const cur = await ipc.readNote(space, path);
        const next = cur.subjectIds.includes(id) ? cur.subjectIds.filter((x) => x !== id) : [...cur.subjectIds, id];
        const saved = await ipc.updateNoteSubjects(space, path, next);
        setNotesBySlug((m) => ({ ...m, [space]: (m[space] ?? []).map((x) => (x.path === path ? saved : x)) }));
      } catch (e) {
        setNotice(`과목 변경 실패: ${String(e)}`);
      }
    });
  };
  const toggleWikiSubject = (space: string, path: string, id: string) => {
    subjectChain.current = subjectChain.current.then(async () => {
      try {
        const cur = await ipc.readWiki(space, path);
        const next = cur.subjectIds.includes(id) ? cur.subjectIds.filter((x) => x !== id) : [...cur.subjectIds, id];
        const saved = await ipc.saveWiki(space, { ...cur, subjectIds: next });
        setWikiBySlug((m) => ({ ...m, [space]: (m[space] ?? []).map((x) => (x.path === path ? saved : x)) }));
      } catch (e) {
        setNotice(`과목 변경 실패: ${String(e)}`);
      }
    });
  };
  // 관계 append — 모든 관계는 evidence ≥ 1 (relation-types.md), 사용자 연결도 근거를 합성해 채운다.
  const addUserLink = async (space: string, rel: Relation) => {
    try {
      await ipc.appendRelations(space, [rel]);
      await refreshSpace(space);
      setNotice("연결된 노트를 추가했어요");
    } catch (e) {
      setNotice(`연결 실패: ${String(e)}`);
    }
  };
  // 복습 표시 해제 — 붙일 때와 마찬가지로 사용자만 거둔다(relation-types.md §review_needed).
  const unmarkReview = async (space: string, conceptId: string, title: string) => {
    try {
      await ipc.unmarkReviewNeeded(space, conceptId);
      await refreshSpace(space);
      setNotice(`"${title}" 복습 표시를 해제했어요`);
    } catch (e) {
      setNotice(`해제 실패: ${String(e)}`);
    }
  };
  // 복습 표시 — reason 은 사용자가 직접 쓴 말이고, 그대로 evidence 가 된다(evidence ≥ 1).
  // 파인만 루프 밖에서도 표시할 수 있다: "이건 아직 모르겠다" 는 판단은 언제나 사용자 몫이다.
  const markReview = async (space: string, conceptId: string, title: string, sourceId: string, reason: string) => {
    try {
      await ipc.markReviewNeeded(space, conceptId, sourceId, [reason]);
      await refreshSpace(space);
      setNotice(`"${title}" 을(를) 복습 필요로 표시했어요`);
    } catch (e) {
      setNotice(`표시 실패: ${String(e)}`);
    }
  };
  const userRelation = (space: string, part: Pick<Relation, "sourceNodeId" | "targetNodeId" | "relationType" | "evidence">): Relation => {
    const now = new Date().toISOString();
    return {
      id: `rel-user-${crypto.randomUUID()}`,
      spaceId: spaces.find((s) => s.slug === space)?.id ?? "",
      strength: 1,
      confidence: 1,
      explanation: "사용자 직접 연결",
      createdAt: now,
      updatedAt: now,
      ...part,
    };
  };

  // ── LLM: 위키 생성 / 간극 점검 / 정리 글 변환 (Source 의 원본 노트에서) ──
  // 추출 코어 — 상태줄만 반환. busy/리로드/탭 열기는 호출자 몫(genWiki 단독 · convertNote 병렬 공용).
  const extractForNote = async (space: string, note: ArchiveNote): Promise<{ status: string; firstWikiPath?: string }> => {
    const sp = spaces.find((s) => s.slug === space);
    const input: LlmWikiInput = {
      sourceTitle: note.title,
      sourceText: note.markdown,
      // 노트가 참조하는 원본 파일 — 없으면 sanitizeSourceRefs 가 모든 sourceRefs 를 제거한다.
      sourceFiles: embedSourceFiles(note.sourceId, note.markdown),
      subjects: note.subjectIds.map((id) => ({ id, name: id })),
      // 정리 글(합성) 페이지는 개념이 아니다 — 중복 힌트에서 제외.
      existingConcepts: (wikiBySlug[space] ?? [])
        .filter((w) => !isSynthesisPage(w))
        .map((w) => ({ id: w.conceptId, title: w.title, normalizedTitle: w.title.toLowerCase() })),
    };
    const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
    const { result, engine, warning, promotion, nodeTypes } = await runWikiGeneration(input, apiKey, { chunk: chunkOpts() });
    // feature 3: Liner fact-check — 관계 근거에 권위 출처 URL 누적(설정 게이트, advisory).
    const fc = await maybeFactCheck(result);
    const applied = await applyLlmResult(
      space,
      sp?.id ?? "",
      note.subjectIds,
      fc.result,
      { sourceId: note.sourceId, archivePath: `archive/${note.path}` },
      wikiBySlug[space] ?? [],
    );
    const mergedNote = applied.merged > 0 ? ` (기존 ${applied.merged}개 병합)` : "";
    // [E] 연결성 게이트 advisory — 이번 추출에서 어디에도 안 붙은(고립) 개념 수 표시.
    const isoNote = promotion && promotion.staging > 0 ? ` · 고립 ${promotion.staging}개` : "";
    // [B] 청킹 켰을 때 조각 정보 유형 분포.
    const TYPE_KO: Record<string, string> = { concept: "개념", fact: "사실", claim: "주장", example: "예시", method: "방법", question: "질문" };
    const typeNote = nodeTypes ? ` · 유형 ${Object.entries(nodeTypes).map(([t, n]) => `${TYPE_KO[t] ?? t} ${n}`).join(", ")}` : "";
    // [D] 출처 tier(Source.type→1차/2차) 레지스트리로 병합 개념의 신뢰도·교차검증 집계.
    const srcTypes = await ipc.listSourceTypes(space);
    const registry = new Map<string, SourceMeta>(srcTypes.map(([id, t]) => [id, { sourceId: id, tier: tierFromSourceType(t) }]));
    const prov = aggregateProvenance(applied.pages.map((p) => p.sourceIds), registry);
    const provNote =
      prov.count > 0
        ? ` · 출처신뢰 ${Math.round(prov.avgScore * 100)}%${prov.multiSource > 0 ? ` · 교차검증 ${prov.multiSource}개` : ""}`
        : "";
    const fcNote = fc.checked > 0 ? ` · 출처검증 ${fc.checked}건` : "";
    return {
      status: `${engine === "gemini" ? "Gemini" : "휴리스틱"}로 위키 ${applied.pages.length}개 · 관계 ${applied.relationCount}개${mergedNote}${isoNote}${typeNote}${provNote}${fcNote}${warning ? " · Gemini 실패→휴리스틱" : ""}`,
      firstWikiPath: applied.pages[0]?.path,
    };
  };

  const genWiki = async (space: string, note: ArchiveNote) => {
    const key = docKey(space, note.path);
    setAiBusy(key);
    try {
      const r = await extractForNote(space, note);
      await refreshSpace(space);
      setAiStatus((s) => ({ ...s, [key]: r.status }));
      if (r.firstWikiPath) openWiki(space, r.firstWikiPath);
    } catch (e) {
      setAiStatus((s) => ({ ...s, [key]: `실패: ${String(e)}` }));
    } finally {
      setAiBusy("");
    }
  };

  // ── 정리 글 변환 (ADR-0008) — 합성 스트리밍 + 개념 추출 병렬 실행, 실패 격리 ──
  const startConvert = async (space: string, note: ArchiveNote) => {
    const key = docKey(space, note.path);
    setAiBusy(key);
    try {
      const [, extract] = await Promise.allSettled([
        useConvertStore.getState().runConvert({
          space,
          spaceId: spaces.find((s) => s.slug === space)?.id ?? "",
          note,
          existing: wikiBySlug[space] ?? [],
        }),
        extractForNote(space, note),
      ]);
      await refreshSpace(space);
      // 합성 결과는 ConvertPanel(convertStore)이 표시 — 상태줄은 추출 몫만.
      setAiStatus((s) => ({
        ...s,
        [key]: extract.status === "fulfilled" ? extract.value.status : `추출 실패: ${String(extract.reason)}`,
      }));
    } finally {
      setAiBusy("");
    }
  };

  const convertNote = (space: string, note: ArchiveNote) => {
    const j = useConvertStore.getState().job;
    if (j && (j.status === "streaming" || j.status === "saving")) {
      setNotice("이미 변환 중이에요");
      return;
    }
    if (openTabs.find((t) => t.id === `archive:${space}:${note.path}`)?.dirty) {
      setNotice("미저장 편집이 있어요 — 저장 후 변환하세요");
      return;
    }
    // embed 뿐인 노트 방지 — 합성할 텍스트가 있어야 한다.
    if (note.markdown.replace(/!\[\[[^\]]+\]\]/g, "").trim().length < 20) {
      setNotice("내용이 부족해요 — 파편을 먼저 적어주세요");
      return;
    }
    // 기존 정리본 존재 → 변환(토큰 소비) 전에 덮어쓰기 확인.
    if ((wikiBySlug[space] ?? []).some((w) => w.conceptId === synthesisConceptId(note.sourceId))) {
      setDialog({ kind: "overwrite-syn", space, file: note.path, title: note.title });
      return;
    }
    void startConvert(space, note);
  };
  // 간극 점검 — Liner(주) → OpenAI 소크라테스(보조) → 휴리스틱(오프라인) 3단 폴백.
  // 단일 진행(single-flight): 하나 도는 동안 다른 노트의 점검 시작 금지 + 소유자만 busy 해제.
  const gapRunSeq = useRef(0);
  const checkGaps = async (space: string, note: ArchiveNote) => {
    if (gapBusy) return;
    const key = docKey(space, note.path);
    setGapBusy(key);
    try {
      const geminiKey = (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
      const report = await buildGaps(note.title, note.markdown, { liner: getLinerKey(), gemini: geminiKey });
      // v(논스) — 같은 질문 목록이라도 재점검 시 GapPanel 을 리마운트(Liner 선택지는 비결정적).
      setGaps((g) => ({ ...g, [key]: { ...report, v: ++gapRunSeq.current } }));
    } finally {
      setGapBusy((cur) => (cur === key ? "" : cur));
    }
  };
  const clearGaps = (key: string) =>
    setGaps((g) => {
      const next = { ...g };
      delete next[key];
      return next;
    });
  // 간극 점검 응답을 노트 하단에 사용자 소유 텍스트로 덧붙인다(archive 는 사용자 원문 — 사용자 액션만 허용).
  // 편집 중이면 열린 드래프트를 기준으로 저장(미저장 편집 유실 방지).
  const appendGapAnswers = async (space: string, note: ArchiveNote, answers: { prompt: string; answer: string }[]) => {
    const filled = answers.filter((a) => a.answer.trim());
    if (filled.length === 0) return;
    const key = docKey(space, note.path);
    const base = drafts[key] ?? note.markdown;
    const block = "\n\n## 간극 점검 메모\n\n" + filled.map((a) => `- **Q:** ${a.prompt}\n  **A:** ${a.answer.trim()}`).join("\n");
    await saveArchiveDoc(space, note.path, base + block);
    setNotice("간극 점검 응답을 노트에 저장했어요");
  };

  // Import 완료 후 해당 공간의 notes/wiki/graph 재로딩
  const refreshSpace = async (space: string) => {
    const [n, w, g] = await Promise.all([ipc.listNotes(space), ipc.listWiki(space), ipc.getGraph(space)]);
    setNotesBySlug((m) => ({ ...m, [space]: n }));
    setWikiBySlug((m) => ({ ...m, [space]: w }));
    setGraphBySlug((m) => ({ ...m, [space]: g }));
  };

  const openSettings = () => setSettingsOpen(true);

  // ⌘K 검색 대상(전체 vault)
  const allFiles: SearchItem[] = spaces.flatMap((s) => [
    ...(wikiBySlug[s.slug] ?? []).map((w) => ({ kind: "wiki" as const, space: s.slug, spaceName: s.name, file: w.path, title: w.title, body: w.markdown })),
    ...(notesBySlug[s.slug] ?? []).map((nt) => ({ kind: "archive" as const, space: s.slug, spaceName: s.name, file: nt.path, title: nt.title, body: nt.markdown })),
  ]);
  const pickSearch = (it: SearchItem) => {
    if (it.kind === "wiki") openWiki(it.space, it.file);
    else openArchive(it.space, it.file);
    setPaletteOpen(false);
  };

  // ── 새 탭 런처 데이터 — 검색 대상·최근·고정 (삭제/이동된 문서는 resolve 실패로 자연 제외) ──
  const launcherDocOf = (id: string): LauncherDoc | null => {
    const [kind, space, ...rest] = id.split(":");
    if (kind !== "wiki" && kind !== "archive") return null;
    const file = rest.join(":");
    const list = kind === "wiki" ? wikiBySlug[space] : notesBySlug[space];
    const doc = (list ?? []).find((d) => d.path === file);
    return doc ? { kind, space, spaceName: spaceNameOf(space), file, title: doc.title } : null;
  };
  const launcherRecent = recentDocs.map(launcherDocOf).filter((d): d is LauncherDoc => !!d).slice(0, 6);
  const launcherPinned = pinnedDocs.map(launcherDocOf).filter((d): d is LauncherDoc => !!d);
  const launcher = (emptyTabId?: string) => {
    const go = (open: () => void) => {
      // 런처 탭은 목적지를 연 뒤 닫는다 — 브라우저 새 탭처럼 소모성
      open();
      if (emptyTabId) closeTab(emptyTabId);
    };
    return (
      <NewTabPane
        docs={allFiles}
        recent={launcherRecent}
        pinned={launcherPinned}
        onOpenDoc={(d) => go(() => (d.kind === "wiki" ? openWiki(d.space, d.file) : openArchive(d.space, d.file)))}
        onNewNote={() => go(() => openNewNote(currentSpace))}
        onGraph={() => go(() => openGraph(currentSpace))}
      />
    );
  };

  // 위키 리더(DocView)
  const wikiReader = (space: string, page: WikiPageT) => {
    const key = docKey(space, page.path);
    const tabId = `wiki:${space}:${page.path}`;
    const sections = conceptSections(space, page);
    // 관계형(헤더) — related_to 이웃 = 사용자가 잇는 "연결된 노트". 타입별 전체 관계는 하단 개념 섹션이 담당.
    // 후보에서는 모든 타입의 기존 이웃을 제외 — 이미 prerequisite 등으로 이어진 쌍에 평행 related_to 를 얹지 않는다.
    const g = graphBySlug[space];
    const linked: LinkedItem[] = [];
    const linkedIds = new Set<string>();
    const neighborIds = new Set<string>([page.conceptId]);
    if (g) {
      for (const r of g.relations) {
        const otherId = r.sourceNodeId === page.conceptId ? r.targetNodeId : r.targetNodeId === page.conceptId ? r.sourceNodeId : null;
        if (!otherId) continue;
        neighborIds.add(otherId);
        if (r.relationType !== "related_to" || linkedIds.has(otherId)) continue;
        const node = g.nodes.find((n) => n.id === otherId);
        if (!node) continue;
        linkedIds.add(otherId);
        linked.push({ key: otherId, label: node.title, onClick: () => openWiki(space, node.path) });
      }
    }
    const candidates = (wikiBySlug[space] ?? [])
      .filter((w) => !isSynthesisPage(w) && !neighborIds.has(w.conceptId))
      .map((w) => ({ key: w.path, label: w.title }));
    return (
      <DocView
        docType="wiki"
        title={page.title}
        header={
          <PageHeader
            docType="wiki"
            title={page.title}
            onRename={(t) => void applyRename({ kind: "rename-wiki", space, file: page.path, title: page.title }, t)}
            subjects={subjectsBySlug[space] ?? []}
            subjectIds={page.subjectIds}
            onToggleSubject={(id) => toggleWikiSubject(space, page.path, id)}
            pinned={pinnedDocs.includes(tabId)}
            onTogglePin={() => togglePinned(tabId)}
            createdAt={page.createdAt}
            updatedAt={page.updatedAt}
            filePath={`wiki/${page.path}`}
            linked={linked}
            candidates={candidates}
            onAddLink={(path) => {
              const target = (wikiBySlug[space] ?? []).find((w) => w.path === path);
              if (!target) return;
              // evidence.sourceId 는 실재 Source 여야 한다(가짜 id 를 relations.json 에 남기지 않는다).
              const evidenceSource = page.sourceIds[0] ?? target.sourceIds[0];
              if (!evidenceSource) {
                setNotice("두 페이지 모두 원본 소스가 없어 연결 근거를 만들 수 없어요");
                return;
              }
              void addUserLink(
                space,
                userRelation(space, {
                  sourceNodeId: page.conceptId,
                  targetNodeId: target.conceptId,
                  relationType: "related_to",
                  evidence: [{ sourceId: evidenceSource, reason: "사용자가 페이지 헤더에서 직접 연결" }],
                }),
              );
            }}
          />
        }
        savedMd={page.markdown}
        isEditing={editing.has(key)}
        draft={drafts[key] ?? page.markdown}
        onToggleEdit={() => toggleEdit(key, page.markdown)}
        onChangeDraft={(md) => {
          setDraft(key, md);
          setTabDirty(tabId, md !== page.markdown);
        }}
        onSave={() => saveWikiDoc(space, page, drafts[key] ?? page.markdown)}
        onLink={(t) => resolveLink(space, t)}
        linkExists={linkExistsIn(space)}
        embedSpace={space}
        toolSlot={<RelationQuality relations={g?.relations ?? []} />}
        sources={sections.sources}
        relationGroups={sections.relationGroups}
        confused={sections.confused}
        conflicts={sections.conflicts}
      />
    );
  };

  // 원본 리더(DocView + AI)
  const sourceReader = (space: string, note: ArchiveNote) => {
    const key = docKey(space, note.path);
    const tabId = `archive:${space}:${note.path}`;
    // 변환 미리보기는 job 의 노트 화면에서만 렌더 (탭 전환 후 복귀 시 재부착)
    const convertHere = !!convertJob && convertJob.space === space && convertJob.notePath === note.path;
    // 관계형(헤더) — 이 노트(Source)를 target 으로 갖는 개념들. ArchiveNote 는 관계 노드가 아니므로
    // 연결은 항상 개념 → Source(extracted_from) 방향으로 만든다 (relation-types.md 매트릭스).
    const g = graphBySlug[space];
    const linked: LinkedItem[] = [];
    const linkedIds = new Set<string>();
    if (g) {
      for (const r of g.relations) {
        if (r.targetNodeId !== note.sourceId || linkedIds.has(r.sourceNodeId)) continue;
        const node = g.nodes.find((n) => n.id === r.sourceNodeId);
        if (!node) continue;
        linkedIds.add(r.sourceNodeId);
        linked.push({ key: node.id, label: node.title, onClick: () => openWiki(space, node.path) });
      }
    }
    const candidates = (wikiBySlug[space] ?? [])
      .filter((w) => !isSynthesisPage(w) && !linkedIds.has(w.conceptId))
      .map((w) => ({ key: w.path, label: w.title }));

    // 이 노트에서 나온 개념 중 사용자가 "아직 모르겠어요" 로 표시한 것.
    // 노트↔개념 경로는 둘이다: LLM 생성(WikiPage.sourceIds) + 사용자 수동 연결(extracted_from).
    // 둘을 합쳐야 빠짐이 없다. (relations 에 extracted_from 은 사용자가 만들 때만 생긴다)
    const reviewedIds = new Set(
      (g?.relations ?? [])
        .filter((r) => r.relationType === "review_needed" && r.sourceNodeId === r.targetNodeId)
        .map((r) => r.sourceNodeId),
    );
    const fromThisNote = new Set(
      (wikiBySlug[space] ?? []).filter((w) => w.sourceIds.includes(note.sourceId)).map((w) => w.conceptId),
    );
    for (const id of linkedIds) fromThisNote.add(id);
    const reviewedHere = (wikiBySlug[space] ?? [])
      .filter((w) => fromThisNote.has(w.conceptId) && reviewedIds.has(w.conceptId))
      .map((w) => ({ conceptId: w.conceptId, title: w.title, path: w.path }));

    return (
      <DocView
        docType="archive"
        title={note.title}
        header={
          <PageHeader
            docType="archive"
            title={note.title}
            onRename={(t) => void applyRename({ kind: "rename-note", space, file: note.path, title: note.title }, t)}
            subjects={subjectsBySlug[space] ?? []}
            subjectIds={note.subjectIds}
            onToggleSubject={(id) => toggleNoteSubject(space, note.path, id)}
            pinned={pinnedDocs.includes(tabId)}
            onTogglePin={() => togglePinned(tabId)}
            createdAt={note.createdAt}
            updatedAt={note.updatedAt}
            filePath={`archive/${note.path}`}
            linked={linked}
            candidates={candidates}
            onAddLink={(path) => {
              const w = (wikiBySlug[space] ?? []).find((x) => x.path === path);
              if (!w) return;
              // 백엔드 node_kind 는 id 접두사로 Source 를 판별 — 형식이 다른(외부 작성) 노트는 미리 안내.
              if (!note.sourceId.startsWith("source-")) {
                setNotice("원본 ID가 없는 노트라 관계를 만들 수 없어요");
                return;
              }
              void addUserLink(
                space,
                userRelation(space, {
                  sourceNodeId: w.conceptId,
                  targetNodeId: note.sourceId,
                  relationType: "extracted_from",
                  evidence: [{ sourceId: note.sourceId, archivePath: `archive/${note.path}`, reason: "사용자가 노트 페이지에서 직접 연결" }],
                }),
              );
            }}
          />
        }
        savedMd={note.markdown}
        isEditing={editing.has(key)}
        draft={drafts[key] ?? note.markdown}
        onToggleEdit={() => toggleEdit(key, note.markdown)}
        onChangeDraft={(md) => {
          setDraft(key, md);
          setTabDirty(tabId, md !== note.markdown);
        }}
        onSave={() => saveArchiveDoc(space, note.path, drafts[key] ?? note.markdown)}
        onLink={(t) => resolveLink(space, t)}
        linkExists={linkExistsIn(space)}
        embedSpace={space}
        // 파인만은 원본 노트에서만 — 위키는 LLM 이 쓴 글이라 "자기 말로 설명"의 대상이 아니다.
        feynman={{ noteId: note.sourceId, space }}
        topSlot={
          <AiBar
            busy={aiBusy === key}
            gapBusy={gapBusy === key}
            status={aiStatus[key]}
            onGen={() => genWiki(space, note)}
            onGaps={() => checkGaps(space, note)}
            convertBusy={!!convertJob && (convertJob.status === "streaming" || convertJob.status === "saving")}
            convertStreaming={convertHere && convertJob?.status === "streaming"}
            onConvert={() => convertNote(space, note)}
            onCancelConvert={cancelConvert}
          />
        }
        sideSlot={
          convertHere && convertJob ? (
            <ConvertPanel
              job={convertJob}
              onCancel={cancelConvert}
              onClose={clearConvert}
              onOpen={() => convertJob.wikiPath && openWiki(space, convertJob.wikiPath)}
              onRetry={() => void startConvert(space, note)}
              onLink={(t) => resolveLink(space, t)}
              linkExists={linkExistsIn(space)}
            />
          ) : undefined
        }
        bottomSlot={
          <>
            {gaps[key] && (
              <GapPanel
                // 재점검마다 리마운트(v 논스) — 이전 선택이 새 질문/선택지에 매핑되는 것 방지
                key={gaps[key].v}
                questions={gaps[key].questions}
                engine={gaps[key].engine}
                onClose={() => clearGaps(key)}
                onSubmit={(answers) => appendGapAnswers(space, note, answers)}
              />
            )}
            <ReviewBar
              concepts={reviewedHere}
              onOpen={(id) => {
                const w = reviewedHere.find((c) => c.conceptId === id);
                if (w) openWiki(space, w.path);
              }}
            />
          </>
        }
      />
    );
  };

  // 활성 탭 본문 렌더 (Obsidian pane)
  const renderActiveTab = () => {
    if (!activeTab) {
      return launcher();
    }
    if (activeTab.kind === "empty") {
      return launcher(activeTab.id);
    }
    if (activeTab.kind === "home") {
      return (
        <StudyHome
          spaces={spaces}
          wikiBySlug={wikiBySlug}
          notesBySlug={notesBySlug}
          graphBySlug={graphBySlug}
          currentSpace={currentSpace}
          onOpenWiki={openWiki}
          onNewNote={() => openNewNote(currentSpace)}
          onNewFolder={() => setDialog({ kind: "new-space" })}
          onOpenGraph={openGraph}
        />
      );
    }
    // ?? 가 아니라 || — 빈 문자열("") space 도 유효 공간(currentSpace)으로 폴백해야 한다.
    // (Inbox 탭이 space:"" 로 열리면 saveSourceFile("") 가 "unknown space:" 로 실패)
    const sp = activeTab.space || currentSpace;
    switch (activeTab.kind) {
      case "wiki": {
        const page = (wikiBySlug[sp] ?? []).find((w) => w.path === activeTab.file);
        return page ? wikiReader(sp, page) : <EmptyState icon={<Icons.FileIcon size={28} />} title="위키를 찾을 수 없어요" description={activeTab.file} />;
      }
      case "archive": {
        const note = (notesBySlug[sp] ?? []).find((n) => n.path === activeTab.file);
        return note ? sourceReader(sp, note) : <EmptyState icon={<Icons.FileUpIcon size={28} />} title="원본을 찾을 수 없어요" description={activeTab.file} />;
      }
      case "graph":
        return (
          <GraphSection
            key={activeTab.id}
            spaces={spaces}
            graphBySlug={graphBySlug}
            wikiBySlug={wikiBySlug}
            space={sp}
            onOpenWiki={openWiki}
            onOpenArchive={openArchive}
            onUnmarkReview={unmarkReview}
            onMarkReview={markReview}
          />
        );
      case "inbox": {
        const tabId = activeTab.id;
        return (
          <InboxSection
            // 노트 하나 = 탭 하나. 탭의 고유 id 가 곧 draftKey — 탭 전환 unmount 돼도 이 key 로 스토어에서 복원.
            key={tabId}
            draftKey={tabId}
            onDirtyChange={(d) => setTabDirty(tabId, d)}
            // 제목을 탭 라벨로 — 여러 노트 탭을 구분(빈 제목이면 "새 노트").
            onTitleChange={(t) => renameTab(tabId, t.trim() || "새 노트")}
            space={sp}
            spaceId={spaces.find((s) => s.slug === sp)?.id ?? ""}
            subjectIdsDefault={wikiBySlug[sp]?.[0]?.subjectIds ?? []}
            existing={wikiBySlug[sp] ?? []}
            spaces={spaces}
            wikiBySlug={wikiBySlug}
            onCreateSpace={createNewSpace}
            onOpenWiki={openWiki}
            onRefresh={(s) => refreshSpace(s)}
            onNotice={setNotice}
            quickMemoOpen={memoOpen}
            onToggleQuickMemo={() => setMemoOpen((v) => !v)}
          />
        );
      }
      default:
        return null;
    }
  };

  // Inbox/Graph 는 분할 레이아웃이라 풀-블리드(스크롤은 각 패널이 소유)
  const fullBleed = !!activeTab && (activeTab.kind === "inbox" || activeTab.kind === "graph");

  // 상태바 경로 라벨
  // 현재 위치 경로 — 하단 상태바 우측에 표시한다.
  // 본문 위 별도 행(PaneHeader)에 크게 그리던 것을 여기로 내렸다: 경로는 "지금 어디인가"를 알려주는
  // 상태 정보이지 조작이 아니다. 조작이 아닌 것에 화면 한 줄을 내줄 이유가 없다.
  //  Home  ·  Home > 컴퓨터개론 > Inbox  ·  Home > 컴퓨터개론 > Wiki > 어텐션
  const pathParts: string[] = ["Home"];
  if (activeTab && activeTab.kind !== "home") {
    if (activeTab.kind === "empty") {
      pathParts.push("새 탭");
    } else {
      if (spaceName || currentSpace) pathParts.push(spaceName || currentSpace);
      pathParts.push(KIND_LABEL[activeTab.kind]);
      if (activeTab.kind === "wiki" || activeTab.kind === "archive") pathParts.push(activeTab.title);
    }
  } else if (!activeTab && (spaceName || currentSpace)) {
    pathParts.push(spaceName || currentSpace);
  }
  const pathLabel = pathParts.join(" › ");

  return (
    <div className="h-screen">
      <AppShell
        topBar={
          <TitlebarRow
            tabs={openTabs}
            activeId={activeTabId}
            onSelect={setActiveTab}
            onClose={requestCloseTab}
            onReorder={reorderTab}
            onNewTab={openEmptyTab}
            onToggleFiles={toggleLeftPane}
            filesOpen={!leftCollapsed}
            sidebarWidth={sidebarWidth}
            onSearch={() => setPaletteOpen(true)}
            // Inbox 탭일 때만 패널 토글을 띄운다 — 다른 탭엔 보조 패널이 없다.
            // 노트 = 탭이므로 draftKey 는 탭 id 그대로(InboxSection 에 넘기는 것과 같은 값).
            right={activeTab?.kind === "inbox" ? <InboxPanelToggles draftKey={activeTab.id} /> : undefined}
          />
        }
        leftRibbon={
          <Ribbon
            activeKind={activeTab?.kind}
            onHome={openHome}
            onInbox={openInbox}
            onGraph={() => openGraph(currentSpace)}
            onSettings={openSettings}
          />
        }
        sidebar={
          leftCollapsed ? undefined : (
            <Sidebar
              nodes={tree}
              selectedId={selectedTreeId}
              collapsedIds={collapsedTreeIds}
              onToggle={toggleTreeNode}
              onSelect={onTreeSelect}
              onMoveNode={handleMoveNode}
              onDragOutFile={handleDragOutFile}
              onDropFiles={handleDropFiles}
              onContextMenu={(id, x, y) => setMenu({ id, x, y })}
              width={sidebarWidth}
              onResize={setSidebarWidth}
              onResizeReset={() => setSidebarWidth(SIDEBAR_DEFAULT)}
              headerSlot={<SidebarHeader title={workspace?.name ?? "PiecePool"} onNewNote={() => openNewNote(currentSpace)} />}
              shortcutsSlot={
                <SidebarShortcuts
                  onNewFolder={() => setDialog({ kind: "new-space" })}
                  onToggleCollapseAll={onToggleCollapseAll}
                  allCollapsed={allCollapsed}
                  pinned={pinnedEntries.map(({ id, label }) => ({ id, label }))}
                  onOpenPinned={openPinned}
                  onUnpin={togglePinned}
                />
              }
            />
          )
        }
        statusBar={<StatusBar pathLabel={pathLabel} notice={notice} />}
        contentClassName="!p-0 !overflow-hidden flex min-h-0 flex-col"
      >
        {error && (
          <Card padding="md" className="m-3 text-[14px] text-ink-2">
            오류: {error}
          </Card>
        )}


        <div className={fullBleed ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto p-6"}>
          {booting ? <p className="p-6 text-[15px] text-ink-muted">불러오는 중…</p> : renderActiveTab()}
        </div>
      </AppShell>

      {paletteOpen && <SearchPalette items={allFiles} onPick={pickSearch} onClose={() => setPaletteOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} workspacePath={workspace?.rootPath} />}
      {memoOpen && <QuickMemo onClose={() => setMemoOpen(false)} />}

      {menu && menuItems.length > 0 && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      {dialog?.kind === "close-dirty" && (
        <ConfirmDialog
          title="저장하지 않은 변경이 있어요"
          message="탭을 닫으면 편집 중인 내용이 사라집니다."
          confirmLabel="닫기"
          danger
          onConfirm={() => {
            discardAndClose(dialog.tabId);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "overwrite-syn" && (
        <ConfirmDialog
          title="기존 정리본을 덮어씁니다"
          message="이 노트의 정리 글이 이미 있어요. 다시 변환하면 새 내용으로 교체됩니다 (직접 수정한 내용은 사라져요)."
          confirmLabel="다시 변환"
          onConfirm={() => {
            const note = (notesBySlug[dialog.space] ?? []).find((n) => n.path === dialog.file);
            setDialog(null);
            if (note) void startConvert(dialog.space, note);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {(dialog?.kind === "rename-note" || dialog?.kind === "rename-wiki") && (
        <PromptDialog
          title="이름 변경"
          initial={dialog.title}
          placeholder="새 제목"
          onSubmit={(v) => {
            applyRename(dialog, v);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "new-space" && (
        <PromptDialog
          title="새 폴더 생성"
          placeholder="예: 자료구조, 알고리즘"
          submitLabel="만들기"
          onSubmit={(v) => {
            createNewSpace(v);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rename-space" && (
        <PromptDialog
          title="폴더 이름 변경"
          initial={dialog.name}
          placeholder="새 이름"
          submitLabel="변경"
          onSubmit={(v) => {
            renameSpaceFlow(dialog.slug, v);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete-space" && (
        <ConfirmDialog
          title={`"${dialog.name}" 폴더 삭제`}
          message="이 폴더의 모든 노트·위키·관계가 함께 삭제됩니다. 되돌릴 수 없어요."
          confirmLabel="삭제"
          danger
          onConfirm={() => {
            deleteSpaceFlow(dialog.slug, dialog.name);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {(dialog?.kind === "delete-note" || dialog?.kind === "delete-wiki") && (
        <ConfirmDialog
          title={`"${dialog.title}" 삭제`}
          message={dialog.kind === "delete-wiki" ? "위키 파일과 이 개념에 연결된 관계가 함께 삭제됩니다. 되돌릴 수 없어요." : "원본 노트 파일이 삭제됩니다. 되돌릴 수 없어요."}
          confirmLabel="삭제"
          danger
          onConfirm={() => {
            applyDelete(dialog);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
