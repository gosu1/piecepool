export function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "pool" | "amber" | "green" | "red" }) {
  const styles = {
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    pool: "bg-pool/10 text-pool ring-pool/20",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    red: "bg-red-50 text-red-700 ring-red-200"
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles[tone]}`}>{children}</span>;
}
