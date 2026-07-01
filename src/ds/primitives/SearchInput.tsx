import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { SearchIcon } from "../icons";

// 검색 인풋(돋보기 + 알약형). 탑바의 "검색..." 필드.
export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export function SearchInput({
  containerClassName,
  className,
  placeholder = "검색...",
  ...rest
}: SearchInputProps) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-3.5",
        "focus-within:shadow-soft focus-within:border-ink-faint transition-shadow duration-150",
        containerClassName,
      )}
    >
      <SearchIcon size={15} className="shrink-0 text-ink-faint" />
      <input
        type="search"
        placeholder={placeholder}
        className={cn(
          "w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint",
          className,
        )}
        {...rest}
      />
    </div>
  );
}
