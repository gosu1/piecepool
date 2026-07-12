import { useState } from "react";
import { cn, Icons, IconButton } from "../../ds";
import { useWorkspaceStore, type TreeSort } from "../../store/workspaceStore";

// 사이드바 파일 정렬 드롭다운 (이름/업데이트/생성일 × 오름·내림)
const SORT_OPTIONS: { label: string; sort: TreeSort }[] = [
  { label: "파일 이름 (알파벳순)", sort: { key: "name", dir: "asc" } },
  { label: "파일 이름 (알파벳 역순)", sort: { key: "name", dir: "desc" } },
  { label: "업데이트 날짜 (최신순)", sort: { key: "updated", dir: "desc" } },
  { label: "업데이트 날짜 (오래된 순)", sort: { key: "updated", dir: "asc" } },
  { label: "생성일 (최신순)", sort: { key: "created", dir: "desc" } },
  { label: "생성일 (오래된 순)", sort: { key: "created", dir: "asc" } },
];

function SortButton() {
  const [open, setOpen] = useState(false);
  const treeSort = useWorkspaceStore((s) => s.treeSort);
  const setTreeSort = useWorkspaceStore((s) => s.setTreeSort);
  const active = (s: TreeSort) => s.key === treeSort.key && s.dir === treeSort.dir;
  return (
    <div className="relative">
      <IconButton size="sm" aria-label="파일 정렬" onClick={() => setOpen((o) => !o)} className={cn(open && "bg-surface-soft text-ink")}>
        <Icons.SortIcon size={19} />
      </IconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-hairline bg-surface p-1 shadow-elevated">
            {SORT_OPTIONS.map((o, i) => (
              <div key={o.label}>
                {(i === 2 || i === 4) && <div className="my-1 h-px bg-hairline" />}
                <button
                  type="button"
                  onClick={() => {
                    setTreeSort(o.sort);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
                >
                  <span>{o.label}</span>
                  {active(o.sort) && <Icons.CheckIcon size={14} className="shrink-0 text-primary" />}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ══ 사이드바 크롬 — 헤더 액션 · 숏컷 행 ══
// Sidebar 의 headerSlot / shortcutsSlot 에 꽂힌다. 트리(TreeNav)는 건드리지 않는다.

export function SidebarHeader({ title, onNewNote }: { title: string; onNewNote: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
      <span className="truncate text-[16px] font-semibold text-ink-2">{title}</span>
      <span className="flex shrink-0 items-center">
        {/* 검색은 좌측 리본 돋보기로 통일(중복 제거). 새 노트만 유지 */}
        <IconButton size="sm" aria-label="새 노트 작성" onClick={onNewNote}>
          <Icons.EditIcon size={19} />
        </IconButton>
      </span>
    </div>
  );
}

export function SidebarShortcuts({
  onNewFolder,
  onToggleCollapseAll,
  allCollapsed = false,
  pinned = [],
  onOpenPinned,
  onUnpin,
}: {
  onNewFolder: () => void;
  onToggleCollapseAll: () => void;
  /** 모든 폴더가 접혀 있으면 true → 버튼이 "전체 펼치기"로 전환 */
  allCollapsed?: boolean;
  /** 페이지 헤더 "고정하기"로 고정한 문서 — 즐겨찾기 위치 */
  pinned?: { id: string; label: string }[];
  onOpenPinned?: (id: string) => void;
  /** 우클릭 컨텍스트 메뉴 "고정 해제" */
  onUnpin?: (id: string) => void;
}) {
  // 우클릭 메뉴가 열린 고정 문서 id
  const [menuFor, setMenuFor] = useState<string | null>(null);
  return (
    <div className="border-b border-hairline px-2 pb-1.5">
      {/* 가운데 정렬 · 순서: 새 폴더 → 정렬 → 전체 여닫이. 아이콘 3개뿐이라 간격 여유 있게 */}
      <div className="flex items-center justify-center gap-2.5">
        {/* 새 폴더(지식 공간) 추가. 홈은 좌측 리본 집 아이콘이 담당 */}
        <IconButton size="sm" aria-label="새 폴더 추가" onClick={onNewFolder}>
          <Icons.FolderPlusIcon size={19} />
        </IconButton>
        {/* 파일 정렬 — 이름/업데이트/생성일 */}
        <SortButton />
        {/* 전체 폴더 접기/펼치기 — 접혀 있으면 펼치기로 전환 */}
        <IconButton size="sm" aria-label={allCollapsed ? "전체 펼치기" : "전체 접기"} onClick={onToggleCollapseAll}>
          {allCollapsed ? <Icons.ChevronsUpDownIcon size={19} /> : <Icons.ChevronsDownUpIcon size={19} />}
        </IconButton>
      </div>
      {pinned.length > 0 && (
        <div className="pt-0.5">
          {pinned.map((p) => (
            <div key={p.id} className="relative">
              <button
                type="button"
                onClick={() => onOpenPinned?.(p.id)}
                onContextMenu={(e) => {
                  if (!onUnpin) return;
                  e.preventDefault();
                  setMenuFor(p.id);
                }}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] text-ink-2 hover:bg-surface-soft hover:text-ink"
              >
                <Icons.PinIcon size={13} className="shrink-0 text-ink-faint" />
                <span className="truncate">{p.label}</span>
              </button>
              {menuFor === p.id && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} onContextMenu={(e) => { e.preventDefault(); setMenuFor(null); }} />
                  <div className="absolute left-2 top-full z-30 mt-0.5 w-36 rounded-lg border border-hairline bg-surface p-1 shadow-elevated">
                    <button
                      type="button"
                      onClick={() => {
                        onUnpin?.(p.id);
                        setMenuFor(null);
                      }}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-surface-soft hover:text-ink"
                    >
                      <Icons.PinIcon size={13} className="shrink-0 text-ink-faint" />
                      <span>고정 해제</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
