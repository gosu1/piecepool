import type { ReactNode } from "react";
import { cn, Icons } from "../../ds";
import type { WikiPage as WikiPageT } from "../../lib/types";
import { ListItem } from "./ListItem";

// ══ Wiki 섹션 (Source 형 master-detail + 하단 project→그래프) ══
export function WikiSection({
  spaceName,
  pages,
  selected,
  onSelect,
  onProject,
  children,
}: {
  spaceName: string;
  pages: WikiPageT[];
  selected: string; // path 또는 "__project__"
  onSelect: (path: string) => void;
  onProject: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[520px] gap-4">
      <div className="flex w-64 shrink-0 flex-col">
        <div className="mb-2">
          <h1 className="text-[18px] font-bold text-ink">Wiki</h1>
          <p className="text-[13px] text-ink-muted">{spaceName} · LLM 개념 위키</p>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {pages.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-ink-muted">아직 위키가 없어요.</p>
          ) : (
            pages.map((p) => (
              <ListItem
                key={p.path}
                icon={<Icons.FileIcon size={15} />}
                title={p.title}
                active={selected === p.path}
                onClick={() => onSelect(p.path)}
              />
            ))
          )}
        </div>
        {/* 하단 project → 그래프 */}
        <div className="mt-2 border-t border-hairline pt-2">
          <button
            type="button"
            onClick={onProject}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[14px] font-medium transition-colors",
              selected === "__project__" ? "bg-primary text-on-primary" : "text-ink-muted hover:bg-surface-soft hover:text-ink",
            )}
          >
            <Icons.GraphIcon size={16} />
            project
          </button>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
