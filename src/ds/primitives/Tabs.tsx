import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// 밑줄형 탭. active 인디케이터는 단 하나의 액센트(Notion 블루). 위키 ↔ 그래프 토글 등.
export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  size?: "sm" | "md";
}

export function Tabs({ items, value, defaultValue, onValueChange, className, size = "md" }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.value);
  const active = value ?? internal;

  const select = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <div role="tablist" className={cn("flex items-center gap-1 border-b border-hairline", className)}>
      {items.map((item) => {
        const isActive = item.value === active;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(item.value)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 font-medium transition-colors duration-150",
              size === "sm" ? "px-2.5 py-1.5 text-[14px]" : "px-3 py-2 text-[15px]",
              isActive ? "border-primary text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
