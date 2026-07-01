import { cn } from "../lib/cn";

// PiecePool 로고. 마크(조각들이 모인 풀) + 워드마크.
export interface LogoProps {
  markOnly?: boolean;
  size?: number;
  className?: string;
}

function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" fill="currentColor" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ markOnly = false, size = 20, className }: LogoProps) {
  if (markOnly) {
    return (
      <span className={cn("inline-flex text-ink", className)}>
        <Mark size={size} />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <Mark size={size} />
      <span className="text-[15px] font-semibold tracking-[-0.2px]">PiecePool</span>
    </span>
  );
}
