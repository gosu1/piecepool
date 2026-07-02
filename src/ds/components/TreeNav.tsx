import { useState } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
} from "../icons";
import { cn } from "../lib/cn";

// 트리 노드 — 폴더는 children 을 가지고, 파일은 잎(leaf) 노드다.
export interface TreeNode {
  id: string;
  label: string;
  type: "folder" | "file";
  children?: TreeNode[];
}

export interface TreeNavProps {
  nodes: TreeNode[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  defaultExpandedIds?: string[];
  className?: string;
}

// 사이드바 파일/폴더 트리. 조용한 Notion 앱셸 행 — 활성 행만 blue 인디케이터.
export function TreeNav({
  nodes,
  selectedId,
  onSelect,
  defaultExpandedIds,
  className,
}: TreeNavProps) {
  // 펼쳐진 폴더 id 집합 — defaultExpandedIds 로 seed.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  );

  // 폴더 펼침 토글.
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 재귀 렌더 — depth 로 들여쓰기.
  const renderNode = (node: TreeNode, depth: number) => {
    const isFolder = node.type === "folder";
    const isExpanded = expanded.has(node.id);
    const isSelected = node.id === selectedId;

    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => (isFolder ? toggle(node.id) : onSelect?.(node.id))}
          style={{ paddingLeft: depth * 14 + 8 }}
          className={cn(
            "h-8 w-full rounded-sm flex items-center gap-1.5 text-[15px] pr-2 transition-colors",
            isSelected
              ? "bg-surface-soft text-ink font-medium"
              : "text-ink-muted hover:bg-surface-soft hover:text-ink",
          )}
        >
          {isFolder ? (
            <>
              {isExpanded ? (
                <ChevronDownIcon size={14} className="shrink-0 text-ink-faint" />
              ) : (
                <ChevronRightIcon size={14} className="shrink-0 text-ink-faint" />
              )}
              {isExpanded ? (
                <FolderOpenIcon size={15} className="shrink-0" />
              ) : (
                <FolderIcon size={15} className="shrink-0" />
              )}
            </>
          ) : (
            <>
              {/* chevron 자리 맞춤용 spacer */}
              <span className="w-3.5 shrink-0" />
              <FileIcon size={15} className="shrink-0" />
            </>
          )}
          <span className="min-w-0 truncate">{node.label}</span>
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
