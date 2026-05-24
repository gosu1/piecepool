import type { ReactNode } from "react";

type ShellProps = {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
  workspaceName: string;
  localStatus: string;
};

export function Shell({ title, eyebrow, description, children, aside, workspaceName, localStatus }: ShellProps) {
  const contentGrid = aside ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : "grid-cols-1";

  return (
    <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
      <header className="border-b border-line bg-white/90 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-pool">{eyebrow}</p>
              <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-bold text-slate-600">Workspace: {workspaceName}</span>
            </div>
            <h1 className="mt-1 truncate text-xl font-black leading-tight text-ink md:text-2xl">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
              Local-first
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 ring-1 ring-slate-200">
              {localStatus}
            </span>
          </div>
        </div>
      </header>
      <div className={`grid flex-1 gap-5 overflow-auto p-4 pb-24 md:p-6 ${contentGrid}`}>
        <main>{children}</main>
        {aside ? <aside className="hidden space-y-5 xl:block">{aside}</aside> : null}
      </div>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-white p-5 shadow-card ${className}`}>{children}</section>;
}
