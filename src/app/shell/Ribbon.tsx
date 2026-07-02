import type { ReactNode } from "react";
import { cn, Icons } from "../../ds";
import type { Section } from "../types";

// ══ 좌측 리본 (Obsidian식 세로 아이콘 네비) — 파일트리 토글 · 검색 · 섹션 · 설정 ══
export function Ribbon({
  section,
  onSection,
  onSearch,
  onToggleFiles,
  filesOpen,
  onSettings,
}: {
  section: Section;
  onSection: (s: Section) => void;
  onSearch: () => void;
  onToggleFiles: () => void;
  filesOpen: boolean;
  onSettings: () => void;
}) {
  return (
    <nav className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-hairline bg-surface py-2">
      {/* 상단: 트리 토글 · 검색 */}
      <RibbonButton label="파일 트리" active={filesOpen} onClick={onToggleFiles}>
        <Icons.PanelLeftIcon size={18} />
      </RibbonButton>
      <RibbonButton label="검색 (⌘K)" onClick={onSearch}>
        <Icons.SearchIcon size={18} />
      </RibbonButton>

      <Divider />

      {/* 섹션 그룹 */}
      <RibbonButton label="Inbox" active={section === "inbox"} onClick={() => onSection("inbox")}>
        <Icons.FileUpIcon size={18} />
      </RibbonButton>
      <RibbonButton label="Wiki" active={section === "wiki"} onClick={() => onSection("wiki")}>
        <Icons.FileIcon size={18} />
      </RibbonButton>
      <RibbonButton label="Source" active={section === "source"} onClick={() => onSection("source")}>
        <Icons.FolderIcon size={18} />
      </RibbonButton>
      <RibbonButton label="Graph" active={section === "graph"} onClick={() => onSection("graph")}>
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
  return <div className="my-1.5 h-px w-5 bg-hairline" />;
}

function RibbonButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        active ? "bg-surface-soft text-primary" : "text-ink-muted hover:bg-surface-soft hover:text-ink",
      )}
    >
      {/* Obsidian식 왼쪽 accent 바 */}
      {active && <span className="absolute -left-1 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
      {children}
    </button>
  );
}
