import { Icons } from "../../ds";
import type { KnowledgeSpace } from "../../lib/types";

// ══ Vault(=KnowledgeSpace) 스위처 — 사이드바 하단 볼트바(Obsidian 위치). 조용한 크롬. ══
export function VaultSwitcher({ spaces, currentSpace, onSpace }: { spaces: KnowledgeSpace[]; currentSpace: string; onSpace: (slug: string) => void }) {
  return (
    <div className="relative">
      <select
        value={currentSpace}
        onChange={(e) => onSpace(e.target.value)}
        aria-label="Vault 선택"
        className="w-full appearance-none rounded-md bg-transparent py-1 pl-1.5 pr-6 text-[13px] font-medium text-ink-muted outline-none transition-colors hover:bg-fill-subtle hover:text-ink"
      >
        {spaces.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
      </select>
      <Icons.ChevronsUpDownIcon size={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-faint" />
    </div>
  );
}
