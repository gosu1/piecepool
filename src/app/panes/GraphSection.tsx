import { useEffect, useMemo, useState } from "react";
import { Button, Card, Icons, cn } from "../../ds";
import type { GraphData, WikiPage as WikiPageT, Subject, KnowledgeSpace } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { CytoscapeGraph, GraphCtl } from "../../lib/CytoscapeGraph";
import {
  HIER_TYPES,
  RELATION_GROUPS,
  RELATION_LABEL,
  REVIEW_COLOR,
  confidenceLabel,
  relationSentence,
  strengthLabel,
  type RelationGroupId,
} from "../../lib/relationMeta";
import { Markdown } from "../../lib/markdown";
import { stripFeynmanSection } from "../../lib/feynmanSection";
import { PromptDialog } from "../shell/Dialogs";
import { RelationQualityMeter } from "./RelationQuality";

// 전체 과목 뷰 space별 구분 색 (8색 순환)
const SPACE_PALETTE = ["#0075de", "#dd5b00", "#2a9d99", "#7048e8", "#e64980", "#1aae39", "#f08c00", "#1c7ed6"];

// "그래프 읽는 법" 오버레이 — 첫 방문 자동 펼침, 닫으면 기억
const HELP_SEEN_KEY = "piecepool.graph-help-seen";

// 과목 선택기: 이 개수까지는 칩(1클릭 전환), 넘으면 드롭다운(줄바꿈으로 그래프가 밀리지 않게)
const CHIP_MAX = 5;

// 과목 선택 드롭다운 — 인박스 저장 위치(SpacePicker)와 같은 팝오버 패턴(백드롭 + bg-surface 패널 + 체크 표시).
// 네이티브 select 는 팝업이 OS 스타일이라 테마를 안 따른다.
function ViewPicker({ spaces, value, onChange }: { spaces: KnowledgeSpace[]; value: string; onChange: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const options = [...spaces.map((s) => ({ slug: s.slug, name: s.name })), { slug: "", name: "전체 과목" }]; // 칩 버전과 같은 순서
  const current = options.find((o) => o.slug === value);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="과목 선택"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-muted transition-colors hover:bg-fill-subtle hover:text-ink",
          open && "bg-fill-subtle text-ink",
        )}
      >
        <Icons.FolderIcon size={13} className="text-ink-faint" />
        <span className="max-w-[150px] truncate font-medium text-ink">{current?.name ?? "과목 선택"}</span>
        <Icons.ChevronsUpDownIcon size={12} className="shrink-0 text-ink-faint" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-hairline bg-surface p-1 shadow-elevated"
          >
            {options.map((o) => (
              <button
                key={o.slug || "all"}
                type="button"
                role="option"
                aria-selected={o.slug === value}
                onClick={() => {
                  onChange(o.slug);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                  o.slug === value ? "bg-fill-subtle font-medium text-ink" : "text-ink-2 hover:bg-surface-soft hover:text-ink",
                )}
              >
                <span className="truncate">{o.name}</span>
                {o.slug === value && <Icons.CheckIcon size={14} className="shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

// ══ Graph 섹션 (Cytoscape 인터랙티브) ══
// 과목 선택: 아무 과목(단일 space) ↔ 전체 과목(전 space 병합).
// 노드→위키 · 엣지→관계 상세 · RelationType/Subject 필터 · 노드 검색(수용기준 §6).
export function GraphSection({
  spaces,
  graphBySlug,
  wikiBySlug,
  space,
  view,
  onViewChange,
  onOpenWiki,
  onOpenArchive,
  onUnmarkReview,
  onMarkReview,
}: {
  spaces: KnowledgeSpace[];
  graphBySlug: Record<string, GraphData>;
  wikiBySlug: Record<string, WikiPageT[]>;
  space: string;
  /** 보고 있는 과목. 빈 문자열이면 전체 과목(전 space 병합). 셸이 소유한다 — 상태바 경로가
   *  지금 보는 과목을 가리켜야 하고, 탭을 오가도 선택이 리셋되면 안 된다. */
  view: string;
  onViewChange: (slug: string) => void;
  onOpenWiki: (space: string, file: string) => void;
  onOpenArchive: (space: string, file: string) => void;
  /** 복습 표시 해제 — 붙일 때처럼 거둘 때도 사용자만 한다(relation-types.md §review_needed). */
  onUnmarkReview: (space: string, conceptId: string, title: string) => Promise<void>;
  /** 복습 표시 — reason 이 곧 evidence 다(evidence ≥ 1). AI 는 이 표시를 못 만든다. */
  onMarkReview: (space: string, conceptId: string, title: string, sourceId: string, reason: string) => Promise<void>;
}) {
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<RelationGroupId[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string[]>([]);
  const [layoutMode, setLayoutMode] = useState<"force" | "hier">("hier");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return localStorage.getItem(HELP_SEEN_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const closeHelp = () => {
    setHelpOpen(false);
    try {
      localStorage.setItem(HELP_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    ipc
      .listSubjects(view || space)
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [view, space]);

  // 노드에 소속 space 태깅 — 위키 파일명(concept-slug.md)이 space 간 충돌하므로 문서 열기 정합성에 필수.
  // space별 색·군집 배치도 이 태그로 한다.
  const taggedBySlug = useMemo(() => {
    const out: Record<string, GraphData> = {};
    for (const [slug, g] of Object.entries(graphBySlug)) {
      out[slug] = { nodes: g.nodes.map((n) => ({ ...n, space: slug })), relations: g.relations };
    }
    return out;
  }, [graphBySlug]);

  // 전체 과목 = 전 space 병합.
  // conceptId 는 제목에서 파생되므로(concept-{제목slug}) 같은 개념이 여러 공간에 있으면 id 가 겹친다.
  // 그대로 concat 하면 Cytoscape 가 중복 id 로 깨지므로 노드를 접는다(먼저 만난 공간의 색을 쓴다).
  // 교차 관계(cross-space)는 저장된 공간의 relations 에 들어 있고, 여기서 양끝 노드가 모두 살아
  // 있으므로 폴더 사이 다리로 그려진다.
  const merged = useMemo<GraphData>(() => {
    const nodes: GraphData["nodes"] = [];
    const ids = new Set<string>();
    for (const g of Object.values(taggedBySlug)) {
      for (const n of g.nodes) {
        if (ids.has(n.id)) continue;
        ids.add(n.id);
        nodes.push(n);
      }
    }
    const seen = new Set<string>();
    const relations = Object.values(taggedBySlug)
      .flatMap((g) => g.relations)
      // 양끝이 다 있는 관계만 (한쪽 공간이 안 열렸을 때의 dangling 방지)
      .filter((r) => ids.has(r.sourceNodeId) && ids.has(r.targetNodeId))
      // 양쪽 공간이 같은 교차 관계를 각자 저장했을 수 있다 — 한 건으로 접는다.
      .filter((r) => {
        const k = `${r.sourceNodeId}|${r.targetNodeId}|${r.relationType}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return { nodes, relations };
  }, [taggedBySlug]);

  // 단일 공간 뷰 — 이 공간 노드만 그리므로, 타 공간을 가리키는 교차 관계는 끊긴 엣지가 된다. 숨긴다.
  // (관계 자체는 지우지 않는다. "전체 과목" 뷰에서 다리로 보인다.)
  const single = useMemo<GraphData | undefined>(() => {
    const g = view ? taggedBySlug[view] : undefined;
    if (!g) return undefined;
    const ids = new Set(g.nodes.map((n) => n.id));
    return { ...g, relations: g.relations.filter((r) => ids.has(r.sourceNodeId) && ids.has(r.targetNodeId)) };
  }, [taggedBySlug, view]);

  const graph = view ? single : merged;
  const viewName = view ? spaces.find((s) => s.slug === view)?.name ?? view : "전체 과목";

  const spaceColors = useMemo(() => {
    const m: Record<string, string> = {};
    spaces.forEach((s, i) => (m[s.slug] = SPACE_PALETTE[i % SPACE_PALETTE.length]));
    return m;
  }, [spaces]);

  // 복습 필터 — 켜면 "아직 모르겠어요"로 표시한 개념만 남긴다. self-loop 라 관계 필터만으로는 노드가 안 걸러진다.
  const reviewOnly = groupFilter.includes("review");
  const reviewedIds = useMemo(
    () =>
      new Set(
        (graph?.relations ?? [])
          .filter((r) => r.relationType === "review_needed" && r.sourceNodeId === r.targetNodeId)
          .map((r) => r.sourceNodeId),
      ),
    [graph],
  );

  // subject·복습 필터로 선택 노드가 화면에서 사라지면 상세 패널도 비운다(데스ync 방지).
  useEffect(() => {
    if (!selNode) return;
    if (reviewOnly && !reviewedIds.has(selNode)) {
      setSelNode(null);
      return;
    }
    if (subjectFilter.length === 0) return;
    const visible = graph?.nodes.some((n) => n.id === selNode && n.subjectIds.some((s) => subjectFilter.includes(s)));
    if (!visible) setSelNode(null);
  }, [subjectFilter, reviewOnly, reviewedIds, graph, selNode]);

  const node = graph?.nodes.find((n) => n.id === selNode) ?? null;
  const nodeSpace = node?.space ?? space; // 병합 뷰에서 노드가 어느 space 소속인지 → 올바른 파일 열기
  const page = node ? (wikiBySlug[nodeSpace] ?? []).find((w) => w.path === node.path) : undefined;
  // "아직 모르겠어요" 로 표시된 개념 = review_needed self-loop. 노드 테두리와 같은 판정식.
  const nodeReviewed =
    !!node &&
    !!graph?.relations.some(
      (r) => r.relationType === "review_needed" && r.sourceNodeId === node.id && r.targetNodeId === node.id,
    );
  const [unmarking, setUnmarking] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  // 표시하려면 evidence 의 출처가 필요하다(graph.rs: source_id 필수).
  // 출처 없는 위키는 표시할 수 없다 — 없는 걸 있는 척하지 않고 버튼을 잠근다.
  const nodeSourceId = page?.sourceIds?.[0] ?? "";
  const edge = graph?.relations.find((r) => r.id === selEdge) ?? null;
  const edgeSpace = edge ? graph?.nodes.find((n) => n.id === edge.sourceNodeId)?.space ?? space : space;
  // 그룹 칩(존재 타입만) + 유효 필터 전개(칩 = 필터 + 범례 겸용 — 스와치가 곧 그래프 인코딩).
  // useMemo 로 identity 고정 필수 — 매 렌더 새 배열이면 CytoscapeGraph elements 가 무효화돼
  // 클릭·타이핑마다 그래프 전체가 재배치된다. 유효 필터는 존재 그룹과 교집합 — 데이터 갱신으로
  // 그룹이 사라져도 유령 필터가 전부를 숨기지 않게.
  const { groupsPresent, typeFilter } = useMemo(() => {
    const types = new Set(graph?.relations.map((r) => r.relationType) ?? []);
    const present = RELATION_GROUPS.filter((g) => g.members.some((m) => types.has(m)));
    const active = groupFilter.filter((id) => present.some((g) => g.id === id));
    return { groupsPresent: present, typeFilter: active.flatMap((id) => RELATION_GROUPS.find((g) => g.id === id)?.members ?? []) };
  }, [graph, groupFilter]);
  // 계층 관계(part_of·prerequisite)가 "화면에" 있는지 → 토글 노출·폴백 (필터로 꺼지면 토글도 숨김)
  const hasHier = useMemo(
    () => (graph?.relations ?? []).some((r) => HIER_TYPES.has(r.relationType) && (typeFilter.length === 0 || typeFilter.includes(r.relationType))),
    [graph, typeFilter],
  );

  // 필터로 선택 엣지가 화면에서 사라지면 상세 패널도 비운다 (노드 가드와 동일한 데스ync 방지)
  useEffect(() => {
    if (!selEdge) return;
    const r = graph?.relations.find((x) => x.id === selEdge);
    const nodeOk = (id: string) =>
      graph?.nodes.some((n) => n.id === id && (subjectFilter.length === 0 || n.subjectIds.some((s) => subjectFilter.includes(s)))) ?? false;
    const visible = !!r && (typeFilter.length === 0 || typeFilter.includes(r.relationType)) && nodeOk(r.sourceNodeId) && nodeOk(r.targetNodeId);
    if (!visible) setSelEdge(null);
  }, [typeFilter, subjectFilter, graph, selEdge]);

  const nodeTitle = (id: string) => graph?.nodes.find((n) => n.id === id)?.title ?? id;

  // 노드에 실제로 등장하는 subject 만 필터 후보로 (2개 이상일 때만 노출)
  const subjectIds = Array.from(new Set(graph?.nodes.flatMap((n) => n.subjectIds) ?? []));
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  // 전체 뷰 범례용: 병합 그래프에 실제 등장하는 space 들
  const spacesPresent = view ? [] : (Array.from(new Set(merged.nodes.map((n) => n.space).filter(Boolean))) as string[]);

  // 필터를 바꾸면 검색 포커스(확대·이동)는 푼다 — 남아 있으면 새로 그린 그래프가 엉뚱한 자리에 확대된 채 걸린다.
  const toggleGroup = (id: RelationGroupId) => {
    setFocus(null);
    setGroupFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  };
  const toggleSubject = (id: string) => {
    setFocus(null);
    setSubjectFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  };

  // 과목 전환 시 선택·필터 초기화 (다른 space 잔여 선택 방지)
  const pickView = (slug: string) => {
    onViewChange(slug);
    setSelNode(null);
    setSelEdge(null);
    setFocus(null);
    setQuery(""); // 이전 과목의 검색어·후보가 남지 않게
    setSubjectFilter([]);
    setGroupFilter([]);
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
            <p className="text-[13px] text-ink-muted">{viewName} · 타입 있는 개념 그래프 (노드=위키, 엣지=관계)</p>
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

        {/* 과목 선택(과목별 ↔ 전체)·레이아웃(계층↔자유) 토글 */}
        {(spaces.length > 1 || (view && hasHier)) && (
          <div className="flex flex-wrap items-center gap-2">
            {/* 과목이 많으면 칩이 줄바꿈돼 그래프를 밀어낸다 → CHIP_MAX 초과 시 드롭다운으로 */}
            {spaces.length > 1 &&
              (spaces.length > CHIP_MAX ? (
                <ViewPicker spaces={spaces} value={view} onChange={pickView} />
              ) : (
                <div className="flex w-fit gap-0.5 rounded-lg border border-hairline p-0.5">
                  {[...spaces.map((s) => ({ slug: s.slug, name: s.name })), { slug: "", name: "전체 과목" }].map((o) => (
                    <button
                      key={o.slug || "all"}
                      type="button"
                      onClick={() => pickView(o.slug)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[12px] transition-colors",
                        view === o.slug ? "bg-surface-soft font-semibold text-ink shadow-soft" : "text-ink-2 hover:text-ink",
                      )}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
              ))}
            {/* 계층 보기 ↔ 자유 배치 — 단일 과목 + 계층 관계 있을 때만 (병합 뷰는 항상 자유 배치) */}
            {view && hasHier && (
              <div className="flex w-fit gap-0.5 rounded-lg border border-hairline p-0.5">
                {(["hier", "force"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setLayoutMode(m)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[12px] transition-colors",
                      layoutMode === m ? "bg-surface-soft font-semibold text-ink shadow-soft" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {m === "hier" ? "계층 보기" : "자유 배치"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 전체 뷰 범례: 색 → 공간 */}
        {!view && spacesPresent.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {spacesPresent.map((slug) => (
              <span key={slug} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: spaceColors[slug] ?? "#a39e98" }} />
                {spaces.find((s) => s.slug === slug)?.name ?? slug}
              </span>
            ))}
          </div>
        )}

        {/* 관계 그룹 필터 — 칩이 곧 범례: 스와치(실선/점선·복습색)가 그래프 인코딩 그대로 */}
        {groupsPresent.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {groupsPresent.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleGroup(g.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  groupFilter.length === 0 || groupFilter.includes(g.id)
                    ? "border-hairline text-ink-2"
                    : "border-hairline text-ink-faint opacity-50",
                )}
              >
                <span
                  className="inline-block w-4 border-t-2"
                  style={{
                    borderTopStyle: g.dash === "dashed" ? "dashed" : "solid",
                    borderTopColor: g.id === "review" ? REVIEW_COLOR : "currentColor",
                  }}
                />
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* Subject 필터 (단일 과목 뷰에서 subject 2개 이상일 때만. 전체 뷰는 space 축이라 숨김) */}
        {view && subjectIds.length > 1 && (
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

        <Card padding="none" className="relative min-h-0 flex-1 overflow-hidden">
          {graph && graph.nodes.length > 0 ? (
            <>
              <CytoscapeGraph
                data={graph}
                typeFilter={typeFilter}
                subjectFilter={subjectFilter}
                reviewOnly={reviewOnly}
                spaceColors={view ? undefined : spaceColors}
                selectedId={selNode}
                focus={focus}
                layout={!view || !hasHier ? "force" : layoutMode}
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
              {/* 복습 필터를 켰는데 표시한 개념이 없으면 빈 캔버스만 남는다 — 왜 비었는지 말해준다. */}
              {reviewOnly && reviewedIds.size === 0 && (
                <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-ink-muted">
                  복습으로 표시한 개념이 없어요
                </p>
              )}
              {/* 그래프 읽는 법(첫 방문 자동 펼침, 이후 ? 재호출) + 관계 품질 미터
                  래퍼는 pointer-events-none — items-end 로 커진 투명 영역이 그래프 클릭·팬을 먹지 않게. */}
              <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-wrap items-end gap-1.5">
                {helpOpen ? (
                  <div className="pointer-events-auto max-w-[300px] rounded-lg border border-hairline bg-surface p-3 shadow-elevated">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-ink">그래프 읽는 법</p>
                      <button
                        type="button"
                        aria-label="도움말 닫기"
                        onClick={closeHelp}
                        className="text-[12px] text-ink-faint transition-colors hover:text-ink"
                      >
                        ✕
                      </button>
                    </div>
                    <ul className="space-y-1 text-[12px] leading-relaxed text-ink-2">
                      <li>· 위에 있을수록 기초·전체 개념, 아래로 갈수록 세부예요</li>
                      <li>· 실선은 뼈대(구조·인과), 점선은 느슨한 연결 — 빨간 선은 복습 표시</li>
                      <li>· 확대하거나 점에 마우스를 올리면 관계 이름이 떠요 — 선을 클릭하면 문장으로 설명해 드려요</li>
                    </ul>
                  </div>
                ) : (
                  <GraphCtl label="그래프 읽는 법" onClick={() => setHelpOpen(true)} className="pointer-events-auto">
                    ?
                  </GraphCtl>
                )}
                <RelationQualityMeter relations={graph.relations} />
              </div>
            </>
          ) : (
            <p className="p-6 text-[15px] text-ink-muted">그래프 데이터가 없습니다. Inbox에서 노트를 저장하고 AI 정리를 실행해보세요.</p>
          )}
        </Card>
      </div>

      <div className="w-80 shrink-0">
        {edge ? (
          <Card padding="lg" className="flex h-full max-h-full flex-col gap-2 overflow-y-auto">
            <span className="inline-flex w-fit items-baseline gap-1.5 rounded-full border border-hairline px-2.5 py-0.5 text-[12px] font-semibold text-ink">
              {RELATION_LABEL[edge.relationType] ?? edge.relationType}
              <span className="font-mono text-[10px] font-normal text-ink-faint">{edge.relationType}</span>
            </span>
            {/* 방향을 문장에 녹여 화살표 오독 차단 — "A → B" 헤드라인 대체 */}
            <p className="text-[15px] font-semibold leading-relaxed text-ink">
              {relationSentence(edge.relationType, nodeTitle(edge.sourceNodeId), nodeTitle(edge.targetNodeId))}
            </p>
            <p className="text-[13px] text-ink-muted">
              {strengthLabel(edge.strength)} · {confidenceLabel(edge.confidence)}{" "}
              <span className="text-[12px] text-ink-faint">
                ({edge.strength.toFixed(2)} · {edge.confidence.toFixed(2)})
              </span>
            </p>
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
            {/* 제목은 본문 마크다운 첫 줄의 `# 제목`(H1)이 렌더한다 — 여기서 또 찍으면 두 번 나온다 */}
            {/* 액션은 한 줄 수평 배치(인박스 위키 패널과 동일) — 표시/해제 + 열기.
                붙이는 것도 거두는 것도 사용자다 — AI 는 이 표시를 못 만들고 못 지운다. */}
            {nodeReviewed ? (
              <div className="mb-2 flex items-center gap-2">
                <Button size="sm" variant="utility" className="shrink-0" onClick={() => onOpenWiki(nodeSpace, page.path)}>
                  열기
                </Button>
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-dashed px-2 py-1.5" style={{ borderColor: REVIEW_COLOR }}>
                  {/* 열기와 한 행을 나눠 쓰므로 배너에 남는 폭이 ~128px 뿐이다 — 문구를 짧게 두고
                      nowrap 으로 못박아 줄바꿈으로 행 높이가 튀지 않게 한다. */}
                  <p className="min-w-0 flex-1 truncate text-[12px] leading-snug" style={{ color: REVIEW_COLOR }}>
                    아직 모르겠음
                  </p>
                  <Button
                    size="sm"
                    variant="utility"
                    className="shrink-0 whitespace-nowrap"
                    disabled={unmarking}
                    onClick={async () => {
                      setUnmarking(true);
                      try {
                        await onUnmarkReview(nodeSpace, node.id, page.title);
                      } finally {
                        setUnmarking(false);
                      }
                    }}
                  >
                    {unmarking ? "해제 중…" : "표시 해제"}
                  </Button>
                </div>
              </div>
            ) : (
              // 두 버튼이 행을 나눠 채운다 — 제목을 뺀 자리가 빈칸으로 남지 않게(패널 폭 320px 고정).
              <div className="mb-2 flex items-center gap-2">
                <Button size="sm" variant="utility" className="flex-1" onClick={() => onOpenWiki(nodeSpace, page.path)}>
                  열기
                </Button>
                <Button
                  size="sm"
                  variant="utility"
                  className="flex-1 whitespace-nowrap"
                  disabled={!nodeSourceId}
                  title={nodeSourceId ? undefined : "출처가 없는 개념은 표시할 수 없어요"}
                  onClick={() => setMarkOpen(true)}
                >
                  아직 모르겠다고 표시
                </Button>
              </div>
            )}
            {markOpen && node && page && (
              // 이유가 곧 evidence 다 — 사용자의 말이 근거로 남는다(graph.rs: evidence ≥ 1).
              <PromptDialog
                title={`"${page.title}" — 무엇이 아직 막히나요?`}
                placeholder="어떤 부분에서 이해가 어렵나요?"
                submitLabel="표시"
                quickSubmit="왜 그렇게 되는지 모르겠어요"
                onCancel={() => setMarkOpen(false)}
                onSubmit={async (reason) => {
                  setMarkOpen(false);
                  await onMarkReview(nodeSpace, node.id, page.title, nodeSourceId, reason);
                }}
              />
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Markdown source={stripFeynmanSection(page.markdown)} />
            </div>
          </Card>
        ) : (
          <Card padding="lg" className="flex h-full items-center justify-center text-center">
            <p className="text-[14px] text-ink-muted">
              점(개념)을 클릭 → 위키
              <br />
              선(관계)을 클릭 → 문장 설명·근거
              <br />
              <span className="text-[12px] text-ink-faint">점에 마우스를 올리면 이웃만 강조돼요</span>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
