import { useState } from "react";
import { cn, Icons, IconButton } from "../../ds";
import { macOverlayChrome } from "../../lib/platform";
import { TabStrip, TabIcon } from "./TabStrip";
import type { WorkspaceTab } from "../../store/workspaceStore";

// ══ 타이틀바 행 (최상단 크롬) — 신호등 인셋 + 퀵 액션 + 탭 + 탭 컨트롤 + 탭 목록 ══
//
// right 슬롯 = 활성 탭이 제공하는 컨트롤(Inbox 의 PDF·위키 패널 토글). 패널을 열고 닫아도
// 이 자리는 움직이지 않는다 — 노트 패널 안에 두면 폭이 줄며 버튼이 딸려 움직여, 방금 누른
// 버튼이 도망가 다시 눌러 닫기가 어려웠다.
// 드래그 영역은 정확히 3곳(bare data-tauri-drag-region): 헤더 루트 · 인셋 스페이서 · TabStrip 루트.
// 탭(role=tab)·버튼은 Tauri drag.js 가 자동 차단하므로 클릭/리오더와 충돌하지 않는다.
// 좌측 리본 폭(Ribbon.tsx w-[56px]) — 탭 정렬 기준
const RIBBON_W = 56;

export function TitlebarRow({
  tabs,
  activeId,
  onSelect,
  onClose,
  onReorder,
  onNewTab,
  onToggleFiles,
  filesOpen,
  sidebarWidth,
  onSearch,
  right,
}: {
  tabs: WorkspaceTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (dragId: string, targetId: string) => void;
  onNewTab: () => void;
  onToggleFiles: () => void;
  filesOpen: boolean;
  sidebarWidth: number;
  onSearch: () => void;
  /** 활성 탭이 제공하는 컨트롤. 탭 종류마다 다르다(Inbox = 패널 토글). */
  right?: React.ReactNode;
}) {
  const [listOpen, setListOpen] = useState(false);
  // 좌측 퀵 액션 — 파일 트리 미닫이(자주 쓰는 기능이라 primary 컬러 강조·크게) + 검색
  // 미닫이 닫힘(사이드바 접힘) 시엔 좌측 존이 좁아지므로 검색은 숨긴다(⌘K로 여전히 열림).
  const leftActions = (
    <>
      <IconButton size="sm" aria-label={filesOpen ? "파일 트리 접기" : "파일 트리 펼치기"} onClick={onToggleFiles}>
        <Icons.PanelLeftIcon size={22} className={cn(filesOpen ? "text-primary" : "text-primary/60")} />
      </IconButton>
      {filesOpen && (
        <IconButton size="sm" aria-label="검색 (⌘K)" onClick={onSearch}>
          <Icons.SearchIcon size={19} className="text-ink-muted" />
        </IconButton>
      )}
    </>
  );
  return (
    <header
      data-tauri-drag-region=""
      className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline bg-chrome pr-2"
    >
      {/* 좌측 크롬 존 — 리본(56) + (열렸으면)사이드바 폭 확보 → 탭이 노트 콘텐츠 좌측 끝에서 시작.
          사이드바 열림/리사이즈 시 탭 정렬이 실시간으로 따라온다. */}
      {macOverlayChrome ? (
        <div className="flex shrink-0 items-center gap-1">
          {/* macOS 신호등 자리 — overlay 모드 */}
          <div data-tauri-drag-region="" className="w-[68px] shrink-0 self-stretch" />
          {leftActions}
        </div>
      ) : (
        <div
          data-tauri-drag-region=""
          className="flex shrink-0 items-center gap-1 self-stretch pl-2"
          style={{ width: RIBBON_W + (filesOpen ? sidebarWidth : 0) }}
        >
          {leftActions}
        </div>
      )}

      {/* 탭 스트립 + 새 탭 */}
      <TabStrip tabs={tabs} activeId={activeId} onSelect={onSelect} onClose={onClose} onReorder={onReorder} />
      <IconButton size="sm" aria-label="새 탭" onClick={onNewTab}>
        <Icons.PlusIcon size={18} className="text-ink-muted" />
      </IconButton>

      {/* 탭 뒤 여백 — 우측 컨트롤을 오른쪽으로 민다(창 드래그 영역) */}
      <div data-tauri-drag-region="" className="min-w-2 flex-1 self-stretch" />

      {/* 활성 탭이 제공하는 컨트롤 (Inbox = PDF·위키 패널 토글).
          여기 두는 이유: 패널을 열어도 이 자리는 움직이지 않는다 — 방금 누른 버튼이 도망가지 않는다. */}
      {right}
      {right && <span className="mx-0.5 h-4 w-px shrink-0 bg-hairline" />}

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
          <Icons.ChevronDownIcon size={16} className="text-ink-muted" />
        </IconButton>
      </div>
    </header>
  );
}
