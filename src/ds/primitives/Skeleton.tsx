import { cn } from "../lib/cn";

// 로딩 스켈레톤. 좌→우 shimmer. 알약형 회색 바(AI 위키 작성 중 미완성 문단 줄).
export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export function Skeleton({ className, width, height = 12, rounded = true }: SkeletonProps) {
  return (
    <span
      className={cn("relative block overflow-hidden bg-surface-soft", rounded ? "rounded-full" : "rounded-xs", className)}
      style={{ width: width ?? "100%", height }}
    >
      <span
        className="absolute inset-0 -translate-x-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-ink) 7%, transparent), transparent)",
          animation: "ds-shimmer 1.4s infinite",
        }}
      />
    </span>
  );
}

// 여러 줄 텍스트 스켈레톤. 마지막 줄은 짧게.
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "55%" : "100%"} height={10} />
      ))}
    </div>
  );
}
