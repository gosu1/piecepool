import { cn } from "../lib/cn";

// 구분선(헤어라인). 수평/수직.
export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Divider({ orientation = "horizontal", className }: DividerProps) {
  return (
    <span
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "block bg-hairline",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}
