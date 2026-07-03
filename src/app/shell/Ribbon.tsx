import type { ReactNode } from "react";
import { cn, Icons } from "../../ds";

// ══ 좌측 리본 (Obsidian식 세로 아이콘 네비) — 파일트리 토글 · 검색 · 새 노트 · 그래프 · 설정 ══
// Wiki/Source 는 파일 트리로 접근(리본에서 제거). 활성 표시는 현재 탭 kind 기준.
export function Ribbon({
  activeKind,
  onHome,
  onGraph,
  onCapture,
  onSearch,
  onToggleFiles,
  filesOpen,
  onSettings,
}: {
  activeKind?: string;
  onHome: () => void;
  onGraph: () => void;
  onCapture: () => void;
  onSearch: () => void;
  onToggleFiles: () => void;
  filesOpen: boolean;
  onSettings: () => void;
}) {
  return (
    <nav className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-hairline bg-chrome py-3">
      {/* Study Home */}
      <RibbonButton label="Study Home" active={activeKind === "home"} onClick={onHome}>
        <Icons.BarChartIcon size={18} />
      </RibbonButton>

      {/* 상단: 트리 토글 · 검색 */}
      <RibbonButton label="파일 트리" active={filesOpen} onClick={onToggleFiles}>
        <Icons.PanelLeftIcon size={18} />
      </RibbonButton>
      <RibbonButton label="검색 (⌘K)" onClick={onSearch}>
        <Icons.SearchIcon size={18} />
      </RibbonButton>

      <Divider />

      {/* 액션: 새 노트 · 그래프 */}
      <RibbonButton label="새 노트 (Inbox)" active={activeKind === "inbox"} onClick={onCapture}>
        <Icons.PlusIcon size={18} />
      </RibbonButton>
      <RibbonButton label="Graph" active={activeKind === "graph"} onClick={onGraph}>
        <Icons.GraphIcon size={18} />
      </RibbonButton>

      <div className="flex-1" />

      {/* 하단: 설정 */}
      <RibbonButton label="설정" onClick={onSettings}>
        <Icons.GearIcon size={18} />
      </RibbonButton>
    </nav>
  );
}

function Divider() {
  return <div className="my-2 h-px w-6 bg-hairline" />;
}

function RibbonButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
        // Obsidian quiet chrome — 활성도 모노크롬(액센트 없음)
        active ? "bg-fill-subtle text-ink" : "text-ink-muted hover:bg-fill-subtle hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
