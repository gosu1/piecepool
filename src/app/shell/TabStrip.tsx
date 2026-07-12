import { Fragment } from "react";
import { cn, Icons } from "../../ds";
import type { WorkspaceTab, TabKind } from "../../store/workspaceStore";

// ══ 센터 탭 스트립 (pane 탭) — 열린 아티팩트 목록. TitlebarRow 안에서 렌더된다. ══
export function TabIcon({ kind }: { kind: TabKind }) {
  const size = 15;
  if (kind === "graph") return <Icons.GraphIcon size={size} />;
  if (kind === "inbox") return <Icons.InboxIcon size={size} />;
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
  // 개수 기반 폭 — 5개까지 220px, 6개부터 개당 16px씩 점진 축소(하한 132px).
  // 창이 좁으면 flex-shrink + min-w-[96px] 가 추가로 줄이고, 그 이하는 우측 드롭다운.
  const tabW = tabs.length <= 5 ? 220 : Math.max(132, 220 - (tabs.length - 5) * 16);
  return (
    // bare drag-region: 마지막 탭 오른쪽 빈 영역(mousedown 대상 = 이 컨테이너)만 창 드래그.
    // 스크롤 없이 overflow-hidden — 넘치는 탭은 우측 "탭 목록" 스택 드롭다운으로 찾는다.
    <div data-tauri-drag-region="" className="flex min-w-0 shrink items-center self-stretch overflow-hidden px-1">
      {tabs.map((t, i) => {
        const active = t.id === activeId;
        // 탭 구분선 — 인접한 두 비활성 탭 사이에만. 활성 탭 양옆은 숨김.
        const prevActive = i > 0 && tabs[i - 1].id === activeId;
        const showDivider = i > 0 && !active && !prevActive;
        return (
          <Fragment key={t.id}>
            {showDivider && <div aria-hidden="true" className="h-5 w-px shrink-0 self-center bg-ink-faint/50" />}
          <div
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
            style={{ width: tabW }}
            className={cn(
              // 폭은 개수 기반(tabW). min 96px 까지 축소 허용, width 전환으로 부드럽게.
              "group my-auto flex h-9 min-w-[96px] cursor-pointer items-center gap-1.5 rounded-md px-3 text-[14px] transition-[width,background-color,color] duration-150",
              // 활성 탭 = 음영(canvas 배경) + 그림자로 띄우고 + 볼드 + 위 액센트 선. 지금 어느 탭인지 한눈에.
              active
                ? "bg-canvas font-semibold text-ink shadow-soft"
                : "text-ink-muted hover:bg-surface-soft/60 hover:text-ink",
            )}
          >
            <span className={cn("shrink-0", active ? "text-ink-muted" : "text-ink-faint")}>
              <TabIcon kind={t.kind} />
            </span>
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
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
          </Fragment>
        );
      })}
    </div>
  );
}
