import type { ReactNode } from "react";

type ShellProps = {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
};

export function Shell({ title, eyebrow, description, children, aside }: ShellProps) {
  return (
    <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
      <header className="border-b border-line bg-white/80 px-8 py-6 backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-pool">{eyebrow}</p>
        <h1 className="mt-2 max-w-4xl text-3xl font-black leading-tight text-ink">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </header>
      <div className="grid flex-1 gap-5 overflow-auto p-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <main>{children}</main>
        {aside ? <aside className="space-y-5">{aside}</aside> : null}
      </div>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-white p-5 shadow-card ${className}`}>{children}</section>;
}
