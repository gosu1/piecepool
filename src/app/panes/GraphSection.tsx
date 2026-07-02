import { useEffect, useMemo, useState } from "react";
import { Button, Card, cn } from "../../ds";
import type { GraphData, WikiPage as WikiPageT, Subject, KnowledgeSpace } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { CytoscapeGraph, EDGE_COLOR } from "../../lib/CytoscapeGraph";
import { Markdown } from "../../lib/markdown";

// 전체 과목 뷰 space별 구분 색 (8색 순환)
const SPACE_PALETTE = ["#0075de", "#dd5b00", "#2a9d99", "#7048e8", "#e64980", "#1aae39", "#f08c00", "#1c7ed6"];

// ══ Graph 섹션 (Cytoscape 인터랙티브) ══
// 스코프 토글: 현재 과목(단일 space) ↔ 전체 과목(전 space 병합). 셸/사이드바 무관, 그래프 뷰 국소.
// 노드→위키 · 엣지→관계 상세 · RelationType/Subject 필터 · 노드 검색(수용기준 §6).
export function GraphSection({
  spaces,
  graphBySlug,
  wikiBySlug,
  space,
  spaceName,
  onOpenWiki,
  onOpenArchive,
}: {
  spaces: KnowledgeSpace[];
  graphBySlug: Record<string, GraphData>;
  wikiBySlug: Record<string, WikiPageT[]>;
  space: string;
  spaceName: string;
  onOpenWiki: (space: string, file: string) => void;
  onOpenArchive: (space: string, file: string) => void;
}) {
  const [scope, setScope] = useState<"space" | "all">("space");
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    ipc
      .listSubjects(space)
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [space]);

  // 노드에 소속 space 태깅 — 위키 파일명(concept-slug.md)이 space 간 충돌하므로 문서 열기 정합성에 필수.
  // space별 색·군집 배치도 이 태그로 한다.
  const taggedBySlug = useMemo(() => {
    const out: Record<string, GraphData> = {};
    for (const [slug, g] of Object.entries(graphBySlug)) {
      out[slug] = { nodes: g.nodes.map((n) => ({ ...n, space: slug })), relations: g.relations };
    }
    return out;
  }, [graphBySlug]);

  // 전체 과목 = 전 space 병합. concept id 가 ULID(전역 유일)라 concat 안전. cross-space 엣지는 없음(분리 섬).
  const merged = useMemo<GraphData>(
    () => ({
      nodes: Object.values(taggedBySlug).flatMap((g) => g.nodes),
      relations: Object.values(taggedBySlug).flatMap((g) => g.relations),
    }),
    [taggedBySlug],
  );

  const graph = scope === "all" ? merged : taggedBySlug[space];

  const spaceColors = useMemo(() => {
    const m: Record<string, string> = {};
    spaces.forEach((s, i) => (m[s.slug] = SPACE_PALETTE[i % SPACE_PALETTE.length]));
    return m;
  }, [spaces]);

  // subject 필터로 선택 노드가 화면에서 사라지면 상세 패널도 비운다(데스ync 방지).
  useEffect(() => {
    if (!selNode || subjectFilter.length === 0) return;
    const visible = graph?.nodes.some((n) => n.id === selNode && n.subjectIds.some((s) => subjectFilter.includes(s)));
    if (!visible) setSelNode(null);
  }, [subjectFilter, graph, selNode]);

  const node = graph?.nodes.find((n) => n.id === selNode) ?? null;
  const nodeSpace = node?.space ?? space; // 병합 뷰에서 노드가 어느 space 소속인지 → 올바른 파일 열기
  const page = node ? (wikiBySlug[nodeSpace] ?? []).find((w) => w.path === node.path) : undefined;
  const edge = graph?.relations.find((r) => r.id === selEdge) ?? null;
  const edgeSpace = edge ? graph?.nodes.find((n) => n.id === edge.sourceNodeId)?.space ?? space : space;
  const types = Array.from(new Set(graph?.relations.map((r) => r.relationType) ?? []));
  const nodeTitle = (id: string) => graph?.nodes.find((n) => n.id === id)?.title ?? id;

  // 노드에 실제로 등장하는 subject 만 필터 후보로 (2개 이상일 때만 노출)
  const subjectIds = Array.from(new Set(graph?.nodes.flatMap((n) => n.subjectIds) ?? []));
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  // 전체 뷰 범례용: 병합 그래프에 실제 등장하는 space 들
  const spacesPresent = scope === "all" ? (Array.from(new Set(merged.nodes.map((n) => n.space).filter(Boolean))) as string[]) : [];

  const toggleType = (t: string) => setTypeFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));
  const toggleSubject = (id: string) => setSubjectFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  // 스코프 전환 시 선택·필터 초기화 (다른 space 잔여 선택 방지)
  const pickScope = (s: "space" | "all") => {
    setScope(s);
    setSelNode(null);
    setSelEdge(null);
    setFocus(null);
    setSubjectFilter([]);
    setTypeFilter([]);
  };

  const matches =
    query.trim().length > 0
      ? (graph?.nodes ?? []).filter((n) => n.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
      : [];
  const pickMatch = (id: string) => {
    setSelNode(id);
    setSelEdge(null);
    setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })); // 논스 — 같은 노드 재검색도 재포커스
    setQuery("");
  };

  return (
    <div className="flex h-full min-h-0 gap-4 p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-bold text-ink">Graph</h1>
            <p className="text-[13px] text-ink-muted">
              {scope === "all" ? "전체 과목" : spaceName} · 타입 있는 개념 그래프 (노드=위키, 엣지=관계)
            </p>
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

        {/* 스코프 토글: 현재 과목 ↔ 전체 과목 (공간 2개 이상일 때만) */}
        {spaces.length > 1 && (
          <div className="flex w-fit gap-0.5 rounded-lg border border-hairline p-0.5">
            {(["space", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pickScope(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] transition-colors",
                  scope === s ? "bg-surface-soft font-semibold text-ink shadow-soft" : "text-ink-2 hover:text-ink",
                )}
              >
                {s === "space" ? spaceName || "현재 과목" : "전체 과목"}
              </button>
            ))}
          </div>
        )}

        {/* 전체 뷰 범례: 색 → 공간 */}
        {scope === "all" && spacesPresent.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {spacesPresent.map((slug) => (
              <span key={slug} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: spaceColors[slug] ?? "#a39e98" }} />
                {spaces.find((s) => s.slug === slug)?.name ?? slug}
              </span>
            ))}
          </div>
        )}

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

        {/* Subject 필터 (현재 과목 뷰에서 subject 2개 이상일 때만. 전체 뷰는 space 축이라 숨김) */}
        {scope === "space" && subjectIds.length > 1 && (
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
              spaceColors={scope === "all" ? spaceColors : undefined}
              selectedId={selNode}
              focus={focus}
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
                setFocus(null);
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
                      onClick={() => onOpenArchive(edgeSpace, ev.archivePath!.replace(/^archive\//, ""))}
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
              <Button size="sm" variant="utility" onClick={() => onOpenWiki(nodeSpace, page.path)}>
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
