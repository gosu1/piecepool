import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

// 텍스트 인풋 (디자인 레퍼런스 text-input). 흰 표면 + 옅은 테두리 + 타이트한 rounded-xs(4px).
// 폼 필드는 의도적으로 알약이 아니라 각진 모서리. 포커스 시 부드러운 그림자.
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid = false, className, ...rest }: InputProps) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-xs border bg-surface px-2.5 text-[15px] text-ink",
        "placeholder:text-ink-faint outline-none transition-shadow duration-150",
        "focus-visible:shadow-soft focus-visible:border-ink-faint",
        invalid ? "border-ink" : "border-hairline",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
