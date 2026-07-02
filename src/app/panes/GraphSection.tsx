import { useEffect, useState } from "react";
import { Button, Card, cn } from "../../ds";
import type { GraphData, WikiPage as WikiPageT, Subject } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { CytoscapeGraph, EDGE_COLOR } from "../../lib/CytoscapeGraph";
import { Markdown } from "../../lib/markdown";

// ══ Graph 섹션 (Cytoscape 인터랙티브) ══
// 노드→위키 · 엣지→관계 상세 · RelationType/Subject 필터 · 노드 검색(수용기준 §6).
export function GraphSection({
  graph,
  space,
  spaceName,
  wikiPages,
  onOpenWiki,
  onOpenArchive,
}: {
  graph?: GraphData;
  space: string;
  spaceName: string;
  wikiPages: WikiPageT[];
  onOpenWiki: (file: string) => void;
  onOpenArchive: (file: string) => void;
}) {
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    ipc
      .listSubjects(space)
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [space]);

  const node = graph?.nodes.find((n) => n.id === selNode) ?? null;
  const page = node ? wikiPages.find((w) => w.path === node.path) : undefined;
  const edge = graph?.relations.find((r) => r.id === selEdge) ?? null;
  const types = Array.from(new Set(graph?.relations.map((r) => r.relationType) ?? []));
  const nodeTitle = (id: string) => graph?.nodes.find((n) => n.id === id)?.title ?? id;

  // 노드에 실제로 등장하는 subject 만 필터 후보로 (2개 이상일 때만 노출)
  const subjectIds = Array.from(new Set(graph?.nodes.flatMap((n) => n.subjectIds) ?? []));
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  const toggleType = (t: string) => setTypeFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));
  const toggleSubject = (id: string) => setSubjectFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const matches =
    query.trim().length > 0
      ? (graph?.nodes ?? []).filter((n) => n.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
      : [];
  const pickMatch = (id: string) => {
    setSelNode(id);
    setSelEdge(null);
    setFocusId(id);
    setQuery("");
  };

  return (
    <div className="flex h-full min-h-0 gap-4 p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-bold text-ink">Graph</h1>
            <p className="text-[13px] text-ink-muted">{spaceName} · 타입 있는 개념 그래프 (노드=위키, 엣지=관계)</p>
          </div>
          {/* 노드 검색 */}
          <div className="relative w-56 shrink-0">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && matches[0] && pickMatch(matches[0].id)}
              placeholder="개념 찾기…"
              className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-faint focus-visible:shadow-soft"
            />
            {matches.length > 0 && (
              <div className="absolute top-full z-10 mt-1 w-full rounded-md border border-hairline bg-surface p-1 shadow-elevated">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pickMatch(m.id)}
                    className="block w-full truncate rounded px-2 py-1 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
                  >
                    {m.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RelationType 필터 */}
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

        {/* Subject 필터 (2개 이상일 때만) */}
        {subjectIds.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {subjectIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleSubject(id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  subjectFilter.length === 0 || subjectFilter.includes(id)
                    ? "border-hairline text-ink-2"
                    : "border-hairline text-ink-faint opacity-50",
                )}
              >
                {subjectName(id)}
              </button>
            ))}
          </div>
        )}

        <Card padding="none" className="min-h-0 flex-1 overflow-hidden">
          {graph && graph.nodes.length > 0 ? (
            <CytoscapeGraph
              data={graph}
              typeFilter={typeFilter}
              subjectFilter={subjectFilter}
              focusNodeId={focusId}
              onNode={(id) => {
                setSelNode(id);
                setSelEdge(null);
              }}
              onEdge={(id) => {
                setSelEdge(id);
                setSelNode(null);
              }}
              onClear={() => {
                setSelNode(null);
                setSelEdge(null);
                setFocusId(null);
              }}
            />
          ) : (
            <p className="p-6 text-[15px] text-ink-muted">그래프 데이터가 없습니다. Inbox에서 노트를 저장하고 AI 정리를 실행해보세요.</p>
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
              <br />
              <span className="text-[12px] text-ink-faint">노드에 마우스를 올리면 이웃만 강조돼요</span>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
