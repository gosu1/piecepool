import { useState } from "react";
import { Button, Card, cn } from "../../ds";
import type { GraphData, WikiPage as WikiPageT } from "../../lib/types";
import { CytoscapeGraph, EDGE_COLOR } from "../../lib/CytoscapeGraph";
import { Markdown } from "../../lib/markdown";

// ══ Graph 섹션 (Cytoscape 인터랙티브: 노드→위키 · 엣지→관계 상세 · 타입 필터) ══
export function GraphSection({
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
