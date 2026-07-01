import { cn } from "../lib/cn";

// 개념 그래프 하단 범례: 핵심/결과/약한 관계를 색·선으로 안내
export type LegendKind = "core" | "result" | "edge" | "weak";

export interface LegendItem {
  kind: LegendKind;
  label: string;
}

export interface GraphLegendProps {
  items?: LegendItem[];
  className?: string;
}

const DEFAULT_ITEMS: LegendItem[] = [
  { kind: "core", label: "핵심 개념" },
  { kind: "result", label: "결과 개념" },
  { kind: "weak", label: "약한 관계" },
];

// kind별 스와치: 점(핵심/결과) · 실선/점선(엣지) — 색상은 graph 토큰이 라이트/다크 자동 처리
function Swatch({ kind }: { kind: LegendKind }) {
  switch (kind) {
    case "core":
      return <span className="h-2.5 w-2.5 rounded-full bg-graph-core" />;
    case "result":
      return <span className="h-2.5 w-2.5 rounded-full bg-graph-result" />;
    case "edge":
      return <span className="h-px w-5 bg-graph-edge" />;
    case "weak":
      return <span className="h-0 w-5 border-t border-dashed border-graph-edge" />;
  }
}

export function GraphLegend({ items = DEFAULT_ITEMS, className }: GraphLegendProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5", className)}>
      {items.map((item, i) => (
        <span
          key={`${item.kind}-${i}`}
          className="flex items-center gap-1.5 text-[13px] text-ink-muted"
        >
          <Swatch kind={item.kind} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export default GraphLegend;
