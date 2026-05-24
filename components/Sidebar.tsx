 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, projects } from "@/lib/mockData";
import { UserProfile } from "@/components/UserProfile";
import { Plus, Sparkles } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full min-h-screen w-full flex-col border-r border-line bg-white/85 px-4 py-5 backdrop-blur xl:w-72">
      <div className="flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white shadow-card">
          <Sparkles size={19} />
        </div>
        <div>
          <p className="text-lg font-bold tracking-normal text-ink">PiecePool</p>
          <p className="text-xs font-medium text-slate-500">AI Study Hub</p>
        </div>
      </div>

      <nav className="mt-8 space-y-1">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-ink text-white shadow-card"
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink"
              }`}
              href={item.href}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between px-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Projects</p>
          <button
            className="grid h-7 w-7 place-items-center rounded-md border border-line text-slate-600 hover:bg-slate-100"
            type="button"
            aria-label="새 프로젝트"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="space-y-2">
          {projects.map((project) => (
            <button
              key={project.id}
              className="w-full rounded-lg border border-line bg-white p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
              type="button"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${project.accent}`} />
                <span className="text-sm font-bold text-ink">{project.name}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                조각 {project.sourceCount}개 · Wiki {project.wikiCount}개
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto rounded-lg border border-line bg-mist p-4">
        <p className="text-sm font-bold text-ink">AI가 정리한 흐름</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          흩어진 자료가 Inbox로 들어오면 과목, 개념, 오늘 할 일로 이어집니다.
        </p>
      </div>
      <UserProfile />
    </aside>
  );
}
