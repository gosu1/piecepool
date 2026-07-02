import { Icons } from "../../ds";

// ══ TopBar 위치 경로 (PiecePool ▸ 공간 ▸ 섹션 ▸ 문서) ══
export function Breadcrumb({ crumbs }: { crumbs: string[] }) {
  return (
    <nav className="flex min-w-0 items-center gap-1 text-[13px] text-ink-muted" aria-label="위치">
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <Icons.ChevronRightIcon size={12} className="shrink-0 text-ink-faint" />}
          <span className={i === crumbs.length - 1 ? "truncate font-medium text-ink-2" : "truncate"}>{c}</span>
        </span>
      ))}
    </nav>
  );
}
