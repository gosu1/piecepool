import { useState } from "react";
import { cn, Icons, IconButton } from "../../ds";
import type { KnowledgeSpace } from "../../lib/types";
import { VaultSwitcher } from "./VaultSwitcher";

// ══ 사이드바 크롬 (Obsidian식) — 헤더 액션 · 숏컷 행 · 하단 볼트바 ══
// Sidebar 의 headerSlot / shortcutsSlot / footer 슬롯에 꽂힌다. 트리(TreeNav)는 건드리지 않는다.

export function SidebarHeader({ title, onSearch, onNewNote }: { title: string; onSearch: () => void; onNewNote: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
      <span className="truncate text-[13px] font-medium text-ink-muted">{title}</span>
      <span className="flex shrink-0 items-center">
        <IconButton size="sm" aria-label="검색 (⌘K)" onClick={onSearch}>
          <Icons.SearchIcon size={15} />
        </IconButton>
        <IconButton size="sm" aria-label="새 노트 작성" onClick={onNewNote}>
          <Icons.EditIcon size={15} />
        </IconButton>
      </span>
    </div>
  );
}

export function SidebarShortcuts({ onHome, onNew }: { onHome: () => void; onNew: () => void }) {
  return (
    <div className="flex items-center gap-0.5 border-b border-hairline px-2 pb-1.5">
      <IconButton size="sm" aria-label="Study Home" onClick={onHome}>
        <Icons.HomeIcon size={15} />
      </IconButton>
      {/* 리본의 "새 노트 (Inbox)" 와 라벨 중복 금지 — e2e strict mode */}
      <IconButton size="sm" aria-label="새 노트 추가" onClick={onNew}>
        <Icons.PlusIcon size={15} />
      </IconButton>
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
  onSettings,
}: {
  spaces: KnowledgeSpace[];
  currentSpace: string;
  onSpace: (slug: string) => void;
  onSettings: () => void;
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
          <Icons.HelpCircleIcon size={15} />
        </IconButton>
      </div>

      <IconButton size="sm" aria-label="설정" onClick={onSettings}>
        <Icons.GearIcon size={15} />
      </IconButton>
    </div>
  );
}
