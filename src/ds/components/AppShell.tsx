import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// 앱 셸 레이아웃: 상단 TopBar(전체 폭) + 그 아래 [Sidebar | 본문]. 본문은 따뜻한 페이퍼 캔버스.
export interface AppShellProps {
  topBar?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function AppShell({ topBar, sidebar, children, className, contentClassName }: AppShellProps) {
  return (
    <div className={cn("flex h-full flex-col bg-canvas text-ink", className)}>
      {topBar}
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <main className={cn("min-w-0 flex-1 overflow-y-auto p-6", contentClassName)}>{children}</main>
      </div>
    </div>
  );
}
