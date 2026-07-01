import type { ReactNode } from "react";
import { SearchInput } from "../primitives/SearchInput";
import { IconButton } from "../primitives/IconButton";
import { Avatar } from "../primitives/Avatar";
import { Divider } from "../primitives/Divider";
import { ThemeToggle } from "../theme/ThemeToggle";
import { BellIcon, GearIcon } from "../icons";
import { cn } from "../lib/cn";

// 모든 화면 상단에 깔리는 글로벌 앱 바. 좌측 검색, 우측 액션 클러스터.
export interface TopBarProps {
  user?: { name?: string; avatarUrl?: string };
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onBell?: () => void;
  onSettings?: () => void;
  actions?: ReactNode;
  /** false 면 알림·설정·테마·사용자 클러스터를 숨긴다(사이드바 하단으로 옮긴 경우). */
  showActions?: boolean;
  /** 좌측 검색 영역을 대체한다(예: ⌘K 검색 트리거 버튼). */
  searchSlot?: ReactNode;
  className?: string;
}

export function TopBar({
  user,
  searchValue,
  onSearchChange,
  onBell,
  onSettings,
  actions,
  showActions = true,
  searchSlot,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "flex h-12 items-center gap-3 border-b border-hairline bg-surface px-4",
        className,
      )}
    >
      {/* 좌측: 검색 (searchSlot 으로 대체 가능) */}
      {searchSlot ?? (
        <SearchInput
          containerClassName="w-72"
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
        />
      )}

      {/* 가운데 스페이서 — 우측 클러스터를 오른쪽 끝으로 민다 */}
      <div className="flex-1" />

      {/* 우측: 알림 · 설정 · 테마 · 사용자 (showActions=false 면 사이드바 하단으로 이동) */}
      {showActions ? (
        <div className="flex items-center gap-1">
          <IconButton aria-label="알림" onClick={onBell}>
            <BellIcon size={18} />
          </IconButton>
          <IconButton aria-label="설정" onClick={onSettings}>
            <GearIcon size={18} />
          </IconButton>
          <ThemeToggle />
          {actions}
          <Divider orientation="vertical" className="mx-1 h-5" />
          <span className="text-[15px] text-ink-muted">{user?.name ?? "User"}</span>
          <Avatar name={user?.name} src={user?.avatarUrl} size={28} />
        </div>
      ) : (
        actions
      )}
    </header>
  );
}
