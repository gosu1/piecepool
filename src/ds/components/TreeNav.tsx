import { useState } from "react";
import type { DragEvent } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
} from "../icons";
import { cn } from "../lib/cn";

// 트리 노드 — 폴더는 children 을 가지고, 파일은 잎(leaf) 노드다.
// draggable 파일은 드래그로 dropTarget 폴더에 이동, dropTarget 폴더는 OS 파일 드랍도 받는다.
export interface TreeNode {
  id: string;
  label: string;
  type: "folder" | "file";
  children?: TreeNode[];
  draggable?: boolean;
  dropTarget?: boolean;
}

// 내부 DnD 식별용 MIME — OS 파일 드랍(Files)과 구분한다.
const NODE_MIME = "application/x-piecepool-node";

export interface TreeNavProps {
  nodes: TreeNode[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** 비제어 모드 초기 펼침(데모 화면용). collapsedIds 지정 시 무시. */
  defaultExpandedIds?: string[];
  /** 제어 모드: 접힌 폴더 id 집합(기본 전체 펼침). onToggle 과 함께 쓴다. */
  collapsedIds?: string[];
  onToggle?: (id: string) => void;
  /** 파일 노드를 dropTarget 폴더에 드랍했을 때. */
  onMoveNode?: (dragId: string, dropFolderId: string) => void;
  /** OS 파일을 dropTarget 폴더에 드랍했을 때. */
  onDropFiles?: (dropFolderId: string, files: FileList) => void;
  /** 파일 노드 우클릭(컨텍스트 메뉴). 화면 좌표 전달. */
  onContextMenu?: (id: string, x: number, y: number) => void;
  className?: string;
}

// 사이드바 파일/폴더 트리. 조용한 Notion 앱셸 행 — 활성 행만 blue 인디케이터.
export function TreeNav({
  nodes,
  selectedId,
  onSelect,
  defaultExpandedIds,
  collapsedIds,
  onToggle,
  onMoveNode,
  onDropFiles,
  onContextMenu,
  className,
}: TreeNavProps) {
  // 비제어 폴백(데모 화면) — collapsedIds 가 오면 제어 모드.
  const [localExpanded, setLocalExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  );
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const controlled = collapsedIds !== undefined;
  const isExpandedOf = (id: string) =>
    controlled ? !collapsedIds.includes(id) : localExpanded.has(id);

  const toggle = (id: string) => {
    if (controlled) {
      onToggle?.(id);
      return;
    }
    setLocalExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const acceptsDrop = (e: DragEvent) =>
    e.dataTransfer.types.includes(NODE_MIME) || e.dataTransfer.types.includes("Files");

  const renderNode = (node: TreeNode, depth: number) => {
    const isFolder = node.type === "folder";
    const isExpanded = isExpandedOf(node.id);
    const isSelected = node.id === selectedId;
    const isDropTarget = isFolder && !!node.dropTarget && (!!onMoveNode || !!onDropFiles);
    // md 외 확장자는 Obsidian 처럼 대문자 배지로 분리 표기 (현재 트리 라벨은 제목이라 대부분 무확장).
    const extMatch = !isFolder ? node.label.match(/\.(\w+)$/) : null;
    const ext = extMatch && extMatch[1].toLowerCase() !== "md" ? extMatch[1] : null;

    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => (isFolder ? toggle(node.id) : onSelect?.(node.id))}
          onContextMenu={
            !isFolder && onContextMenu
              ? (e) => {
                  e.preventDefault();
                  onContextMenu(node.id, e.clientX, e.clientY);
                }
              : undefined
          }
          draggable={!isFolder && !!node.draggable}
          onDragStart={
            !isFolder && node.draggable
              ? (e) => {
                  e.dataTransfer.setData(NODE_MIME, node.id);
                  e.dataTransfer.effectAllowed = "move";
                }
              : undefined
          }
          onDragOver={
            isDropTarget
              ? (e) => {
                  if (!acceptsDrop(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = e.dataTransfer.types.includes(NODE_MIME) ? "move" : "copy";
                  setDragOverId(node.id);
                }
              : undefined
          }
          onDragLeave={isDropTarget ? () => setDragOverId((cur) => (cur === node.id ? null : cur)) : undefined}
          onDrop={
            isDropTarget
              ? (e) => {
                  e.preventDefault();
                  setDragOverId(null);
                  const dragId = e.dataTransfer.getData(NODE_MIME);
                  if (dragId) onMoveNode?.(dragId, node.id);
                  else if (e.dataTransfer.files?.length) onDropFiles?.(node.id, e.dataTransfer.files);
                }
              : undefined
          }
          style={{ paddingLeft: depth * 12 + 6 }}
          className={cn(
            "h-[26px] w-full rounded-[4px] flex items-center gap-1.5 text-[13px] pr-1.5 transition-colors",
            isSelected
              ? "bg-surface-soft text-ink"
              : "text-ink-muted hover:bg-surface-soft/70 hover:text-ink",
            dragOverId === node.id && "bg-primary/10 outline outline-1 outline-primary/50",
          )}
        >
          {isFolder ? (
            <>
              {isExpanded ? (
                <ChevronDownIcon size={12} className="shrink-0 text-ink-faint" />
              ) : (
                <ChevronRightIcon size={12} className="shrink-0 text-ink-faint" />
              )}
              {isExpanded ? (
                <FolderOpenIcon size={14} className="shrink-0" />
              ) : (
                <FolderIcon size={14} className="shrink-0" />
              )}
            </>
          ) : (
            <>
              {/* chevron 자리 맞춤용 spacer */}
              <span className="w-3 shrink-0" />
              <FileIcon size={14} className="shrink-0" />
            </>
          )}
          <span className="min-w-0 truncate">{ext ? node.label.slice(0, -(ext.length + 1)) : node.label}</span>
          {ext && (
            <span className="ml-auto shrink-0 rounded-sm bg-fill-subtle px-1 text-[9px] font-semibold uppercase text-ink-faint">{ext}</span>
          )}
        </button>
        {isFolder && isExpanded && node.children
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  return (
    <nav className={cn("flex flex-col", className)}>
      {nodes.map((node) => renderNode(node, 0))}
    </nav>
  );
}
