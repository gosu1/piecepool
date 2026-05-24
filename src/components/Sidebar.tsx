import {
  Bell,
  BookOpen,
  CalendarCheck,
  FolderKanban,
  Inbox,
  Network,
  Settings2,
  Sparkles
} from "lucide-react";
import type { ViewKey } from "../types";

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Inbox }> = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "wiki", label: "Wiki", icon: BookOpen },
  { key: "plan", label: "Plan", icon: CalendarCheck },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "graph", label: "Graph", icon: Network },
  { key: "reminder", label: "Reminder", icon: Bell },
  { key: "ai-engine", label: "AI Engine", icon: Settings2 }
];

type SidebarProps = {
  activeView: ViewKey;
  onChangeView: (view: ViewKey) => void;
};

export function Sidebar({ activeView, onChangeView }: SidebarProps) {
  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-line bg-white/90 px-4 py-5 backdrop-blur">
      <div className="flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white shadow-card">
          <Sparkles size={19} />
        </div>
        <div>
          <p className="text-lg font-black text-ink">PiecePool</p>
          <p className="text-xs font-semibold text-slate-500">Local Study Workspace</p>
        </div>
      </div>

      <nav className="mt-8 space-y-1">
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
          <p className="text-sm font-black text-ink">Local-first</p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            기본 AI 엔진은 로컬에서 실행됩니다. 클라우드 모델은 Pro 플랜 옵션으로 준비됩니다.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-3 shadow-card">
          <p className="text-sm font-black text-ink">Free Plan</p>
          <p className="mt-1 text-xs text-slate-500">Local LLM enabled</p>
        </div>
      </div>
    </aside>
  );
}
