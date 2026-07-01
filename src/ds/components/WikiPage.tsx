import type { ReactNode } from "react";
import { Card } from "../primitives/Card";
import { DownloadIcon, ShareIcon } from "../icons";
import { cn } from "../lib/cn";

// 위키 읽기 프레임 — 다크 잉크 헤더바 + 본문 prose
interface WikiPageProps {
  title?: string;
  headerLabel?: string;
  onSave?: () => void;
  onShare?: () => void;
  children?: ReactNode;
  className?: string;
}

export function WikiPage({
  title,
  headerLabel,
  onSave,
  onShare,
  children,
  className,
}: WikiPageProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* 큰 페이지 제목은 카드 위에 위치 */}
      {title && <h1 className="ds-h3 text-ink">{title}</h1>}
      <Card padding="none" className={cn("overflow-hidden", className)}>
        {/* 다크 잉크 섬 헤더바 + 윈도우 컨트롤 버튼 */}
        <div className="flex h-9 items-center justify-between bg-fill px-4 text-on-fill">
          <span className="text-[12px] font-semibold uppercase tracking-[1px]">
            {headerLabel ?? "WIKI PAGE"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="저장"
              onClick={onSave}
              className="rounded p-1 text-on-fill/80 hover:bg-white/10 hover:text-on-fill"
            >
              <DownloadIcon size={15} />
            </button>
            <button
              type="button"
              aria-label="공유"
              onClick={onShare}
              className="rounded p-1 text-on-fill/80 hover:bg-white/10 hover:text-on-fill"
            >
              <ShareIcon size={15} />
            </button>
          </div>
        </div>
        {/* 본문 prose */}
        <div className="space-y-4 p-6">{children}</div>
      </Card>
    </div>
  );
}

interface WikiHeadingProps {
  children: ReactNode;
  className?: string;
}

// 잉크(근사 블랙) 밑줄 강조 — 파란색 아님, 텍스트 너비만큼만 밑줄
export function WikiHeading({ children, className }: WikiHeadingProps) {
  return (
    <div>
      <h2
        className={cn(
          "inline-block border-b-2 border-ink pb-1 text-[19px] font-bold text-ink",
          className
        )}
      >
        {children}
      </h2>
    </div>
  );
}

interface WikiParagraphProps {
  children: ReactNode;
  className?: string;
}

export function WikiParagraph({ children, className }: WikiParagraphProps) {
  return (
    <p className={cn("text-[15px] leading-relaxed text-ink-2", className)}>
      {children}
    </p>
  );
}
