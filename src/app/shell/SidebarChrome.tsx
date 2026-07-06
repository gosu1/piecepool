import { useState } from "react";
import { cn, Icons, IconButton } from "../../ds";
import type { KnowledgeSpace } from "../../lib/types";
import { VaultSwitcher } from "./VaultSwitcher";

// ══ 사이드바 크롬 (Obsidian식) — 헤더 액션 · 숏컷 행 · 하단 볼트바 ══
// Sidebar 의 headerSlot / shortcutsSlot / footer 슬롯에 꽂힌다. 트리(TreeNav)는 건드리지 않는다.

export function SidebarHeader({ title, onSearch, onNewNote }: { title: string; onSearch: () => void; onNewNote: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
      <span className="truncate text-[14px] font-medium text-ink-muted">{title}</span>
      <span className="flex shrink-0 items-center">
        <IconButton size="sm" aria-label="검색 (⌘K)" onClick={onSearch}>
          <Icons.SearchIcon size={17} />
        </IconButton>
        <IconButton size="sm" aria-label="새 노트 작성" onClick={onNewNote}>
          <Icons.EditIcon size={17} />
        </IconButton>
      </span>
    </div>
  );
}

export function SidebarShortcuts({
  onHome,
  onNewFolder,
  pinned = [],
  onOpenPinned,
}: {
  onHome: () => void;
  onNewFolder: () => void;
  /** 페이지 헤더 "고정하기"로 고정한 문서 — Notion 즐겨찾기 위치 */
  pinned?: { id: string; label: string }[];
  onOpenPinned?: (id: string) => void;
}) {
  return (
    <div className="border-b border-hairline px-2 pb-1.5">
      <div className="flex items-center gap-0.5">
        <IconButton size="sm" aria-label="Study Home" onClick={onHome}>
          <Icons.HomeIcon size={17} />
        </IconButton>
        {/* 새 폴더(지식 공간) 추가 — "새 노트"는 헤더 연필 아이콘이 담당하므로 중복 "+" 제거 */}
        <IconButton size="sm" aria-label="새 폴더 추가" onClick={onNewFolder}>
          <Icons.FolderPlusIcon size={17} />
        </IconButton>
      </div>
      {pinned.length > 0 && (
        <div className="pt-0.5">
          {pinned.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenPinned?.(p.id)}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] text-ink-2 hover:bg-surface-soft hover:text-ink"
            >
              <Icons.PinIcon size={13} className="shrink-0 text-ink-faint" />
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["⌘K", "검색"],
  ["⌘N", "새 파일 생성"],
  ["⌘O", "파일로 이동"],
  ["⌘Enter", "저장 / 임포트"],
];

export function SidebarFooter({
  spaces,
  currentSpace,
  onSpace,
}: {
  spaces: KnowledgeSpace[];
  currentSpace: string;
  onSpace: (slug: string) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      {/* 볼트(=KnowledgeSpace) 전환 — Obsidian 하단 볼트바 위치 */}
      <div className="min-w-0 flex-1">
        <VaultSwitcher spaces={spaces} currentSpace={currentSpace} onSpace={onSpace} />
      </div>

      <div className="relative shrink-0">
        {helpOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setHelpOpen(false)} />
            <div className="absolute bottom-full right-0 z-30 mb-2 w-52 rounded-lg border border-hairline bg-surface p-2 shadow-elevated">
              <p className="px-1 pb-1.5 text-[12px] font-medium text-ink-2">단축키</p>
              {SHORTCUTS.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between px-1 py-0.5 text-[12px]">
                  <span className="text-ink-muted">{label}</span>
                  <kbd className="rounded-sm bg-fill-subtle px-1.5 py-0.5 font-sans text-[11px] text-ink-2">{key}</kbd>
                </div>
              ))}
            </div>
          </>
        )}
        <IconButton size="sm" aria-label="도움말" onClick={() => setHelpOpen((o) => !o)} className={cn(helpOpen && "bg-surface-soft text-ink")}>
          <Icons.HelpCircleIcon size={17} />
        </IconButton>
      </div>
    </div>
  );
}
