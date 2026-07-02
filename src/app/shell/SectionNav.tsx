import type { ReactNode } from "react";
import { cn, Icons } from "../../ds";
import type { KnowledgeSpace } from "../../lib/types";
import type { Section } from "../types";

// ══ 상단 섹션 네비 ══
export function SectionNav({
  spaces,
  currentSpace,
  onSpace,
  section,
  onSection,
}: {
  spaces: KnowledgeSpace[];
  currentSpace: string;
  onSpace: (slug: string) => void;
  section: Section;
  onSection: (s: Section) => void;
}) {
  const items: { id: Section; label: string; icon: ReactNode }[] = [
    { id: "inbox", label: "Inbox", icon: <Icons.FileUpIcon size={15} /> },
    { id: "wiki", label: "Wiki", icon: <Icons.FileIcon size={15} /> },
    { id: "source", label: "Source", icon: <Icons.FolderIcon size={15} /> },
    { id: "graph", label: "Graph", icon: <Icons.GraphIcon size={15} /> },
  ];
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <select
          value={currentSpace}
          onChange={(e) => onSpace(e.target.value)}
          className="appearance-none rounded-md border border-hairline bg-surface py-1.5 pl-3 pr-8 text-[14px] font-medium text-ink outline-none hover:bg-surface-soft"
        >
          {spaces.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <Icons.ChevronDownIcon size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint" />
      </div>
      <div className="flex items-center gap-0.5 rounded-lg bg-surface-soft p-0.5">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onSection(it.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors",
              section === it.id ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
