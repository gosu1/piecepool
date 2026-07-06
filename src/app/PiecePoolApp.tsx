import { useEffect, useRef, useState } from "react";
import { AppShell, Sidebar, Card, EmptyState, Icons } from "../ds";
import type { TreeNode } from "../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT, ArchiveNote, GraphData, Workspace } from "../lib/types";
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
import { DocView, AiBar, GapPanel, ConvertPanel } from "./panes/DocView";
import { GraphSection } from "./panes/GraphSection";
import { InboxSection } from "./panes/InboxSection";
import { StudyHome } from "./panes/StudyHome";
import { Ribbon } from "./shell/Ribbon";
import { PaneHeader } from "./shell/PaneHeader";
import { NewTabPane } from "./shell/NewTabPane";
import { StatusBar } from "./shell/StatusBar";
import { TitlebarRow } from "./shell/TitlebarRow";
import { SidebarHeader, SidebarShortcuts, SidebarFooter } from "./shell/SidebarChrome";
import { SearchPalette } from "./shell/SearchPalette";
import { SettingsModal } from "./shell/SettingsModal";
import { ContextMenu, ConfirmDialog, PromptDialog } from "./shell/Dialogs";
import { useWorkspaceStore, SIDEBAR_DEFAULT } from "../store/workspaceStore";
import type { TabKind } from "../store/workspaceStore";
import { useConvertStore } from "../store/convertStore";

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
  | { kind: "new-space" };

export default function PiecePoolApp() {
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [wikiBySlug, setWikiBySlug] = useState<Record<string, WikiPageT[]>>({});
  const [notesBySlug, setNotesBySlug] = useState<Record<string, ArchiveNote[]>>({});
  const [graphBySlug, setGraphBySlug] = useState<Record<string, GraphData>>({});

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

  // 셸 오버레이 — 트리 컨텍스트 메뉴 · 페인 "…" 메뉴 · 확인/입력 다이얼로그 · 상태바 알림
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number } | null>(null);
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
  const navBack = useWorkspaceStore((s) => s.navBack);
  const navForward = useWorkspaceStore((s) => s.navForward);
  const goBack = useWorkspaceStore((s) => s.goBack);
  const goForward = useWorkspaceStore((s) => s.goForward);
  const leftCollapsed = useWorkspaceStore((s) => s.leftCollapsed);
  const toggleLeftPane = useWorkspaceStore((s) => s.toggleLeftPane);
  const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
  const setSidebarWidth = useWorkspaceStore((s) => s.setSidebarWidth);
  const collapsedTreeIds = useWorkspaceStore((s) => s.collapsedTreeIds);
  const toggleTreeNode = useWorkspaceStore((s) => s.toggleTreeNode);

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
        await Promise.all(
          sp.map(async (s) => {
            const [wikis, notes, graph] = await Promise.all([ipc.listWiki(s.slug), ipc.listNotes(s.slug), ipc.getGraph(s.slug)]);
            w[s.slug] = wikis;
            n[s.slug] = notes;
            g[s.slug] = graph;
          }),
        );
        setWikiBySlug(w);
        setNotesBySlug(n);
        setGraphBySlug(g);
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

  // ⌘K/⌘O → 검색 팔레트 · ⌘N → 새 노트
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k" || k === "o") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (k === "n") {
        e.preventDefault();
        const sp = currentSpaceRef.current;
        if (sp) useWorkspaceStore.getState().openTab({ id: `inbox:${sp}`, kind: "inbox", title: "Inbox", space: sp });
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

  // 활성 탭 → 현재 공간 컨텍스트(브레드크럼·트리·VaultSwitcher가 따라감)
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
  const openInbox = (space: string) => openTab({ id: `inbox:${space}`, kind: "inbox", title: "Inbox", space });
  const openGraph = (space: string) => openTab({ id: `graph:${space}`, kind: "graph", title: "Graph", space });
  const openHome = () => openTab({ id: "home", kind: "home", title: "Study Home" });

  // 새 지식 공간(폴더) 생성 — 백엔드 create_space → 목록/집계 갱신 후 새 공간으로 이동
  const createNewSpace = async (name: string) => {
    try {
      const sp = await ipc.createSpace(name);
      const spaceList = await ipc.listSpaces();
      setSpaces(spaceList);
      setWikiBySlug((m) => ({ ...m, [sp.slug]: [] }));
      setNotesBySlug((m) => ({ ...m, [sp.slug]: [] }));
      setGraphBySlug((m) => ({ ...m, [sp.slug]: { nodes: [], relations: [] } }));
      setCurrentSpaceSlug(sp.slug);
      setNotice(`새 공간 "${sp.name}"을(를) 만들었어요`);
    } catch (e) {
      setNotice(`공간 만들기 실패: ${String(e)}`);
    }
  };
  // "+" 새 탭 — 현재 공간에 빈 노트를 만들고 편집 탭으로 연다.
  const handleNewNote = async () => {
    if (!currentSpace) return;
    try {
      const note = await ipc.createNote(currentSpace, "제목 없음", "", []);
      await refreshSpace(currentSpace);
      openTab({ id: `archive:${currentSpace}:${note.path}`, kind: "archive", title: note.title, space: currentSpace, file: note.path });
    } catch (e) {
      setNotice(`새 노트 생성 실패: ${String(e)}`);
    }
  };
  const selectSpace = (slug: string) => {
    setCurrentSpaceSlug(slug);
    const firstWiki = wikiBySlug[slug]?.[0];
    if (firstWiki) openWiki(slug, firstWiki.path);
  };

  // 미저장 편집이 있는 탭은 확인 후 닫기
  const requestCloseTab = (id: string) => {
    const tab = openTabs.find((t) => t.id === id);
    if (tab?.dirty) setDialog({ kind: "close-dirty", tabId: id });
    else closeTab(id);
  };
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
    closeTab(tabId);
  };

  // ── 사이드바 vault 트리(전체 vault) ──
  // source(archive) md 는 드래그 이동 가능, 공간 루트/ source 폴더가 드랍 대상.
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
        children: (wikiBySlug[s.slug] ?? []).map((w) => ({ id: `doc:wiki:${s.slug}:${w.path}`, label: w.title, type: "file" as const })),
      },
      {
        id: `af:${s.slug}`,
        label: "source",
        type: "folder",
        dropTarget: true,
        children: (notesBySlug[s.slug] ?? []).map((nt) => ({
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
  const selectedTreeId =
    activeTab && (activeTab.kind === "wiki" || activeTab.kind === "archive")
      ? `doc:${activeTab.kind === "wiki" ? "wiki" : "archive"}:${activeTab.space}:${activeTab.file}`
      : "";

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
    const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
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
      status: `${engine === "openai" ? "GPT" : "휴리스틱"}로 위키 ${applied.pages.length}개 · 관계 ${applied.relationCount}개${mergedNote}${isoNote}${typeNote}${provNote}${fcNote}${warning ? " · GPT 실패→휴리스틱" : ""}`,
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
      const openaiKey = (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
      const report = await buildGaps(note.title, note.markdown, { liner: getLinerKey(), openai: openaiKey });
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

  // 위키 리더(DocView)
  const wikiReader = (space: string, page: WikiPageT) => {
    const key = docKey(space, page.path);
    const tabId = `wiki:${space}:${page.path}`;
    const sections = conceptSections(space, page);
    return (
      <DocView
        docType="wiki"
        title={page.title}
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
    return (
      <DocView
        docType="archive"
        title={note.title}
        meta={`원본 · ${note.createdAt.slice(0, 10)} · ${note.path}`}
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
          gaps[key] ? (
            <GapPanel
              // 재점검마다 리마운트(v 논스) — 이전 선택이 새 질문/선택지에 매핑되는 것 방지
              key={gaps[key].v}
              questions={gaps[key].questions}
              engine={gaps[key].engine}
              onClose={() => clearGaps(key)}
              onSubmit={(answers) => appendGapAnswers(space, note, answers)}
            />
          ) : undefined
        }
      />
    );
  };

  // 활성 탭 본문 렌더 (Obsidian pane)
  const renderActiveTab = () => {
    if (!activeTab) {
      return <NewTabPane onCreate={() => openInbox(currentSpace)} onSwitch={() => setPaletteOpen(true)} />;
    }
    if (activeTab.kind === "empty") {
      const id = activeTab.id;
      return (
        <NewTabPane
          onCreate={() => {
            closeTab(id);
            openInbox(currentSpace);
          }}
          onSwitch={() => setPaletteOpen(true)}
          onClose={() => closeTab(id)}
        />
      );
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
          onNewNote={() => openInbox(currentSpace)}
          onOpenGraph={openGraph}
          onSelectSpace={selectSpace}
        />
      );
    }
    const sp = activeTab.space ?? currentSpace;
    const spName = spaces.find((s) => s.slug === sp)?.name ?? "";
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
            spaceName={spName}
            onOpenWiki={openWiki}
            onOpenArchive={openArchive}
          />
        );
      case "inbox":
        return (
          <InboxSection
            key={activeTab.id}
            space={sp}
            spaceId={spaces.find((s) => s.slug === sp)?.id ?? ""}
            spaceName={spName}
            subjectIdsDefault={wikiBySlug[sp]?.[0]?.subjectIds ?? []}
            existing={wikiBySlug[sp] ?? []}
            spaces={spaces}
            wikiBySlug={wikiBySlug}
            onOpenWiki={(file) => openWiki(sp, file)}
            onRefresh={(s) => refreshSpace(s)}
          />
        );
      default:
        return null;
    }
  };

  // Inbox/Graph 는 분할 레이아웃이라 풀-블리드(스크롤은 각 패널이 소유)
  const fullBleed = !!activeTab && (activeTab.kind === "inbox" || activeTab.kind === "graph");

  // 상태바 경로 라벨
  const pathLabel = !activeTab
    ? currentSpace || ""
    : activeTab.kind === "home"
      ? "Study Home"
      : activeTab.kind === "empty"
        ? "새 탭"
        : activeTab.kind === "wiki"
          ? `${activeTab.space} / wiki / ${activeTab.file}`
          : activeTab.kind === "archive"
            ? `${activeTab.space} / archive / ${activeTab.file}`
            : `${activeTab.space ?? currentSpace} / ${activeTab.kind}`;

  // 페인 헤더 breadcrumb
  const crumbs = ["PiecePool"];
  if (activeTab?.kind === "home") {
    crumbs.push("Study Home");
  } else if (activeTab?.kind === "empty") {
    crumbs.push("새 탭");
  } else if (activeTab) {
    if (spaceName || currentSpace) crumbs.push(spaceName || currentSpace);
    crumbs.push(KIND_LABEL[activeTab.kind]);
    if (activeTab.kind === "wiki" || activeTab.kind === "archive") crumbs.push(activeTab.title);
  } else if (spaceName || currentSpace) {
    crumbs.push(spaceName || currentSpace);
  }
  const cleanCrumbs = crumbs.filter(Boolean) as string[];

  // 뒤로/앞으로 활성 여부 — 스택에 "지금 열려 있는" 다른 탭이 남아 있을 때만
  const canBack = navBack.some((id) => id !== activeTabId && openTabs.some((t) => t.id === id));
  const canForward = navForward.some((id) => id !== activeTabId && openTabs.some((t) => t.id === id));

  // 페인 "…" 메뉴 — 활성 탭 기준(닫기 + wiki/archive 는 파일 액션)
  const paneMenuItems = activeTab
    ? [
        { label: "탭 닫기", onClick: () => requestCloseTab(activeTab.id) },
        ...(activeTab.kind === "wiki" || activeTab.kind === "archive"
          ? [
              {
                label: "이름 변경…",
                onClick: () =>
                  setDialog({
                    kind: activeTab.kind === "wiki" ? ("rename-wiki" as const) : ("rename-note" as const),
                    space: activeTab.space ?? "",
                    file: activeTab.file ?? "",
                    title: activeTab.title,
                  }),
              },
              {
                label: "삭제…",
                danger: true,
                onClick: () =>
                  setDialog({
                    kind: activeTab.kind === "wiki" ? ("delete-wiki" as const) : ("delete-note" as const),
                    space: activeTab.space ?? "",
                    file: activeTab.file ?? "",
                    title: activeTab.title,
                  }),
              },
            ]
          : []),
      ]
    : [];

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
            onNewTab={handleNewNote}
            onToggleFiles={toggleLeftPane}
            filesOpen={!leftCollapsed}
            onSearch={() => setPaletteOpen(true)}
          />
        }
        leftRibbon={
          <Ribbon
            activeKind={activeTab?.kind}
            onHome={openHome}
            onGraph={() => openGraph(currentSpace)}
            onCapture={() => openInbox(currentSpace)}
            onSearch={() => setPaletteOpen(true)}
            onToggleFiles={toggleLeftPane}
            filesOpen={!leftCollapsed}
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
              headerSlot={<SidebarHeader title={workspace?.name ?? "PiecePool"} onSearch={() => setPaletteOpen(true)} onNewNote={() => openInbox(currentSpace)} />}
              shortcutsSlot={<SidebarShortcuts onHome={openHome} onNewFolder={() => setDialog({ kind: "new-space" })} />}
              footer={<SidebarFooter spaces={spaces} currentSpace={currentSpace} onSpace={selectSpace} onSettings={openSettings} />}
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

        {/* 페인 헤더 — 뒤로/앞으로 · 위치 경로 · "…" 메뉴 */}
        <PaneHeader
          crumbs={cleanCrumbs}
          canBack={canBack}
          canForward={canForward}
          onBack={goBack}
          onForward={goForward}
          onMenu={activeTab ? (x, y) => setPaneMenu({ x, y }) : undefined}
        />

        <div className={fullBleed ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto p-6"}>
          {booting ? <p className="p-6 text-[15px] text-ink-muted">불러오는 중…</p> : renderActiveTab()}
        </div>
      </AppShell>

      {paletteOpen && <SearchPalette items={allFiles} onPick={pickSearch} onClose={() => setPaletteOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} workspacePath={workspace?.rootPath} />}

      {menu && menuItems.length > 0 && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {paneMenu && paneMenuItems.length > 0 && <ContextMenu x={paneMenu.x} y={paneMenu.y} items={paneMenuItems} onClose={() => setPaneMenu(null)} />}

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
