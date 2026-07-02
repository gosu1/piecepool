import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import type { ElementDefinition } from "cytoscape";
import { groupOf, REVIEW_COLOR, RELATION_LABEL } from "./relationMeta";
import type { RelationType } from "./generated/RelationType";
import { useTheme, Icons } from "../ds";

// ── 미니 로컬 그래프 (위키 관계 섹션) — 현재 개념을 중심에 두고 이웃 관계만 한눈에 ──
// 컨테이너 크기를 재서 타원으로 꽉 채우는 프리셋 배치(공백 최소화·간선 길게).
// 앱 글꼴 사용, 중심 노드 헤일로, 간선 위 한국어 관계 라벨, 호버 확대 효과.
// 작은 뷰는 정적 위젯 + ⤢ 버튼으로 큰 오버레이(줌/팬 가능).
// 시각 언어는 relationMeta 공유 — 모노크롬 엣지(복습만 빨강), 의미는 실선/점선·화살표·라벨이 나른다.
interface MiniGroup {
  type: string;
  items: { label: string; dir: "out" | "in"; onClick: () => void }[];
}

function GraphCanvas({
  centerTitle,
  groups,
  maxZoom,
  interactive,
  onAfterNavigate,
  className,
}: {
  centerTitle: string;
  groups: MiniGroup[];
  /** fit 확대 상한 — 노드 뻥튀기 방지(작은 뷰 1, 확대 뷰 1.8) */
  maxZoom: number;
  interactive: boolean;
  onAfterNavigate?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const afterRef = useRef(onAfterNavigate);
  afterRef.current = onAfterNavigate;

  useEffect(() => {
    if (!ref.current) return;
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    const fontFam = getComputedStyle(document.body).fontFamily || "sans-serif";

    // 같은 개념이 여러 타입에 등장할 수 있으므로 노드는 중복 제거, 간선은 타입별로 전부 그린다.
    // 이웃 노드 링 색 = 첫 관계의 엣지 색(모노크롬 · review 만 빨강).
    const neighbors = new Map<string, { onClick: () => void; ring: string }>();
    const edges: ElementDefinition[] = [];
    for (const g of groups) {
      const grp = groupOf(g.type as RelationType);
      const color = grp.id === "review" ? REVIEW_COLOR : v("--ds-ink-faint", "#b8b5ad");
      const label = RELATION_LABEL[g.type as RelationType] ?? g.type;
      for (const it of g.items) {
        if (!neighbors.has(it.label)) neighbors.set(it.label, { onClick: it.onClick, ring: color });
        const [source, target] = it.dir === "out" ? ["__center__", it.label] : [it.label, "__center__"];
        edges.push({
          data: {
            id: `${g.type}:${it.dir}:${it.label}`,
            source,
            target,
            color,
            type: label,
            dashed: grp.dash === "dashed" ? 1 : 0,
            arrow: grp.arrow ? 1 : 0,
          },
        });
      }
    }

    // 타원 프리셋 배치 — 컨테이너 실측 크기에 맞춰 가로로 넓게 채운다(왼쪽부터 시계방향).
    // 이웃 7개 이상이면 안/밖 두 링에 교차 배치해 라벨 겹침을 줄인다.
    const w = ref.current.clientWidth || 640;
    const h = ref.current.clientHeight || 288;
    const rx = Math.max(120, w / 2 - 110);
    const ry = Math.max(80, h / 2 - 44);
    const labels = [...neighbors.keys()];
    const nodes: ElementDefinition[] = [
      { data: { id: "__center__", label: centerTitle, center: 1 }, position: { x: 0, y: 0 } },
      ...labels.map((label, i) => {
        const angle = Math.PI + (2 * Math.PI * i) / labels.length;
        const f = labels.length > 6 && i % 2 === 1 ? 0.68 : 1;
        return {
          data: { id: label, label, ring: neighbors.get(label)!.ring },
          position: { x: f * rx * Math.cos(angle), y: f * ry * Math.sin(angle) },
        };
      }),
    ];

    const cy = cytoscape({
      container: ref.current,
      elements: [...nodes, ...edges],
      layout: { name: "preset", fit: true, padding: 16 } as never,
      maxZoom,
      minZoom: 0.3,
      userZoomingEnabled: interactive,
      userPanningEnabled: interactive,
      autoungrabify: true,
      style: [
        {
          selector: "node",
          style: {
            "background-color": v("--ds-surface", "#ffffff"),
            "border-width": 2,
            "border-color": "data(ring)",
            label: "data(label)",
            "font-family": fontFam,
            "font-size": 11,
            color: v("--ds-ink-2", "#615d59"),
            "text-valign": "bottom",
            "text-margin-y": 5,
            "text-wrap": "ellipsis",
            "text-max-width": "110px",
            width: 14,
            height: 14,
            "transition-property": "width height border-width",
            "transition-duration": 120,
          },
        },
        {
          selector: "node[center]",
          style: {
            "background-color": v("--ds-primary", "#0075de"),
            "border-width": 6,
            "border-color": v("--ds-primary", "#0075de"),
            "border-opacity": 0.2,
            color: v("--ds-ink", "#1f1e1c"),
            "font-weight": "bold",
            "font-size": 13,
            "text-wrap": "wrap",
            "text-max-width": "150px",
            width: 22,
            height: 22,
          },
        },
        { selector: "node.hov", style: { width: 18, height: 18, "border-width": 3 } },
        {
          selector: "edge",
          style: {
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            width: 1.8,
            "curve-style": "bezier",
            opacity: 0.55,
            label: "data(type)",
            "font-family": fontFam,
            "font-size": 9,
            "font-weight": 600,
            color: "data(color)",
            "text-rotation": "autorotate",
            "text-background-color": v("--ds-surface", "#ffffff"),
            "text-background-opacity": 0.85,
            "text-background-padding": "2px",
            "transition-property": "opacity width",
            "transition-duration": 120,
          },
        },
        // relationMeta 시각 언어 — 느슨한 연결(assoc·prov·review)은 점선, 대칭·상태 관계는 화살표 제거
        { selector: "edge[dashed = 1]", style: { "line-style": "dashed" } },
        { selector: "edge[arrow = 0]", style: { "target-arrow-shape": "none" } },
        { selector: "edge.hov", style: { opacity: 1, width: 2.5 } },
      ] as never,
    });

    cy.on("tap", "node", (e) => {
      const id = e.target.id();
      if (id !== "__center__") {
        neighbors.get(id)?.onClick();
        afterRef.current?.();
      }
    });
    // 호버 효과 — 이웃 노드 확대 + 연결 간선 강조, 클릭 가능함은 커서로 표시
    cy.on("mouseover", "node", (e) => {
      if (e.target.id() === "__center__") return;
      e.target.addClass("hov");
      e.target.connectedEdges().addClass("hov");
      if (ref.current) ref.current.style.cursor = "pointer";
    });
    cy.on("mouseout", "node", (e) => {
      e.target.removeClass("hov");
      e.target.connectedEdges().removeClass("hov");
      if (ref.current) ref.current.style.cursor = "default";
    });

    const ro = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 16);
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      cy.destroy();
    };
  }, [centerTitle, groups, theme, maxZoom, interactive]);

  return <div ref={ref} className={className} />;
}

export function MiniRelationGraph({
  centerTitle,
  groups,
  className,
}: {
  centerTitle: string;
  groups: MiniGroup[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // 확대 뷰 열려 있는 동안 Esc 로 닫기
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <div className={`relative ${className ?? ""}`}>
        <GraphCanvas centerTitle={centerTitle} groups={groups} maxZoom={1} interactive={false} className="h-full w-full" />
        <button
          type="button"
          aria-label="크게 보기"
          title="크게 보기"
          onClick={() => setExpanded(true)}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface text-[13px] text-ink-2 shadow-soft transition-colors hover:bg-surface-soft hover:text-ink"
        >
          ⤢
        </button>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-8" onClick={() => setExpanded(false)}>
          <div
            className="relative h-[75vh] w-full max-w-4xl overflow-hidden rounded-xl border border-hairline bg-canvas shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-11 items-center justify-between border-b border-hairline bg-surface px-4">
              <p className="text-[14px] font-semibold text-ink">관계 그래프 · {centerTitle}</p>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setExpanded(false)}
                className="rounded p-1 text-ink-faint hover:bg-surface-soft hover:text-ink"
              >
                <Icons.CloseIcon size={16} />
              </button>
            </div>
            <GraphCanvas
              centerTitle={centerTitle}
              groups={groups}
              maxZoom={1.8}
              interactive
              onAfterNavigate={() => setExpanded(false)}
              className="ds-dotgrid h-[calc(75vh-44px)] w-full"
            />
          </div>
        </div>
      )}
    </>
  );
}
