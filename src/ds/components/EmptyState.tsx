import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// 비어있는 상태/플레이스홀더를 중앙 정렬로 보여주는 제네릭 컴포넌트
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      {icon && <div className="text-ink-faint">{icon}</div>}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-[15px] text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
