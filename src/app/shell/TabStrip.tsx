import { cn, Icons } from "../../ds";
import type { WorkspaceTab, TabKind } from "../../store/workspaceStore";

// ══ 센터 탭 스트립 (Obsidian pane 탭) — 열린 아티팩트 목록 ══
function TabIcon({ kind }: { kind: TabKind }) {
  const size = 14;
  if (kind === "graph") return <Icons.GraphIcon size={size} />;
  if (kind === "inbox") return <Icons.PlusIcon size={size} />;
  if (kind === "archive") return <Icons.FileUpIcon size={size} />;
  if (kind === "home") return <Icons.BarChartIcon size={size} />;
  return <Icons.FileIcon size={size} />;
}

const TAB_MIME = "application/x-piecepool-tab";

export function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  onReorder,
}: {
  tabs: WorkspaceTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder?: (dragId: string, targetId: string) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-hairline bg-surface px-2">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t.id)}
            onAuxClick={(e) => {
              // 휠클릭(가운데 버튼) → 탭 닫기
              if (e.button === 1) {
                e.preventDefault();
                onClose(t.id);
              }
            }}
            draggable={!!onReorder}
            onDragStart={
              onReorder
                ? (e) => {
                    e.dataTransfer.setData(TAB_MIME, t.id);
                    e.dataTransfer.effectAllowed = "move";
                  }
                : undefined
            }
            onDragOver={
              onReorder
                ? (e) => {
                    if (e.dataTransfer.types.includes(TAB_MIME)) e.preventDefault();
                  }
                : undefined
            }
            onDrop={
              onReorder
                ? (e) => {
                    e.preventDefault();
                    const dragId = e.dataTransfer.getData(TAB_MIME);
                    if (dragId && dragId !== t.id) onReorder(dragId, t.id);
                  }
                : undefined
            }
            className={cn(
              "group flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors",
              active ? "border-primary text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            <span className={cn("shrink-0", active ? "text-primary" : "text-ink-faint")}>
              <TabIcon kind={t.kind} />
            </span>
            <span className="max-w-[160px] truncate">{t.title}</span>
            {t.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" />}
            <button
              type="button"
              aria-label="탭 닫기"
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
              className="ml-0.5 rounded p-0.5 text-ink-faint opacity-0 transition-opacity hover:bg-fill-subtle hover:text-ink group-hover:opacity-100"
            >
              <Icons.CloseIcon size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
