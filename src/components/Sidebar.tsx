import {
  Bell,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  HardDrive,
  FolderKanban,
  Inbox,
  LogIn,
  LogOut,
  MessageCircle,
  Monitor,
  Network,
  Search,
  Settings,
  Sparkles
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { SyncUser, ThemeMode, ViewKey } from "../types";

const navItems: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: "workspace", label: "Workspace", icon: HardDrive },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "plan", label: "Today", icon: CalendarCheck },
  { key: "search", label: "Search", icon: Search },
  { key: "wiki", label: "Wiki", icon: BookOpen },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "graph", label: "Graph", icon: Network },
  { key: "reminder", label: "Reminder", icon: Bell }
];

const mobileItems = navItems.filter((item) => ["workspace", "inbox", "plan", "search"].includes(item.key));

type SidebarProps = {
  activeView: ViewKey;
  workspaceName: string;
  syncUser: SyncUser | null;
  themeMode: ThemeMode;
  onChangeView: (view: ViewKey) => void;
  onSelectWorkspace: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onThemeChange: (mode: ThemeMode) => void;
};

type MenuItemProps = {
  icon: LucideIcon;
  label: string;
  trailing?: string;
  onClick: () => void;
};

function MenuItem({ icon: Icon, label, trailing, onClick }: MenuItemProps) {
  return (
    <button
      className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left text-[15px] font-bold text-slate-100 transition hover:bg-white/10"
      type="button"
      onClick={onClick}
    >
      <Icon size={20} className="text-slate-100" />
      <span className="min-w-0 flex-1">{label}</span>
      {trailing ? <span className="text-xs font-black text-slate-500">{trailing}</span> : null}
      {label === "테마" ? <ChevronRight size={18} className="text-slate-300" /> : null}
    </button>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function AccountMenu({
  syncUser,
  themeMode,
  onLogin,
  onLogout,
  onThemeChange,
  onClose
}: {
  syncUser: SyncUser | null;
  themeMode: ThemeMode;
  onLogin: () => void;
  onLogout: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  onClose: () => void;
}) {
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [notice, setNotice] = useState("");

  const themeLabel = {
    light: "라이트",
    dark: "다크",
    system: "시스템"
  }[themeMode];

  const selectTheme = (mode: ThemeMode) => {
    onThemeChange(mode);
    setNotice(`${mode === "dark" ? "다크" : mode === "light" ? "라이트" : "시스템"} 모드를 적용했습니다.`);
  };

  const handleLogin = () => {
    onLogin();
    onClose();
  };

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  return (
    <div className="absolute left-0 top-14 z-[70] w-[292px] overflow-hidden rounded-2xl border border-white/10 bg-[#1e1e1f] p-2 text-white shadow-2xl">
      <div className="space-y-1">
        <MenuItem icon={Settings} label="설정" onClick={() => setNotice("설정 화면은 Sync Account 단계에서 연결됩니다.")} />
        <MenuItem icon={MessageCircle} label="개선 요청" onClick={() => setNotice("개선 요청은 이후 피드백 수집 기능으로 연결됩니다.")} />
        <div className="my-1 border-t border-white/10" />
        <MenuItem icon={Monitor} label="테마" trailing={themeLabel} onClick={() => setThemeExpanded((current) => !current)} />
        {themeExpanded ? (
          <div className="mx-2 grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1">
            {[
              { mode: "light" as const, label: "라이트" },
              { mode: "dark" as const, label: "다크" },
              { mode: "system" as const, label: "시스템" }
            ].map((item) => (
              <button
                key={item.mode}
                className={`rounded-lg px-2 py-2 text-xs font-black transition ${
                  themeMode === item.mode ? "bg-[#f8fafc] text-[#172033]" : "text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
                type="button"
                onClick={() => selectTheme(item.mode)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="my-1 border-t border-white/10" />
        {syncUser ? (
          <MenuItem icon={LogOut} label="로그아웃" onClick={handleLogout} />
        ) : (
          <MenuItem icon={LogIn} label="로그인" onClick={handleLogin} />
        )}
      </div>

      {notice ? <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs leading-5 text-slate-400">{notice}</p> : null}

      {syncUser ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f8fafc] text-sm font-black text-[#172033]">
            {getInitials(syncUser.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">{syncUser.name}</p>
            <p className="truncate text-xs font-semibold text-slate-500">{syncUser.email}</p>
          </div>
          <Settings size={17} className="shrink-0 text-slate-500" />
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({
  activeView,
  workspaceName,
  syncUser,
  themeMode,
  onChangeView,
  onSelectWorkspace,
  onLogin,
  onLogout,
  onThemeChange
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, []);

  return (
    <>
      <aside className="hidden h-screen w-72 shrink-0 flex-col border-r border-line bg-white/90 px-4 py-5 backdrop-blur md:flex">
        <div className="relative" ref={menuRef}>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-100"
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {syncUser ? (
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-sm font-black text-white shadow-card">
                {getInitials(syncUser.name)}
              </div>
            ) : (
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-white shadow-card">
                <Sparkles size={20} />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-ink">{syncUser ? syncUser.name : "PiecePool"}</p>
              <p className="truncate text-xs font-semibold text-slate-500">{syncUser ? syncUser.email : workspaceName}</p>
            </div>
          </button>

          {menuOpen ? (
            <AccountMenu
              syncUser={syncUser}
              themeMode={themeMode}
              onLogin={onLogin}
              onLogout={onLogout}
              onThemeChange={onThemeChange}
              onClose={() => setMenuOpen(false)}
            />
          ) : null}
        </div>

        <div className="mt-6 rounded-lg border border-line bg-mist p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Local Device</p>
          <p className="mt-2 text-sm font-black text-ink">Workspace Explorer</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">파일 API 없이도 현재 MVP는 로컬 저장 흐름을 기준으로 동작합니다.</p>
        </div>

        <nav className="mt-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeView;

            return (
              <button
                key={item.key}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                  active ? "bg-ink text-white shadow-card" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                }`}
                type="button"
                onClick={() => onChangeView(item.key)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-lg border border-line bg-mist p-4">
            <p className="text-sm font-black text-ink">Offline Ready</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              자료는 로컬 Workspace에 먼저 모이고, 동기화와 계정 기능은 나중에 선택 기능으로 붙습니다.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-3 shadow-card">
            <p className="text-sm font-black text-ink">Plan Options</p>
            <p className="mt-1 text-xs text-slate-500">로컬 AI와 클라우드 옵션은 Today/Plan에서 관리합니다.</p>
          </div>
          <button
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-card hover:bg-slate-50"
            type="button"
            onClick={onSelectWorkspace}
          >
            Open / Create Workspace
          </button>
        </div>
      </aside>

      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 gap-1 rounded-2xl border border-line bg-white/95 p-1 shadow-soft backdrop-blur md:hidden">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeView;

          return (
            <button
              key={item.key}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-black transition ${
                active ? "bg-ink text-white" : "text-slate-500"
              }`}
              type="button"
              onClick={() => onChangeView(item.key)}
            >
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
