import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import {
  AppShell,
  TopBar,
  Sidebar,
  ConceptGraph,
  WikiPage,
  FileDropzone,
  Button,
  Card,
  EmptyState,
  Avatar,
  IconButton,
  useTheme,
  Icons,
  cn,
} from "../ds";
import type { TreeNode } from "../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT, ArchiveNote, GraphData } from "../lib/types";
import * as ipc from "../lib/ipc";
import { layoutGraph } from "../lib/graphLayout";
import { CytoscapeGraph, EDGE_COLOR } from "../lib/CytoscapeGraph";
import { Markdown } from "../lib/markdown";
import { MarkdownEditor } from "../lib/MarkdownEditor";
import { useImportStore } from "../store/importStore";
import { runWikiGeneration } from "../llm/generate";
import type { LlmWikiInput } from "../llm/provider";
import { applyLlmResult } from "../lib/llmApply";
import { heuristicGaps } from "../llm/gaps";
import type { GapQuestion } from "../llm/gaps";
import { runImageOcr } from "../llm/ocr";

// 상단 섹션
type Section = "inbox" | "wiki" | "source" | "graph";

// ⌘K 검색 항목 (제목 + 본문 전문 검색)
interface SearchItem {
  kind: "wiki" | "archive";
  space: string;
  spaceName: string;
  file: string;
  title: string;
  body: string;
}

const docKey = (space: string, path: string) => `${space}:${path}`;

export default function PiecePoolApp() {
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [wikiBySlug, setWikiBySlug] = useState<Record<string, WikiPageT[]>>({});
  const [notesBySlug, setNotesBySlug] = useState<Record<string, ArchiveNote[]>>({});
  const [graphBySlug, setGraphBySlug] = useState<Record<string, GraphData>>({});
  const [sourcesBySlug, setSourcesBySlug] = useState<Record<string, string[]>>({});

  // 상단 섹션 + 현재 공간 + 섹션별 선택 상태
  const [section, setSection] = useState<Section>("wiki");
  const [currentSpaceSlug, setCurrentSpaceSlug] = useState<string>("");
  const [selectedWiki, setSelectedWiki] = useState<string>(""); // wiki 파일명
  const [wikiMode, setWikiMode] = useState<"doc" | "project">("doc"); // project = 그래프
  const [selectedSource, setSelectedSource] = useState<string>(""); // archive 파일명

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

  // 부팅: 시드 → spaces → 각 공간 wiki/notes/graph/sources
  useEffect(() => {
    (async () => {
      try {
        await ipc.getWorkspace();
        const sp = await ipc.listSpaces();
        setSpaces(sp);
        const w: Record<string, WikiPageT[]> = {};
        const n: Record<string, ArchiveNote[]> = {};
        const g: Record<string, GraphData> = {};
        const src: Record<string, string[]> = {};
        await Promise.all(
          sp.map(async (s) => {
            const [wikis, notes, graph, sources] = await Promise.all([
              ipc.listWiki(s.slug),
              ipc.listNotes(s.slug),
              ipc.getGraph(s.slug),
              ipc.listSources(s.slug),
            ]);
            w[s.slug] = wikis;
            n[s.slug] = notes;
            g[s.slug] = graph;
            src[s.slug] = sources;
          }),
        );
        setWikiBySlug(w);
        setNotesBySlug(n);
        setGraphBySlug(g);
        setSourcesBySlug(src);
        if (sp[0]) {
          setCurrentSpaceSlug(sp[0].slug);
          setSelectedWiki(w[sp[0].slug]?.[0]?.path ?? "");
          setSelectedSource(n[sp[0].slug]?.[0]?.path ?? "");
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setBooting(false);
      }
    })();
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

  const currentSpace = currentSpaceSlug || spaces[0]?.slug || "";
  const wikiPages = wikiBySlug[currentSpace] ?? [];
  const notes = notesBySlug[currentSpace] ?? [];
  const sources = sourcesBySlug[currentSpace] ?? [];
  const graph = graphBySlug[currentSpace];

  // ── 네비게이션 ──
  const openWiki = (space: string, file: string) => {
    setSection("wiki");
    setCurrentSpaceSlug(space);
    setWikiMode("doc");
    setSelectedWiki(file);
  };
  const openArchive = (space: string, file: string) => {
    setSection("source");
    setCurrentSpaceSlug(space);
    setSelectedSource(file);
  };
  const selectSpace = (slug: string) => {
    setCurrentSpaceSlug(slug);
    setSelectedWiki(wikiBySlug[slug]?.[0]?.path ?? "");
    setSelectedSource(notesBySlug[slug]?.[0]?.path ?? "");
    setWikiMode("doc");
  };

  // ── 사이드바 vault 트리 ──
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
    section === "wiki" && wikiMode === "doc"
      ? `doc:wiki:${currentSpace}:${selectedWiki}`
      : section === "source"
        ? `doc:archive:${currentSpace}:${selectedSource}`
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

  // [[대상]] → 같은 공간 위키 선택
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
      const { result, engine, warning } = await runWikiGeneration(input, apiKey);
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
      setAiStatus((s) => ({
        ...s,
        [key]: `${engine === "openai" ? "GPT" : "휴리스틱"}로 위키 ${applied.pages.length}개 · 관계 ${applied.relationCount}개${mergedNote}${warning ? " · GPT 실패→휴리스틱" : ""}`,
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

  // 새 노트 생성(Inbox) → archive 저장 → Source 에서 열기
  // Import 완료 후 해당 공간의 notes/wiki/graph 재로딩
  const refreshSpace = async (space: string) => {
    const [n, w, g] = await Promise.all([ipc.listNotes(space), ipc.listWiki(space), ipc.getGraph(space)]);
    setNotesBySlug((m) => ({ ...m, [space]: n }));
    setWikiBySlug((m) => ({ ...m, [space]: w }));
    setGraphBySlug((m) => ({ ...m, [space]: g }));
  };

  const openSettings = () => setSettingsOpen(true);

  // ⌘K 검색 대상
  const allFiles: SearchItem[] = spaces.flatMap((s) => [
    ...(wikiBySlug[s.slug] ?? []).map((w) => ({ kind: "wiki" as const, space: s.slug, spaceName: s.name, file: w.path, title: w.title, body: w.markdown })),
    ...(notesBySlug[s.slug] ?? []).map((nt) => ({ kind: "archive" as const, space: s.slug, spaceName: s.name, file: nt.path, title: nt.title, body: nt.markdown })),
  ]);
  const pickSearch = (it: SearchItem) => {
    if (it.kind === "wiki") openWiki(it.space, it.file);
    else openArchive(it.space, it.file);
    setPaletteOpen(false);
  };

  // 선택된 문서
  const selectedWikiPage = wikiPages.find((w) => w.path === selectedWiki) ?? wikiPages[0];
  const selectedSourceNote = notes.find((n) => n.path === selectedSource) ?? notes[0];
  const spaceName = spaces.find((s) => s.slug === currentSpace)?.name ?? "";

  // 위키 리더(DocView)
  const wikiReader = (page: WikiPageT) => {
    const key = docKey(currentSpace, page.path);
    return (
      <DocView
        docType="wiki"
        title={page.title}
        savedMd={page.markdown}
        isEditing={editing.has(key)}
        draft={drafts[key] ?? page.markdown}
        onToggleEdit={() => toggleEdit(key, page.markdown)}
        onChangeDraft={(md) => setDraft(key, md)}
        onSave={() => saveWikiDoc(currentSpace, page, drafts[key] ?? page.markdown)}
        onLink={(t) => resolveLink(currentSpace, t)}
        embedSpace={currentSpace}
        related={relatedConcepts(currentSpace, page.conceptId).map((r) => ({ title: r.title, onClick: () => openWiki(currentSpace, r.path) }))}
      />
    );
  };

  // 원본 리더(DocView + AI)
  const sourceReader = (note: ArchiveNote) => {
    const key = docKey(currentSpace, note.path);
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
        onSave={() => saveArchiveDoc(currentSpace, note.path, drafts[key] ?? note.markdown)}
        onLink={(t) => resolveLink(currentSpace, t)}
        embedSpace={currentSpace}
        topSlot={<AiBar busy={aiBusy === key} status={aiStatus[key]} onGen={() => genWiki(currentSpace, note)} onGaps={() => checkGaps(currentSpace, note)} />}
        bottomSlot={gaps[key] ? <GapPanel questions={gaps[key]} onClose={() => clearGaps(key)} /> : undefined}
      />
    );
  };

  const laid = graph ? layoutGraph(graph) : null;

  return (
    <div className="h-screen">
      <AppShell
        topBar={
          <TopBar
            showActions={false}
            searchSlot={<SectionNav spaces={spaces} currentSpace={currentSpace} onSpace={selectSpace} section={section} onSection={setSection} />}
            actions={
              <IconButton aria-label="검색 (⌘K)" onClick={() => setPaletteOpen(true)}>
                <Icons.SearchIcon size={18} />
              </IconButton>
            }
          />
        }
        sidebar={
          <Sidebar
            key={`sb-${spaces.length}`}
            nodes={tree}
            selectedId={selectedTreeId}
            defaultExpandedIds={spaces.flatMap((s) => [`sp:${s.slug}`, `wf:${s.slug}`, `af:${s.slug}`])}
            onSelect={onTreeSelect}
            onToggleGraph={() => setSection("graph")}
            onAddFile={() => setSection("inbox")}
            footer={<AccountFooter onSettings={openSettings} />}
          />
        }
        contentClassName="!p-0 !overflow-hidden flex min-h-0 flex-col"
      >
        {error && (
          <Card padding="md" className="m-3 text-[14px] text-ink-2">
            오류: {error}
          </Card>
        )}

        <div className="min-h-0 flex-1 overflow-hidden p-6">
          {booting ? (
            <p className="text-[15px] text-ink-muted">불러오는 중…</p>
          ) : section === "inbox" ? (
            <div className="h-full overflow-y-auto">
              <InboxSection
                space={currentSpace}
                spaceId={spaces.find((s) => s.slug === currentSpace)?.id ?? ""}
                spaceName={spaceName}
                subjectIdsDefault={wikiBySlug[currentSpace]?.[0]?.subjectIds ?? []}
                existing={wikiPages}
                notes={notes}
                onOpenNote={(n) => openArchive(currentSpace, n.path)}
                onRefresh={() => refreshSpace(currentSpace)}
              />
            </div>
          ) : section === "graph" ? (
            <GraphSection
              graph={graph}
              spaceName={spaceName}
              wikiPages={wikiPages}
              onOpenWiki={(file) => openWiki(currentSpace, file)}
              onOpenArchive={(file) => openArchive(currentSpace, file)}
            />
          ) : section === "source" ? (
            <SourceSection
              spaceName={spaceName}
              notes={notes}
              files={sources}
              selected={selectedSourceNote?.path ?? ""}
              onSelect={setSelectedSource}
              onGoInbox={() => setSection("inbox")}
            >
              {selectedSourceNote ? sourceReader(selectedSourceNote) : null}
            </SourceSection>
          ) : (
            <WikiSection
              spaceName={spaceName}
              pages={wikiPages}
              selected={wikiMode === "doc" ? selectedWiki : "__project__"}
              onSelect={(f) => {
                setWikiMode("doc");
                setSelectedWiki(f);
              }}
              onProject={() => setWikiMode("project")}
            >
              {wikiMode === "project" ? (
                <Card padding="lg">
                  {laid && laid.nodes.length > 0 ? (
                    <ConceptGraph
                      title={`${spaceName} · project 그래프`}
                      nodes={laid.nodes}
                      edges={laid.edges}
                      height={460}
                      caption="노드를 클릭하면 해당 위키로 이동합니다."
                      onNodeClick={(cid) => {
                        const node = graph?.nodes.find((nx) => nx.id === cid);
                        if (node?.path) {
                          setWikiMode("doc");
                          setSelectedWiki(node.path);
                        }
                      }}
                    />
                  ) : (
                    <p className="text-[15px] text-ink-muted">그래프 데이터가 없습니다.</p>
                  )}
                </Card>
              ) : selectedWikiPage ? (
                wikiReader(selectedWikiPage)
              ) : (
                <EmptyState icon={<Icons.FileIcon size={28} />} title="위키가 없어요" description="Source 의 원본에서 'AI 위키 생성'으로 만들 수 있어요." />
              )}
            </WikiSection>
          )}
        </div>
      </AppShell>

      {paletteOpen && <SearchPalette items={allFiles} onPick={pickSearch} onClose={() => setPaletteOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// ══ 마스터-디테일 좌측 리스트 항목 ══
function ListItem({ icon, title, sub, active, onClick }: { icon: ReactNode; title: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors", active ? "bg-surface-soft" : "hover:bg-surface-soft")}
    >
      <span className="mt-0.5 shrink-0 text-ink-faint">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-ink">{title}</span>
        {sub && <span className="block truncate text-[12px] text-ink-faint">{sub}</span>}
      </span>
    </button>
  );
}

// ══ Wiki 섹션 (Source 형 master-detail + 하단 project→그래프) ══
function WikiSection({
  spaceName,
  pages,
  selected,
  onSelect,
  onProject,
  children,
}: {
  spaceName: string;
  pages: WikiPageT[];
  selected: string; // path 또는 "__project__"
  onSelect: (path: string) => void;
  onProject: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[520px] gap-4">
      <div className="flex w-64 shrink-0 flex-col">
        <div className="mb-2">
          <h1 className="text-[18px] font-bold text-ink">Wiki</h1>
          <p className="text-[13px] text-ink-muted">{spaceName} · LLM 개념 위키</p>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {pages.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-ink-muted">아직 위키가 없어요.</p>
          ) : (
            pages.map((p) => (
              <ListItem
                key={p.path}
                icon={<Icons.FileIcon size={15} />}
                title={p.title}
                active={selected === p.path}
                onClick={() => onSelect(p.path)}
              />
            ))
          )}
        </div>
        {/* 하단 project → 그래프 */}
        <div className="mt-2 border-t border-hairline pt-2">
          <button
            type="button"
            onClick={onProject}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[14px] font-medium transition-colors",
              selected === "__project__" ? "bg-primary text-on-primary" : "text-ink-muted hover:bg-surface-soft hover:text-ink",
            )}
          >
            <Icons.GraphIcon size={16} />
            project
          </button>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ══ Source 섹션 (유저 원본 문서 master-detail) ══
function SourceSection({
  spaceName,
  notes,
  files,
  selected,
  onSelect,
  onGoInbox,
  children,
}: {
  spaceName: string;
  notes: ArchiveNote[];
  files: string[];
  selected: string;
  onSelect: (path: string) => void;
  onGoInbox: () => void;
  children: ReactNode;
}) {
  if (notes.length === 0 && files.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="ds-h3 text-ink">Source</h1>
          <p className="text-[14px] text-ink-muted">{spaceName} · 내가 작성한 원본 문서</p>
        </div>
        <EmptyState
          icon={<Icons.FolderIcon size={28} />}
          title="아직 원본 문서가 없어요"
          description="인박스에서 글을 쓰거나 PDF·이미지를 올리면 원본이 여기에 모입니다."
          action={
            <Button variant="utility" size="sm" onClick={onGoInbox}>
              인박스로 이동
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-[520px] gap-4">
      <div className="flex w-64 shrink-0 flex-col">
        <div className="mb-2">
          <h1 className="text-[18px] font-bold text-ink">Source</h1>
          <p className="text-[13px] text-ink-muted">{spaceName} · 원본 문서</p>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {notes.map((n) => (
            <ListItem
              key={n.id}
              icon={<Icons.FileUpIcon size={15} />}
              title={n.title}
              sub={n.createdAt.slice(0, 10)}
              active={selected === n.path}
              onClick={() => onSelect(n.path)}
            />
          ))}
          {files.map((f) => (
            <div key={f} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[14px] text-ink-muted">
              <Icons.FileIcon size={15} className="shrink-0 text-ink-faint" />
              <span className="truncate">{f}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ══ Graph 섹션 (Cytoscape 인터랙티브: 노드→위키 · 엣지→관계 상세 · 타입 필터) ══
function GraphSection({
  graph,
  spaceName,
  wikiPages,
  onOpenWiki,
  onOpenArchive,
}: {
  graph?: GraphData;
  spaceName: string;
  wikiPages: WikiPageT[];
  onOpenWiki: (file: string) => void;
  onOpenArchive: (file: string) => void;
}) {
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  const node = graph?.nodes.find((n) => n.id === selNode) ?? null;
  const page = node ? wikiPages.find((w) => w.path === node.path) : undefined;
  const edge = graph?.relations.find((r) => r.id === selEdge) ?? null;
  const types = Array.from(new Set(graph?.relations.map((r) => r.relationType) ?? []));
  const nodeTitle = (id: string) => graph?.nodes.find((n) => n.id === id)?.title ?? id;

  const toggleType = (t: string) => setTypeFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));

  return (
    <div className="flex h-full min-h-[520px] gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <h1 className="text-[18px] font-bold text-ink">Graph</h1>
          <p className="text-[13px] text-ink-muted">{spaceName} · 타입 있는 개념 그래프 (노드=위키, 엣지=관계)</p>
        </div>
        {types.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  typeFilter.length === 0 || typeFilter.includes(t) ? "border-hairline text-ink-2" : "border-hairline text-ink-faint opacity-50",
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: EDGE_COLOR[t] ?? "#a39e98" }} />
                {t}
              </button>
            ))}
          </div>
        )}
        <Card padding="none" className="min-h-0 flex-1 overflow-hidden">
          {graph && graph.nodes.length > 0 ? (
            <CytoscapeGraph
              data={graph}
              height={520}
              typeFilter={typeFilter}
              onNode={(id) => {
                setSelNode(id);
                setSelEdge(null);
              }}
              onEdge={(id) => {
                setSelEdge(id);
                setSelNode(null);
              }}
            />
          ) : (
            <p className="p-6 text-[15px] text-ink-muted">그래프 데이터가 없습니다.</p>
          )}
        </Card>
      </div>

      <div className="w-80 shrink-0">
        {edge ? (
          <Card padding="lg" className="flex h-full max-h-full flex-col gap-2 overflow-y-auto">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold text-on-primary" style={{ background: EDGE_COLOR[edge.relationType] ?? "#a39e98" }}>
              {edge.relationType}
            </span>
            <p className="text-[15px] font-semibold text-ink">
              {nodeTitle(edge.sourceNodeId)} → {nodeTitle(edge.targetNodeId)}
            </p>
            <div className="flex gap-4 text-[13px] text-ink-muted">
              <span>강도 {edge.strength.toFixed(2)}</span>
              <span>신뢰도 {edge.confidence.toFixed(2)}</span>
            </div>
            <p className="text-[14px] leading-relaxed text-ink-2">{edge.explanation}</p>
            <div className="mt-1 space-y-2 border-t border-hairline pt-2">
              <p className="ds-eyebrow text-ink-faint">근거 ({edge.evidence.length})</p>
              {edge.evidence.map((ev, i) => (
                <div key={i} className="rounded-md border border-hairline p-2 text-[13px]">
                  <p className="text-ink-2">{ev.reason}</p>
                  {ev.archivePath && (
                    <button
                      type="button"
                      onClick={() => onOpenArchive(ev.archivePath!.replace(/^archive\//, ""))}
                      className="mt-1 text-[12px] text-primary hover:underline"
                    >
                      원본 보기 →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ) : page ? (
          <Card padding="lg" className="flex h-full max-h-full flex-col overflow-hidden">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="truncate text-[16px] font-bold text-ink">{page.title}</h3>
              <Button size="sm" variant="utility" onClick={() => onOpenWiki(page.path)}>
                열기
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Markdown source={page.markdown} />
            </div>
          </Card>
        ) : (
          <Card padding="lg" className="flex h-full items-center justify-center text-center">
            <p className="text-[14px] text-ink-muted">
              노드를 클릭 → 위키
              <br />
              엣지를 클릭 → 관계·근거
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ══ 문서 뷰 (위키/원본 공통) — 읽기 ↔ 편집 + 관련 개념 ══
function DocView({
  docType,
  title,
  meta,
  savedMd,
  isEditing,
  draft,
  onToggleEdit,
  onChangeDraft,
  onSave,
  onLink,
  related,
  topSlot,
  bottomSlot,
  embedSpace,
}: {
  docType: "wiki" | "archive";
  title: string;
  meta?: string;
  savedMd: string;
  isEditing: boolean;
  draft: string;
  onToggleEdit: () => void;
  onChangeDraft: (md: string) => void;
  onSave: () => void | Promise<void>;
  onLink: (target: string) => void;
  related?: { title: string; onClick: () => void }[];
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
  embedSpace?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-6">
      {topSlot}
      <div className="flex items-center justify-end gap-2">
        {isEditing && (
          <Button variant="primary" size="sm" onClick={onSave}>
            저장
          </Button>
        )}
        <Button variant="utility" size="sm" onClick={onToggleEdit} leftIcon={<Icons.FileIcon size={14} />}>
          {isEditing ? "읽기" : "편집"}
        </Button>
      </div>

      {isEditing ? (
        <div className="grid gap-3 md:grid-cols-2">
          <MarkdownEditor value={draft} onChange={onChangeDraft} />
          <Card padding="lg" className="max-h-[480px] overflow-y-auto">
            <p className="ds-eyebrow mb-2 text-ink-faint">미리보기</p>
            <Markdown source={draft} onLink={onLink} embedSpace={embedSpace} />
          </Card>
        </div>
      ) : docType === "wiki" ? (
        <WikiPage title={title}>
          <Markdown source={savedMd} onLink={onLink} embedSpace={embedSpace} />
        </WikiPage>
      ) : (
        <>
          <div>
            <h1 className="ds-h3 text-ink">{title}</h1>
            {meta && <p className="text-[12px] text-ink-faint">{meta}</p>}
          </div>
          <Card padding="lg">
            <Markdown source={savedMd} onLink={onLink} embedSpace={embedSpace} />
          </Card>
        </>
      )}

      {docType === "wiki" && !isEditing && related && related.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="ds-eyebrow text-ink-faint">관련 개념</p>
          <div className="flex flex-wrap gap-2">
            {related.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={r.onClick}
                className="rounded-full border border-hairline px-3 py-1 text-[13px] text-primary transition-colors hover:bg-surface-soft"
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {bottomSlot}
    </div>
  );
}

// ══ LLM 액션 바 (원본 노트) ══
function AiBar({ busy, status, onGen, onGaps }: { busy: boolean; status?: string; onGen: () => void; onGaps: () => void }) {
  return (
    <Card padding="md" featured className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ds-eyebrow text-primary">AI</span>
        <Button variant="primary" size="sm" onClick={onGen} disabled={busy} leftIcon={<Icons.SparkleIcon size={14} />}>
          {busy ? "생성 중…" : "AI 위키 생성"}
        </Button>
        <Button variant="utility" size="sm" onClick={onGaps} disabled={busy}>
          간극 점검
        </Button>
        {status && <span className="text-[13px] text-ink-muted">{status}</span>}
      </div>
    </Card>
  );
}

function GapPanel({ questions, onClose }: { questions: GapQuestion[]; onClose: () => void }) {
  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="ds-eyebrow text-primary">정보 간극 메우기 · 이렇게 생각하신 게 맞나요?</p>
        <button type="button" onClick={onClose} aria-label="닫기" className="rounded p-1 text-ink-faint hover:bg-surface-soft hover:text-ink">
          <Icons.CloseIcon size={14} />
        </button>
      </div>
      {questions.map((q, i) => (
        <GapItem key={i} q={q} />
      ))}
    </Card>
  );
}

function GapItem({ q }: { q: GapQuestion }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [other, setOther] = useState("");
  const [otherMode, setOtherMode] = useState(false);
  return (
    <div className="space-y-2 border-t border-hairline pt-3 first:border-0 first:pt-0">
      <p className="text-[15px] font-semibold text-ink">{q.prompt}</p>
      <div className="flex flex-col gap-1.5">
        {q.choices.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setPicked(i);
              setOtherMode(false);
            }}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-[14px] transition-colors",
              picked === i && !otherMode ? "border-primary bg-surface-soft text-ink" : "border-hairline text-ink-2 hover:bg-surface-soft",
            )}
          >
            {c}
          </button>
        ))}
        {q.allowOther &&
          (otherMode ? (
            <input
              autoFocus
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="직접 설명해 보세요…"
              className="rounded-md border border-primary bg-surface px-3 py-2 text-[14px] text-ink outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setOtherMode(true);
                setPicked(null);
              }}
              className="rounded-md border border-dashed border-hairline px-3 py-2 text-left text-[14px] text-ink-muted hover:bg-surface-soft"
            >
              기타 — 직접 설명
            </button>
          ))}
      </div>
    </div>
  );
}

// ══ 상단 섹션 네비 ══
function SectionNav({
  spaces,
  currentSpace,
  onSpace,
  section,
  onSection,
}: {
  spaces: KnowledgeSpace[];
  currentSpace: string;
  onSpace: (slug: string) => void;
  section: Section;
  onSection: (s: Section) => void;
}) {
  const items: { id: Section; label: string; icon: ReactNode }[] = [
    { id: "inbox", label: "Inbox", icon: <Icons.FileUpIcon size={15} /> },
    { id: "wiki", label: "Wiki", icon: <Icons.FileIcon size={15} /> },
    { id: "source", label: "Source", icon: <Icons.FolderIcon size={15} /> },
    { id: "graph", label: "Graph", icon: <Icons.GraphIcon size={15} /> },
  ];
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <select
          value={currentSpace}
          onChange={(e) => onSpace(e.target.value)}
          className="appearance-none rounded-md border border-hairline bg-surface py-1.5 pl-3 pr-8 text-[14px] font-medium text-ink outline-none hover:bg-surface-soft"
        >
          {spaces.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <Icons.ChevronDownIcon size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint" />
      </div>
      <div className="flex items-center gap-0.5 rounded-lg bg-surface-soft p-0.5">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onSection(it.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors",
              section === it.id ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ══ Inbox 섹션 ══
const IMPORT_STATUS_LABEL: Record<string, string> = {
  idle: "대기",
  parsing: "파싱",
  archiving: "원본 저장",
  llm_processing: "AI 위키 생성",
  clarify_pending: "응답 대기",
  writing: "위키 저장",
  completed: "완료",
  failed: "실패",
};

function InboxSection({
  space,
  spaceId,
  spaceName,
  subjectIdsDefault,
  existing,
  notes,
  onOpenNote,
  onRefresh,
}: {
  space: string;
  spaceId: string;
  spaceName: string;
  subjectIdsDefault: string[];
  existing: WikiPageT[];
  notes: ArchiveNote[];
  onOpenNote: (n: ArchiveNote) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [withLlm, setWithLlm] = useState(true);
  const [clarify, setClarify] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const { job, gaps, runImport, respondClarify } = useImportStore();
  const busy = !!job && !["completed", "failed"].includes(job.status);

  const onFiles = (files: FileList) => {
    const f = files[0];
    if (!f) return;
    if (f.type.startsWith("text") || f.name.endsWith(".md") || f.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => {
        setBody(String(reader.result ?? ""));
        if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      };
      reader.readAsText(f);
    } else if (f.type.startsWith("image")) {
      // 이미지 → OCR(vision)로 3-block 마크다운. 키 없으면 오프라인 폴백.
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result ?? "");
        if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
        const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
        try {
          const { markdown } = await runImageOcr(dataUrl, apiKey);
          setBody((b) => (b ? b + "\n\n" : "") + markdown);
        } catch {
          setBody((b) => b + `\n\n> ${f.name} OCR 실패 — 텍스트를 직접 입력하세요.`);
        }
      };
      reader.readAsDataURL(f);
    } else {
      setBody((b) => b + `\n\n> ${f.name} 첨부됨 (PDF 추출은 Source에서)`);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    }
  };

  const run = async () => {
    if (!title.trim() || busy) return;
    setAnswers([]);
    const res = await runImport({ space, spaceId, title: title.trim(), markdown: body, subjectIds: subjectIdsDefault, withLlm, clarify, existing });
    if (res.status === "completed") {
      setTitle("");
      setBody("");
      await onRefresh();
    }
  };

  const finishClarify = async (ans: string[] | null) => {
    const res = await respondClarify(ans);
    if (res.status === "completed") {
      setTitle("");
      setBody("");
      setAnswers([]);
      await onRefresh();
    }
  };

  const steps = withLlm
    ? clarify
      ? ["archiving", "llm_processing", "clarify_pending", "writing", "completed"]
      : ["archiving", "llm_processing", "writing", "completed"]
    : ["archiving", "writing", "completed"];
  const curIdx = job ? steps.indexOf(job.status) : -1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="ds-h3 text-ink">Inbox</h1>
        <p className="text-[14px] text-ink-muted">{spaceName} · 자료 → 원본(archive) 저장 → (선택) AI 위키·관계 생성.</p>
      </div>

      <Card padding="lg" className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="w-full bg-transparent text-[18px] font-bold text-ink outline-none placeholder:text-ink-faint"
        />
        <FileDropzone onFiles={onFiles} className="!p-6" />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="마크다운으로 작성하세요…"
          rows={8}
          className="w-full rounded-md border border-hairline bg-surface p-3 text-[15px] leading-relaxed text-ink outline-none focus-visible:shadow-soft"
        />
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[14px] text-ink-2">
              <input type="checkbox" checked={withLlm} onChange={(e) => setWithLlm(e.target.checked)} className="accent-primary" />
              AI 위키·관계까지 생성
            </label>
            <label className={cn("flex items-center gap-2 text-[13px]", withLlm ? "text-ink-muted" : "text-ink-faint")}>
              <input type="checkbox" checked={clarify} onChange={(e) => setClarify(e.target.checked)} disabled={!withLlm} className="accent-primary" />
              되묻기(clarify) — 저장 전 이해 확인
            </label>
          </div>
          <Button variant="solid" onClick={run} disabled={busy || !title.trim()}>
            {busy ? `${IMPORT_STATUS_LABEL[job!.status]}…` : withLlm ? "저장 + AI 정리" : "원본으로 저장"}
          </Button>
        </div>

        {job?.status === "clarify_pending" && (
          <div className="space-y-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
            <p className="text-[14px] font-semibold text-ink">한 번 더 확인할게요 — 되묻기</p>
            {gaps.map((g, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-[14px] text-ink-2">{g.prompt}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.choices.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAnswers((a) => { const n = [...a]; n[i] = c; return n; })}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                        answers[i] === c ? "border-primary bg-primary text-on-primary" : "border-hairline text-ink-2",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {g.allowOther && (
                  <input
                    value={answers[i] && !g.choices.includes(answers[i]) ? answers[i] : ""}
                    onChange={(e) => setAnswers((a) => { const n = [...a]; n[i] = e.target.value; return n; })}
                    placeholder="직접 설명(기타)"
                    className="w-full rounded border border-hairline bg-surface px-2 py-1 text-[13px] text-ink outline-none focus-visible:shadow-soft"
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="utility" onClick={() => finishClarify(null)}>
                건너뛰기(1차 저장)
              </Button>
              <Button size="sm" variant="solid" onClick={() => finishClarify(answers)}>
                답변 반영해 생성
              </Button>
            </div>
          </div>
        )}

        {job && (
          <div className="rounded-md border border-hairline bg-surface-soft p-3 text-[13px]">
            {job.status === "failed" ? (
              <p className="text-danger">가져오기 실패: {job.errorMessage}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {steps.map((s, i) => (
                  <span key={s} className="flex items-center gap-2">
                    {i > 0 && <span className="text-ink-faint">→</span>}
                    <span
                      className={cn(
                        "flex items-center gap-1.5",
                        job.status === "completed" || i < curIdx ? "text-ink-2" : i === curIdx ? "font-semibold text-primary" : "text-ink-faint",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          job.status === "completed" || i < curIdx ? "bg-primary" : i === curIdx ? "bg-primary" : "bg-hairline",
                        )}
                      />
                      {IMPORT_STATUS_LABEL[s]}
                    </span>
                  </span>
                ))}
                {job.status === "completed" && (
                  <span className="ml-1 text-ink-muted">
                    · {job.engine === "openai" ? "GPT" : "휴리스틱"}
                    {typeof job.wikiCount === "number" && ` · 위키 ${job.wikiCount} · 관계 ${job.relationCount}`}
                    {job.mergedCount ? ` · 병합 ${job.mergedCount}` : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="space-y-2">
        <p className="ds-eyebrow text-ink-faint">저장된 원본 ({notes.length})</p>
        {notes.length === 0 ? (
          <p className="text-[14px] text-ink-muted">아직 원본이 없습니다.</p>
        ) : (
          notes.map((n) => (
            <Card key={n.id} interactive padding="md" onClick={() => onOpenNote(n)}>
              <p className="text-[15px] font-semibold text-ink">{n.title}</p>
              <p className="text-[12px] text-ink-faint">
                {n.createdAt.slice(0, 10)} · {n.path}
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// ══ ⌘K 검색 팔레트 ══
function SearchPalette({ items, onPick, onClose }: { items: SearchItem[]; onPick: (it: SearchItem) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const query = q.trim().toLowerCase();
  const filtered = (
    query
      ? items.filter(
          (i) =>
            i.title.toLowerCase().includes(query) ||
            i.spaceName.toLowerCase().includes(query) ||
            i.body.toLowerCase().includes(query),
        )
      : items
  ).slice(0, 50);
  useEffect(() => setSel(0), [q]);

  // 본문 매치 스니펫 (매치 주변 ±30자)
  const snippet = (body: string): string | null => {
    if (!query) return null;
    const idx = body.toLowerCase().indexOf(query);
    if (idx < 0) return null;
    const start = Math.max(0, idx - 30);
    const raw = body.slice(start, idx + query.length + 30).replace(/\s+/g, " ").trim();
    return (start > 0 ? "…" : "") + raw + "…";
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[sel]) onPick(filtered[sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-hairline bg-surface shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-hairline px-4">
          <Icons.SearchIcon size={16} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="파일 검색 (제목/공간)…"
            className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-hairline bg-surface-soft px-1.5 py-0.5 text-[11px] text-ink-muted">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-[14px] text-ink-muted">결과 없음</p>
          ) : (
            filtered.map((it, i) => (
              <button
                key={`${it.kind}:${it.space}:${it.file}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => onPick(it)}
                className={cn("flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors", i === sel ? "bg-surface-soft" : "")}
              >
                {it.kind === "wiki" ? (
                  <Icons.FileIcon size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                ) : (
                  <Icons.FileUpIcon size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">{it.title}</span>
                  {snippet(it.body) && <span className="block truncate text-[12px] text-ink-faint">{snippet(it.body)}</span>}
                </span>
                <span className="mt-0.5 shrink-0 text-[12px] text-ink-faint">
                  {it.spaceName} / {it.kind === "wiki" ? "wiki" : "source"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ══ 사이드바 하단 계정 영역 ══
// ══ 설정 모달 (§I) ══
function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme, toggle } = useTheme();
  const [key, setKey] = useState((typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "");
  const [saved, setSaved] = useState(false);
  const hasKey = key.trim().length > 0;
  const save = () => {
    localStorage.setItem("openai-key", key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-hairline bg-surface p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-ink">설정</h2>
          <button type="button" onClick={onClose} className="text-[16px] text-ink-faint hover:text-ink">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-ink">OpenAI API Key</label>
            <p className="text-[12px] text-ink-muted">비우면 오프라인 휴리스틱 엔진을 사용합니다. 키는 이 기기(localStorage)에만 저장됩니다.</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-…"
                className="flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-[14px] text-ink outline-none focus-visible:shadow-soft"
              />
              <Button variant="solid" onClick={save}>
                {saved ? "저장됨" : "저장"}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <span className="text-[14px] text-ink-2">LLM 엔진</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", hasKey ? "bg-primary text-on-primary" : "bg-surface-soft text-ink-muted")}>
              {hasKey ? "OpenAI GPT" : "휴리스틱(오프라인)"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <span className="text-[14px] text-ink-2">테마</span>
            <Button variant="utility" size="sm" onClick={toggle}>
              {theme === "dark" ? "다크" : "라이트"}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <span className="text-[14px] text-ink-2">워크스페이스</span>
            <span className="text-[13px] text-ink-muted">~/PiecePool</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountFooter({ onSettings }: { onSettings: () => void }) {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const isDark = theme === "dark";
  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-lg border border-hairline bg-surface p-1 shadow-elevated">
            <MenuItem
              icon={<Icons.UserIcon size={16} />}
              label="계정설정"
              onClick={() => {
                setOpen(false);
                window.alert("계정설정은 후속 작업입니다 (로컬 단일 사용자).");
              }}
            />
            <MenuItem
              icon={<Icons.GearIcon size={16} />}
              label="설정"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
            />
            <MenuItem icon={isDark ? <Icons.SunIcon size={16} /> : <Icons.MoonIcon size={16} />} label="다크모드" right={isDark ? "켜짐" : "꺼짐"} onClick={toggle} />
            <div className="my-1 h-px bg-hairline" />
            <MenuItem icon={<Icons.LogoutIcon size={16} />} label="로그아웃" onClick={() => setOpen(false)} />
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-soft", open && "bg-surface-soft")}
      >
        <Avatar name="Admin" size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">Admin</span>
          <span className="block truncate text-[12px] text-ink-muted">로컬 워크스페이스</span>
        </span>
        <Icons.ChevronRightIcon size={14} className={cn("shrink-0 text-ink-faint transition-transform", open && "-rotate-90")} />
      </button>
    </div>
  );
}

function MenuItem({ icon, label, right, onClick }: { icon: ReactNode; label: string; right?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
    >
      <span className="shrink-0 text-ink-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {right && <span className="text-[12px] text-ink-faint">{right}</span>}
    </button>
  );
}
