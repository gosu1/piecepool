import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "../lib/cn";
import { IconButton } from "../primitives/IconButton";
import { Logo } from "../primitives/Logo";
import { FileUpIcon, LogoutIcon } from "../icons";
import { TreeNav } from "./TreeNav";
import type { TreeNavProps, TreeNode } from "./TreeNav";

// 좌측 사이드바: 헤더 + 파일 트리 + 푸터. onResize 지정 시 우측 엣지 드래그로 폭 조절.
// headerSlot/shortcutsSlot 미지정 시 기존 로고+새 노트 헤더(데모 화면 호환).
export interface SidebarProps
  extends Pick<
    TreeNavProps,
    | "selectedId"
    | "onSelect"
    | "defaultExpandedIds"
    | "collapsedIds"
    | "onToggle"
    | "onMoveNode"
    | "onDragOutFile"
    | "onDropFiles"
    | "onContextMenu"
  > {
  nodes: TreeNode[];
  onAddFile?: () => void;
  onLogout?: () => void;
  footer?: ReactNode;
  /** 상단 헤더 대체 슬롯(Obsidian식 타이틀+액션). 미지정 시 로고+새 노트. */
  headerSlot?: ReactNode;
  /** 헤더 아래 숏컷 행(홈·새 노트 등). */
  shortcutsSlot?: ReactNode;
  /** px 단위 폭. 미지정 시 240px 고정. */
  width?: number;
  onResize?: (w: number) => void;
  /** 핸들 더블클릭 → 기본 폭 복원. */
  onResizeReset?: () => void;
  className?: string;
}

export function Sidebar({
  nodes,
  selectedId,
  onSelect,
  defaultExpandedIds,
  collapsedIds,
  onToggle,
  onMoveNode,
  onDragOutFile,
  onDropFiles,
  onContextMenu,
  onAddFile,
  onLogout,
  footer,
  headerSlot,
  shortcutsSlot,
  width,
  onResize,
  onResizeReset,
  className,
}: SidebarProps) {
  // 드래그 리사이즈 — window 레벨 pointermove 추적, 드래그 중 텍스트 선택 방지.
  const startResize = (e: ReactPointerEvent) => {
    if (!onResize || width === undefined) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: PointerEvent) => onResize(startW + (ev.clientX - startX));
    const onUp = () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside
      style={width !== undefined ? { width } : undefined}
      className={cn("relative flex h-full shrink-0 flex-col border-r border-hairline bg-chrome", width === undefined && "w-60", className)}
    >
      {/* 헤더 — 슬롯 미지정 시 기존 로고 + 새 노트 */}
      {headerSlot ?? (
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <Logo markOnly className="px-1" size={18} />
          {onAddFile && (
            <IconButton size="sm" aria-label="새 노트" onClick={onAddFile}>
              <FileUpIcon size={16} />
            </IconButton>
          )}
        </div>
      )}
      {shortcutsSlot}

      {/* 파일 트리 */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <TreeNav
          nodes={nodes}
          selectedId={selectedId}
          onSelect={onSelect}
          defaultExpandedIds={defaultExpandedIds}
          collapsedIds={collapsedIds}
          onToggle={onToggle}
          onMoveNode={onMoveNode}
          onDragOutFile={onDragOutFile}
          onDropFiles={onDropFiles}
          onContextMenu={onContextMenu}
        />
      </nav>

      {/* 하단: 로그아웃 / 커스텀 푸터 */}
      <div className="border-t border-hairline p-2">
        {footer ??
          (onLogout ? (
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
          ) : null)}
      </div>

      {/* 리사이즈 핸들 (우측 엣지) */}
      {onResize && width !== undefined && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="사이드바 폭 조절"
          onPointerDown={startResize}
          onDoubleClick={onResizeReset}
          className="absolute -right-[3px] top-0 z-10 h-full w-[6px] cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/40"
        />
      )}
    </aside>
  );
}
