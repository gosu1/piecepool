import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

// 정사각/원형 아이콘 버튼(툴바·탑바). 기본 ghost, hover surface-soft. aria-label 필수.
//  - circular : button-icon-circular — 반투명 채움 + 완전 원형.

export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  active?: boolean;
  circular?: boolean;
  children: ReactNode;
}

const SIZES: Record<IconButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-10 w-10",
};

export function IconButton({
  size = "md",
  active = false,
  circular = false,
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center text-ink-muted transition-colors duration-150",
        circular ? "rounded-full bg-fill-subtle" : "rounded-md",
        "hover:bg-surface-soft hover:text-ink active:scale-95",
        "outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:pointer-events-none disabled:opacity-50",
        active && "bg-surface-soft text-ink",
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
