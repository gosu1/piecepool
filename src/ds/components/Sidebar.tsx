import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { IconButton } from "../primitives/IconButton";
import { Logo } from "../primitives/Logo";
import { FolderIcon, SortIcon, FileUpIcon, GraphIcon, LogoutIcon } from "../icons";
import { TreeNav } from "./TreeNav";
import type { TreeNode } from "./TreeNav";

// 좌측 사이드바: 로고 + 툴바(폴더 추가 / 정렬 / 파일 추가 / 그래프 뷰) + 파일 트리 + 로그아웃.
export interface SidebarProps {
  nodes: TreeNode[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  defaultExpandedIds?: string[];
  onAddFolder?: () => void;
  onSort?: () => void;
  onAddFile?: () => void;
  onToggleGraph?: () => void;
  onLogout?: () => void;
  footer?: ReactNode;
  className?: string;
}

export function Sidebar({
  nodes,
  selectedId,
  onSelect,
  defaultExpandedIds,
  onAddFolder,
  onSort,
  onAddFile,
  onToggleGraph,
  onLogout,
  footer,
  className,
}: SidebarProps) {
  return (
    <aside className={cn("flex h-full w-60 shrink-0 flex-col border-r border-hairline bg-canvas", className)}>
      {/* 로고 + 툴바 */}
      <div className="px-3 pt-3 pb-2">
        <Logo markOnly className="px-1" size={18} />
        <div className="mt-2 flex items-center gap-0.5">
          <IconButton size="sm" aria-label="폴더 추가" onClick={onAddFolder}>
            <FolderIcon size={16} />
          </IconButton>
          <IconButton size="sm" aria-label="정렬 방식" onClick={onSort}>
            <SortIcon size={16} />
          </IconButton>
          <IconButton size="sm" aria-label="파일 추가" onClick={onAddFile}>
            <FileUpIcon size={16} />
          </IconButton>
          <IconButton size="sm" aria-label="그래프 뷰" onClick={onToggleGraph}>
            <GraphIcon size={16} />
          </IconButton>
        </div>
      </div>

      {/* 파일 트리 */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <TreeNav nodes={nodes} selectedId={selectedId} onSelect={onSelect} defaultExpandedIds={defaultExpandedIds} />
      </nav>

      {/* 하단: 로그아웃 / 커스텀 푸터 */}
      <div className="border-t border-hairline p-2">
        {footer ?? (
          <button
            type="button"
            onClick={onLogout}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-[15px] text-ink-muted",
              "transition-colors hover:bg-surface-soft hover:text-ink",
            )}
          >
            <LogoutIcon size={16} />
            Logout
          </button>
        )}
      </div>
    </aside>
  );
}
