import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// 라벨 + 인풋 래퍼. 우측 보조 액션(예: "Forgot?")을 라벨 줄 끝에 배치.
export interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  action?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, action, hint, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
          {label}
        </label>
        {action && <span className="text-[13px] text-ink-muted">{action}</span>}
      </div>
      {children}
      {hint && <p className="text-[13px] text-ink-muted">{hint}</p>}
    </div>
  );
}
