import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// 앱 셸 레이아웃: 상단 TopBar(전체 폭) + 그 아래 [Ribbon | Sidebar | 본문 | RightRail] + 하단 StatusBar.
// leftRibbon·rightRail·statusBar 는 선택 슬롯(Study Vault shell 용) — 미지정 시 기존 레이아웃과 동일.
export interface AppShellProps {
  topBar?: ReactNode;
  sidebar?: ReactNode;
  leftRibbon?: ReactNode;
  rightRail?: ReactNode;
  statusBar?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function AppShell({
  topBar,
  sidebar,
  leftRibbon,
  rightRail,
  statusBar,
  children,
  className,
  contentClassName,
}: AppShellProps) {
  return (
    <div className={cn("flex h-full flex-col bg-canvas text-ink", className)}>
      {topBar}
      <div className="flex min-h-0 flex-1">
        {leftRibbon}
        {sidebar}
        <main className={cn("min-w-0 flex-1 overflow-y-auto p-6", contentClassName)}>{children}</main>
        {rightRail}
      </div>
      {statusBar}
    </div>
  );
}
