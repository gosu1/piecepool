import { useState } from "react";
import { cn, Icons } from "../../ds";
import type { KnowledgeSpace } from "../../lib/types";

// ══ Vault(=KnowledgeSpace) 스위처 — 사이드바 하단 볼트바(Obsidian 위치). ══
// 네이티브 <select> 대신 커스텀 드롭업: 팝업 배경이 테마 토큰(bg-surface)을 따라 반전되고
// (라이트=흰색, 다크=검정) 모서리도 둥글게. 조용한 크롬.
export function VaultSwitcher({ spaces, currentSpace, onSpace }: { spaces: KnowledgeSpace[]; currentSpace: string; onSpace: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = spaces.find((s) => s.slug === currentSpace);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Vault 선택"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-lg py-1.5 pl-2 pr-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-fill-subtle hover:text-ink",
          open && "bg-fill-subtle text-ink",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{current?.name ?? "Vault 선택"}</span>
        <Icons.ChevronsUpDownIcon size={12} className="shrink-0 text-ink-faint" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute bottom-full left-0 z-30 mb-1.5 max-h-72 w-full min-w-44 overflow-y-auto rounded-xl border border-hairline bg-surface p-1 shadow-elevated">
            {spaces.map((s) => {
              const active = s.slug === currentSpace;
              return (
                <button
                  key={s.slug}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSpace(s.slug);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
                    active ? "bg-fill-subtle font-medium text-ink" : "text-ink-2 hover:bg-surface-soft hover:text-ink",
                  )}
                >
                  <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
