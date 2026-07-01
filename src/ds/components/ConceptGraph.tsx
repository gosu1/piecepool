import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { GraphLegend } from "./GraphLegend";

// 학습 개념 그래프(노드-링크 패널). 라이트=모노크롬 그레이 노드, 다크=블루 코어(토큰 자동).
// 실선 엣지=연결, 점선=약한 관계. x,y는 0..1 정규화 좌표.
export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  kind?: "core" | "result";
}

export interface GraphEdge {
  source: string;
  target: string;
  weak?: boolean;
}

export interface ConceptGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  title?: string;
  caption?: string;
  legend?: ReactNode;
  height?: number;
  className?: string;
  onNodeClick?: (id: string) => void;
}

export function ConceptGraph({ nodes, edges, title, caption, legend, height = 320, className, onNodeClick }: ConceptGraphProps) {
  // id -> node 조회 맵 (엣지 끝점 좌표 lookup)
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {title && <div className="ds-body-sm font-semibold text-ink-2">{title}</div>}

      <div className="relative w-full" style={{ height }}>
        {/* 엣지: viewBox 0..100 + preserveAspectRatio none → 퍼센트 좌표 선이 잘 늘어남 */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {edges.map((edge, i) => {
            const a = byId.get(edge.source);
            const b = byId.get(edge.target);
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.x * 100}
                y1={a.y * 100}
                x2={b.x * 100}
                y2={b.y * 100}
                className="stroke-graph-edge"
                strokeWidth={0.4}
                strokeDasharray={edge.weak ? "1.5 1.5" : undefined}
              />
            );
          })}
        </svg>

        {/* 노드 + 라벨: HTML div 절대 배치 → 원이 항상 정원 유지. ring-canvas 로 엣지와 분리되는 헤일로 */}
        {nodes.map((node) => (
          <div
            key={node.id}
            onClick={onNodeClick ? () => onNodeClick(node.id) : undefined}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5",
              onNodeClick && "cursor-pointer",
            )}
            style={{ left: node.x * 100 + "%", top: node.y * 100 + "%" }}
          >
            <span
              className={cn(
                "h-3.5 w-3.5 rounded-full ring-4 ring-canvas transition-transform",
                onNodeClick && "hover:scale-125",
                node.kind === "result" ? "bg-graph-result" : "bg-graph-core",
              )}
            />
            <span
              className={cn(
                "whitespace-nowrap text-[13px]",
                node.kind === "result" ? "text-ink-muted" : "font-medium text-ink",
              )}
            >
              {node.label}
            </span>
          </div>
        ))}
      </div>

      {legend ?? <GraphLegend />}
      {caption && <p className="text-[13px] text-ink-faint">{caption}</p>}
    </div>
  );
}
