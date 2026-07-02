import { useState } from "react";
import type { ReactNode } from "react";
import { Avatar, Icons, useTheme, cn } from "../../ds";

// ══ 사이드바 하단 계정 영역 ══
export function AccountFooter({ onSettings }: { onSettings: () => void }) {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const isDark = theme === "dark";
  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-lg border border-hairline bg-surface p-1 shadow-elevated">
            <MenuItem
              icon={<Icons.UserIcon size={16} />}
              label="계정설정"
              onClick={() => {
                setOpen(false);
                window.alert("계정설정은 후속 작업입니다 (로컬 단일 사용자).");
              }}
            />
            <MenuItem
              icon={<Icons.GearIcon size={16} />}
              label="설정"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
            />
            <MenuItem icon={isDark ? <Icons.SunIcon size={16} /> : <Icons.MoonIcon size={16} />} label="다크모드" right={isDark ? "켜짐" : "꺼짐"} onClick={toggle} />
            <div className="my-1 h-px bg-hairline" />
            <MenuItem icon={<Icons.LogoutIcon size={16} />} label="로그아웃" onClick={() => setOpen(false)} />
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-soft", open && "bg-surface-soft")}
      >
        <Avatar name="Admin" size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">Admin</span>
          <span className="block truncate text-[12px] text-ink-muted">로컬 워크스페이스</span>
        </span>
        <Icons.ChevronRightIcon size={14} className={cn("shrink-0 text-ink-faint transition-transform", open && "-rotate-90")} />
      </button>
    </div>
  );
}

function MenuItem({ icon, label, right, onClick }: { icon: ReactNode; label: string; right?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
    >
      <span className="shrink-0 text-ink-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {right && <span className="text-[12px] text-ink-faint">{right}</span>}
    </button>
  );
}
