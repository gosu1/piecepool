import { useState } from "react";
import { cn, Icons, IconButton } from "../../ds";
import { macOverlayChrome } from "../../lib/platform";
import { TabStrip, TabIcon } from "./TabStrip";
import type { WorkspaceTab } from "../../store/workspaceStore";

// ══ 타이틀바 행 (Obsidian식 최상단 크롬) — 신호등 인셋 + 퀵 액션 + 탭 + 탭 목록 ══
// 드래그 영역은 정확히 3곳(bare data-tauri-drag-region): 헤더 루트 · 인셋 스페이서 · TabStrip 루트.
// 탭(role=tab)·버튼은 Tauri drag.js 가 자동 차단하므로 클릭/리오더와 충돌하지 않는다.
export function TitlebarRow({
  tabs,
  activeId,
  onSelect,
  onClose,
  onReorder,
  onNewTab,
  onToggleFiles,
  filesOpen,
  onSearch,
}: {
  tabs: WorkspaceTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (dragId: string, targetId: string) => void;
  onNewTab: () => void;
  onToggleFiles: () => void;
  filesOpen: boolean;
  onSearch: () => void;
}) {
  const [listOpen, setListOpen] = useState(false);
  return (
    <header
      data-tauri-drag-region=""
      className="flex h-10 shrink-0 items-center gap-1 border-b border-hairline bg-chrome px-2"
    >
      {/* macOS 신호등 자리 — overlay 모드에서만 */}
      {macOverlayChrome && <div data-tauri-drag-region="" className="w-[68px] shrink-0 self-stretch" />}

      {/* 퀵 액션 */}
      <IconButton size="sm" aria-label={filesOpen ? "파일 트리 접기" : "파일 트리 펼치기"} onClick={onToggleFiles}>
        <Icons.PanelLeftIcon size={16} className={cn(filesOpen ? "text-ink-muted" : "text-ink-faint")} />
      </IconButton>
      <IconButton size="sm" aria-label="검색 (⌘K)" onClick={onSearch}>
        <Icons.SearchIcon size={16} className="text-ink-muted" />
      </IconButton>

      {/* 탭 스트립 + 새 탭 */}
      <TabStrip tabs={tabs} activeId={activeId} onSelect={onSelect} onClose={onClose} onReorder={onReorder} />
      <IconButton size="sm" aria-label="새 탭" onClick={onNewTab}>
        <Icons.PlusIcon size={16} className="text-ink-muted" />
      </IconButton>

      <div data-tauri-drag-region="" className="min-w-2 flex-1 self-stretch" />

      {/* 열린 탭 목록 */}
      <div className="relative">
        {listOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setListOpen(false)} />
            <div className="absolute right-0 top-full z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-hairline bg-surface p-1 shadow-elevated">
              {tabs.length === 0 && <p className="px-2.5 py-2 text-[13px] text-ink-faint">열린 탭이 없어요</p>}
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelect(t.id);
                    setListOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-soft",
                    t.id === activeId ? "text-ink" : "text-ink-muted",
                  )}
                >
                  <span className="shrink-0 text-ink-faint">
                    <TabIcon kind={t.kind} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" />}
                </button>
              ))}
            </div>
          </>
        )}
        <IconButton size="sm" aria-label="탭 목록" onClick={() => setListOpen((o) => !o)}>
          <Icons.ChevronDownIcon size={14} className="text-ink-muted" />
        </IconButton>
      </div>

      {/* 우측 사이드바 토글 — rightRail 미배선(이연), 시각 패리티용 */}
      <IconButton size="sm" aria-label="우측 사이드바 (준비 중)" disabled>
        <Icons.PanelRightIcon size={16} className="text-ink-faint" />
      </IconButton>
    </header>
  );
}
