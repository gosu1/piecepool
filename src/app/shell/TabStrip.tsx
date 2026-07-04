import { cn, Icons } from "../../ds";
import type { WorkspaceTab, TabKind } from "../../store/workspaceStore";

// ══ 센터 탭 스트립 (Obsidian pane 탭) — 열린 아티팩트 목록. TitlebarRow 안에서 렌더된다. ══
export function TabIcon({ kind }: { kind: TabKind }) {
  const size = 15;
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
    // bare drag-region: 마지막 탭 오른쪽 빈 영역(mousedown 대상 = 이 컨테이너)만 창 드래그.
    // 스크롤 없이 overflow-hidden — 넘치는 탭은 우측 "탭 목록" 스택 드롭다운으로 찾는다.
    <div data-tauri-drag-region="" className="flex min-w-0 items-center gap-1 self-stretch overflow-hidden px-1">
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
              "group my-auto flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[14px] transition-colors",
              active ? "bg-canvas text-ink" : "text-ink-muted hover:bg-surface-soft/60 hover:text-ink",
            )}
          >
            <span className={cn("shrink-0", active ? "text-ink-muted" : "text-ink-faint")}>
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
