import type { ReactNode } from "react";
import { cn } from "../../ds";

// ══ 마스터-디테일 좌측 리스트 항목 ══
export function ListItem({ icon, title, sub, active, onClick }: { icon: ReactNode; title: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors", active ? "bg-surface-soft" : "hover:bg-surface-soft")}
    >
      <span className="mt-0.5 shrink-0 text-ink-faint">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-ink">{title}</span>
        {sub && <span className="block truncate text-[12px] text-ink-faint">{sub}</span>}
      </span>
    </button>
  );
}
