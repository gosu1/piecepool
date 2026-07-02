import type { ReactNode } from "react";
import { BarChartIcon } from "../icons";
import { cn } from "../lib/cn";

export interface PlaceholderPanelProps {
  /** 빈 영역에 표시할 안내 문구 */
  label?: string;
  /** 기본 막대그래프 아이콘 대체용 */
  icon?: ReactNode;
  /** 패널 최소 높이(px) */
  minHeight?: number;
  className?: string;
}

/** 아직 구현되지 않은 모듈 자리를 표시하는 점선 플레이스홀더 패널 */
export function PlaceholderPanel({
  label = "Future Analytics Module Placeholder",
  icon,
  minHeight,
  className,
}: PlaceholderPanelProps) {
  return (
    <div
      style={{ minHeight: minHeight ?? 128 }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-hairline text-ink-faint",
        className,
      )}
    >
      {icon ?? <BarChartIcon size={28} />}
      <span className="text-[13px]">{label}</span>
    </div>
  );
}
