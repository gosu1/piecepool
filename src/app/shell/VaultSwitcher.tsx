import { Icons } from "../../ds";
import type { KnowledgeSpace } from "../../lib/types";

// ══ Vault(=KnowledgeSpace) 스위처 — TopBar 좌측 공간 선택 ══
export function VaultSwitcher({ spaces, currentSpace, onSpace }: { spaces: KnowledgeSpace[]; currentSpace: string; onSpace: (slug: string) => void }) {
  return (
    <div className="relative">
      <select
        value={currentSpace}
        onChange={(e) => onSpace(e.target.value)}
        aria-label="Vault 선택"
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
  );
}
