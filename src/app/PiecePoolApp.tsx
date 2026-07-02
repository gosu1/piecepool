import { useEffect, useState } from "react";
import { AppShell, TopBar, Sidebar, Card, EmptyState, Icons } from "../ds";
import type { TreeNode } from "../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT, ArchiveNote, GraphData } from "../lib/types";
import * as ipc from "../lib/ipc";
import { runWikiGeneration } from "../llm/generate";
import type { LlmWikiInput } from "../llm/provider";
import { applyLlmResult } from "../lib/llmApply";
import { heuristicGaps } from "../llm/gaps";
import type { GapQuestion } from "../llm/gaps";
import { chunkOpts } from "../lib/settings";
import { aggregateProvenance, tierFromSourceType, type SourceMeta } from "../llm/provenance";
import { docKey } from "./types";
import type { SearchItem } from "./types";
import { DocView, AiBar, GapPanel } from "./panes/DocView";
import { GraphSection } from "./panes/GraphSection";
import { InboxSection } from "./panes/InboxSection";
import { Ribbon } from "./shell/Ribbon";
import { VaultSwitcher } from "./shell/VaultSwitcher";
import { Breadcrumb } from "./shell/Breadcrumb";
import { StatusBar } from "./shell/StatusBar";
import { TabStrip } from "./shell/TabStrip";
import { SearchPalette } from "./shell/SearchPalette";
import { SettingsModal } from "./shell/SettingsModal";
import { AccountFooter } from "./shell/AccountFooter";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { TabKind } from "../store/workspaceStore";

const KIND_LABEL: Record<TabKind, string> = { wiki: "Wiki", archive: "Source", source: "Source", inbox: "Inbox", graph: "Graph", home: "Home" };

export default function PiecePoolApp() {
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [wikiBySlug, setWikiBySlug] = useState<Record<string, WikiPageT[]>>({});
  const [notesBySlug, setNotesBySlug] = useState<Record<string, ArchiveNote[]>>({});
  const [graphBySlug, setGraphBySlug] = useState<Record<string, GraphData>>({});

  const [currentSpaceSlug, setCurrentSpaceSlug] = useState<string>("");

  // 인라인 편집 / LLM / 검색 팔레트
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiBusy, setAiBusy] = useState<string>("");
  const [aiStatus, setAiStatus] = useState<Record<string, string>>({});
  const [gaps, setGaps] = useState<Record<string, GapQuestion[]>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [error, setError] = useState("");
  const [booting, setBooting] = useState(true);

  // 셸 상태(P0 workspaceStore) — 열린 탭 · 활성 탭 · 사이드바 접기
  const openTabs = useWorkspaceStore((s) => s.openTabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const leftCollapsed = useWorkspaceStore((s) => s.leftCollapsed);
  const toggleLeftPane = useWorkspaceStore((s) => s.toggleLeftPane);

  // 부팅: 시드 → spaces → 각 공간 wiki/notes/graph/sources → 첫 위키를 탭으로 연다
  useEffect(() => {
    (async () => {
      try {
        await ipc.getWorkspace();
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
        if (sp[0]) {
          setCurrentSpaceSlug(sp[0].slug);
          const firstWiki = w[sp[0].slug]?.[0];
          if (firstWiki) {
            openTab({ id: `wiki:${sp[0].slug}:${firstWiki.path}`, kind: "wiki", title: firstWiki.title, space: sp[0].slug, file: firstWiki.path });
          }
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘K → 검색 팔레트
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 활성 탭 → 현재 공간 컨텍스트(브레드크럼·트리·VaultSwitcher가 따라감)
  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;
  const currentSpace = activeTab?.space || currentSpaceSlug || spaces[0]?.slug || "";
  const spaceName = spaces.find((s) => s.slug === currentSpace)?.name ?? "";

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
  const selectSpace = (slug: string) => {
    setCurrentSpaceSlug(slug);
    const firstWiki = wikiBySlug[slug]?.[0];
    if (firstWiki) openWiki(slug, firstWiki.path);
  };

  // ── 사이드바 vault 트리(전체 vault) ──
  const tree: TreeNode[] = spaces.map((s) => ({
    id: `sp:${s.slug}`,
    label: s.name,
    type: "folder",
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
        children: (notesBySlug[s.slug] ?? []).map((nt) => ({ id: `doc:archive:${s.slug}:${nt.path}`, label: nt.title, type: "file" as const })),
      },
    ],
  }));
  const onTreeSelect = (id: string) => {
    const [k, kind, slug, file] = id.split(":");
    if (k !== "doc") return;
    if (kind === "wiki") openWiki(slug, file);
    else openArchive(slug, file);
  };
  const selectedTreeId =
    activeTab && (activeTab.kind === "wiki" || activeTab.kind === "archive")
      ? `doc:${activeTab.kind === "wiki" ? "wiki" : "archive"}:${activeTab.space}:${activeTab.file}`
      : "";

  // 위키 페이지의 관련 개념(그래프 relation 이웃) — Karpathy식 "see also"
  const relatedConcepts = (space: string, conceptId: string): { title: string; path: string }[] => {
    const g = graphBySlug[space];
    if (!g) return [];
    const ids = new Set<string>();
    for (const r of g.relations) {
      if (r.sourceNodeId === conceptId) ids.add(r.targetNodeId);
      else if (r.targetNodeId === conceptId) ids.add(r.sourceNodeId);
    }
    const out: { title: string; path: string }[] = [];
    ids.forEach((id) => {
      const node = g.nodes.find((x) => x.id === id);
      if (node) out.push({ title: node.title, path: node.path });
    });
    return out;
  };

  // [[대상]] → 같은 공간 위키 탭 열기
  const resolveLink = (space: string, target: string) => {
    const pages = wikiBySlug[space] ?? [];
    const hit = pages.find((p) => p.title === target) || pages.find((p) => p.title.toLowerCase() === target.toLowerCase());
    if (hit) openWiki(space, hit.path);
  };

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
  const endEdit = (key: string) =>
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  const saveWikiDoc = async (space: string, page: WikiPageT, md: string) => {
    const saved = await ipc.saveWiki(space, { ...page, markdown: md });
    setWikiBySlug((m) => ({ ...m, [space]: (m[space] ?? []).map((x) => (x.path === page.path ? saved : x)) }));
    endEdit(docKey(space, page.path));
  };
  const saveArchiveDoc = async (space: string, file: string, md: string) => {
    const saved = await ipc.saveNote(space, file, md);
    setNotesBySlug((m) => ({ ...m, [space]: (m[space] ?? []).map((x) => (x.path === file ? saved : x)) }));
    endEdit(docKey(space, file));
  };

  // ── LLM: 위키 생성 / 간극 점검 (Source 의 원본 노트에서) ──
  const genWiki = async (space: string, note: ArchiveNote) => {
    const key = docKey(space, note.path);
    setAiBusy(key);
    try {
      const sp = spaces.find((s) => s.slug === space);
      const input: LlmWikiInput = {
        sourceTitle: note.title,
        sourceText: note.markdown,
        subjects: note.subjectIds.map((id) => ({ id, name: id })),
        existingConcepts: (wikiBySlug[space] ?? []).map((w) => ({ id: w.conceptId, title: w.title, normalizedTitle: w.title.toLowerCase() })),
      };
      const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
      const { result, engine, warning, promotion, nodeTypes } = await runWikiGeneration(input, apiKey, { chunk: chunkOpts() });
      const applied = await applyLlmResult(
        space,
        sp?.id ?? "",
        note.subjectIds,
        result,
        { sourceId: note.sourceId, archivePath: `archive/${note.path}` },
        wikiBySlug[space] ?? [],
      );
      const [wikis, g] = await Promise.all([ipc.listWiki(space), ipc.getGraph(space)]);
      setWikiBySlug((m) => ({ ...m, [space]: wikis }));
      setGraphBySlug((m) => ({ ...m, [space]: g }));
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
      setAiStatus((s) => ({
        ...s,
        [key]: `${engine === "openai" ? "GPT" : "휴리스틱"}로 위키 ${applied.pages.length}개 · 관계 ${applied.relationCount}개${mergedNote}${isoNote}${typeNote}${provNote}${warning ? " · GPT 실패→휴리스틱" : ""}`,
      }));
      if (applied.pages[0]) openWiki(space, applied.pages[0].path);
    } catch (e) {
      setAiStatus((s) => ({ ...s, [key]: `실패: ${String(e)}` }));
    } finally {
      setAiBusy("");
    }
  };
  const checkGaps = (space: string, note: ArchiveNote) =>
    setGaps((g) => ({ ...g, [docKey(space, note.path)]: heuristicGaps(note.title, note.markdown) }));
  const clearGaps = (key: string) =>
    setGaps((g) => {
      const next = { ...g };
      delete next[key];
      return next;
    });

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
    return (
      <DocView
        docType="wiki"
        title={page.title}
        savedMd={page.markdown}
        isEditing={editing.has(key)}
        draft={drafts[key] ?? page.markdown}
        onToggleEdit={() => toggleEdit(key, page.markdown)}
        onChangeDraft={(md) => setDraft(key, md)}
        onSave={() => saveWikiDoc(space, page, drafts[key] ?? page.markdown)}
        onLink={(t) => resolveLink(space, t)}
        embedSpace={space}
        related={relatedConcepts(space, page.conceptId).map((r) => ({ title: r.title, onClick: () => openWiki(space, r.path) }))}
      />
    );
  };

  // 원본 리더(DocView + AI)
  const sourceReader = (space: string, note: ArchiveNote) => {
    const key = docKey(space, note.path);
    return (
      <DocView
        docType="archive"
        title={note.title}
        meta={`원본 · ${note.createdAt.slice(0, 10)} · ${note.path}`}
        savedMd={note.markdown}
        isEditing={editing.has(key)}
        draft={drafts[key] ?? note.markdown}
        onToggleEdit={() => toggleEdit(key, note.markdown)}
        onChangeDraft={(md) => setDraft(key, md)}
        onSave={() => saveArchiveDoc(space, note.path, drafts[key] ?? note.markdown)}
        onLink={(t) => resolveLink(space, t)}
        embedSpace={space}
        topSlot={<AiBar busy={aiBusy === key} status={aiStatus[key]} onGen={() => genWiki(space, note)} onGaps={() => checkGaps(space, note)} />}
        bottomSlot={gaps[key] ? <GapPanel questions={gaps[key]} onClose={() => clearGaps(key)} /> : undefined}
      />
    );
  };

  // 활성 탭 본문 렌더 (Obsidian pane)
  const renderActiveTab = () => {
    if (!activeTab) {
      return (
        <EmptyState
          icon={<Icons.FileIcon size={28} />}
          title="열린 노트가 없어요"
          description="왼쪽 파일 트리에서 노트를 열거나, 리본의 '새 노트'로 시작하세요."
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
            graph={graphBySlug[sp]}
            spaceName={spName}
            wikiPages={wikiBySlug[sp] ?? []}
            onOpenWiki={(file) => openWiki(sp, file)}
            onOpenArchive={(file) => openArchive(sp, file)}
          />
        );
      case "inbox":
        return (
          <InboxSection
            space={sp}
            spaceId={spaces.find((s) => s.slug === sp)?.id ?? ""}
            spaceName={spName}
            subjectIdsDefault={wikiBySlug[sp]?.[0]?.subjectIds ?? []}
            existing={wikiBySlug[sp] ?? []}
            notes={notesBySlug[sp] ?? []}
            onOpenNote={(n) => openArchive(sp, n.path)}
            onRefresh={() => refreshSpace(sp)}
          />
        );
      default:
        return null;
    }
  };

  // 상태바 경로 라벨
  const pathLabel = activeTab
    ? activeTab.kind === "wiki"
      ? `${activeTab.space} / wiki / ${activeTab.file}`
      : activeTab.kind === "archive"
        ? `${activeTab.space} / archive / ${activeTab.file}`
        : `${activeTab.space ?? currentSpace} / ${activeTab.kind}`
    : currentSpace || "";

  // TopBar breadcrumb
  const crumbs = ["PiecePool", spaceName || currentSpace];
  if (activeTab) {
    crumbs.push(KIND_LABEL[activeTab.kind]);
    if (activeTab.kind === "wiki" || activeTab.kind === "archive") crumbs.push(activeTab.title);
  }
  const cleanCrumbs = crumbs.filter(Boolean) as string[];

  return (
    <div className="h-screen">
      <AppShell
        topBar={
          <TopBar
            showActions={false}
            searchSlot={
              <div className="flex min-w-0 items-center gap-3">
                <VaultSwitcher spaces={spaces} currentSpace={currentSpace} onSpace={selectSpace} />
                <Breadcrumb crumbs={cleanCrumbs} />
              </div>
            }
          />
        }
        leftRibbon={
          <Ribbon
            activeKind={activeTab?.kind}
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
              key={`sb-${spaces.length}`}
              nodes={tree}
              selectedId={selectedTreeId}
              defaultExpandedIds={spaces.flatMap((s) => [`sp:${s.slug}`, `wf:${s.slug}`, `af:${s.slug}`])}
              onSelect={onTreeSelect}
              onAddFile={() => openInbox(currentSpace)}
              footer={<AccountFooter onSettings={openSettings} />}
            />
          )
        }
        statusBar={<StatusBar pathLabel={pathLabel} />}
        contentClassName="!p-0 !overflow-hidden flex min-h-0 flex-col"
      >
        {error && (
          <Card padding="md" className="m-3 text-[14px] text-ink-2">
            오류: {error}
          </Card>
        )}

        <TabStrip tabs={openTabs} activeId={activeTabId} onSelect={setActiveTab} onClose={closeTab} />

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {booting ? <p className="text-[15px] text-ink-muted">불러오는 중…</p> : renderActiveTab()}
        </div>
      </AppShell>

      {paletteOpen && <SearchPalette items={allFiles} onPick={pickSearch} onClose={() => setPaletteOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
