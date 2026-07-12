import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

// 카드/패널 (디자인 레퍼런스). 흰 표면 + 헤어라인이 기본, 그림자는 거의 없음.
//  - elevation "flat"     : 헤어라인만(기본). feature-card.
//  - elevation "soft"     : 미세 다층 그림자(shadow-soft). feature-card-elevated / 떠 있는 패널.
//  - featured             : surface-soft(따뜻한 오프화이트) 채움으로 추천 항목을 띄움. pricing-featured.
//  - selected / interactive : 선택/클릭 상태.

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: "flat" | "soft";
  featured?: boolean;
  interactive?: boolean;
  selected?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const PADDING = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };

export function Card({
  elevation = "flat",
  featured = false,
  interactive = false,
  selected = false,
  padding = "lg",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-hairline text-ink",
        featured ? "bg-surface-soft" : "bg-surface",
        elevation === "soft" && "shadow-soft",
        selected && "border-ink",
        interactive && "cursor-pointer transition-colors duration-150 hover:bg-surface-soft",
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
