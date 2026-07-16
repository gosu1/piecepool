import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

// 버튼 (디자인 레퍼런스). 액센트는 프라이머리 블루 하나, 모양 대비(알약 vs 8px)가 의도.
//  - primary   : 프라이머리 블루 채움 + 흰 글자, 완전 알약(rounded-full). 마케팅/주요 CTA. (button-primary)
//  - solid     : ink 채움 + 흰 글자, rounded-md. 앱 내 주요 동작(Sign In · 파일 선택). 다크 아일랜드.
//  - secondary : 흰 표면 + ink, 알약 + 부드러운 그림자. (button-secondary)
//  - utility   : 흰 표면 + ink, rounded-md + 헤어라인. nav/플랜 선택. (button-utility)
//  - ghost     : 배경 없음, hover surface-soft.
//  - link      : 블루 텍스트 링크.

export type ButtonVariant = "primary" | "solid" | "secondary" | "utility" | "ghost" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-primary text-on-primary hover:bg-primary-active active:scale-95",
  solid: "rounded-md bg-fill text-on-fill hover:opacity-90 active:opacity-80",
  secondary: "rounded-full bg-surface text-ink border border-hairline shadow-soft hover:bg-surface-soft",
  utility: "rounded-md bg-surface text-ink border border-hairline hover:bg-surface-soft",
  ghost: "rounded-md bg-transparent text-ink hover:bg-surface-soft",
  link: "bg-transparent text-primary underline-offset-2 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-[14px] gap-1.5",
  md: "h-10 px-5 text-[15px] gap-2",
  lg: "h-12 px-6 text-[16px] gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  leftIcon,
  rightIcon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const sized = variant !== "link";
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium transition-[transform,opacity,background-color,color] duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        sized && SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
