import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

// 이어브로우/카테고리 알약 (DESIGN-notion.md badge-pill).
//  - primary : 흰 표면 + 블루 글자(기본). 예) 카테고리/이어브로우 라벨.
//  - solid   : ink 채움 + 흰 글자. 강조 라벨(예: RECOMMENDED).
//  - neutral : 흰 표면 + muted 글자.
//  - sticker : 장식용 점/태그(스티커 팔레트) — 색은 style 로 직접.
// eyebrow=true 면 12px/600 + 약간의 자간.

export type BadgeVariant = "primary" | "solid" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  eyebrow?: boolean;
}

const VARIANTS: Record<BadgeVariant, string> = {
  primary: "bg-surface text-primary border border-hairline",
  solid: "bg-fill text-on-fill",
  neutral: "bg-surface text-ink-muted border border-hairline",
};

export function Badge({ variant = "primary", eyebrow = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold leading-tight",
        eyebrow && "tracking-[0.125px]",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
