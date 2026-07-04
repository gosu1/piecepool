import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn, Icons } from "../../ds";
import type { SearchItem } from "../types";

// ══ ⌘K 검색 팔레트 ══
export function SearchPalette({ items, onPick, onClose }: { items: SearchItem[]; onPick: (it: SearchItem) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const query = q.trim().toLowerCase();
  const filtered = (
    query
      ? items.filter(
          (i) =>
            i.title.toLowerCase().includes(query) ||
            i.spaceName.toLowerCase().includes(query) ||
            i.body.toLowerCase().includes(query),
        )
      : items
  ).slice(0, 50);
  useEffect(() => setSel(0), [q]);

  // 본문 매치 스니펫 (매치 주변 ±30자)
  const snippet = (body: string): string | null => {
    if (!query) return null;
    const idx = body.toLowerCase().indexOf(query);
    if (idx < 0) return null;
    const start = Math.max(0, idx - 30);
    const raw = body.slice(start, idx + query.length + 30).replace(/\s+/g, " ").trim();
    return (start > 0 ? "…" : "") + raw + "…";
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[sel]) onPick(filtered[sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-hairline bg-surface shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-hairline px-4">
          <Icons.SearchIcon size={16} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="파일로 이동 (⌘O) — 제목·공간·본문 검색…"
            className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-hairline bg-surface-soft px-1.5 py-0.5 text-[11px] text-ink-muted">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-[14px] text-ink-muted">결과 없음</p>
          ) : (
            filtered.map((it, i) => (
              <button
                key={`${it.kind}:${it.space}:${it.file}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => onPick(it)}
                className={cn("flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors", i === sel ? "bg-surface-soft" : "")}
              >
                {it.kind === "wiki" ? (
                  <Icons.FileIcon size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                ) : (
                  <Icons.FileUpIcon size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">{it.title}</span>
                  {snippet(it.body) && <span className="block truncate text-[12px] text-ink-faint">{snippet(it.body)}</span>}
                </span>
                <span className="mt-0.5 shrink-0 text-[12px] text-ink-faint">
                  {it.spaceName} / {it.kind === "wiki" ? "wiki" : "source"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
