import { Card } from "../primitives/Card";
import { IconButton } from "../primitives/IconButton";
import { PlusIcon } from "../icons";
import { cn } from "../lib/cn";

// 홈 그리드 지식공간 카드 (DESIGN-notion.md). 따뜻한 캔버스 위 흰 카드.
//  - 상단: 제목 + 선택적 설명(2줄 클램프)
//  - 하단: 문서 수 + 원형 추가 버튼(이벤트 버블링 차단)

export interface SubjectCardProps {
  title: string;
  description?: string;
  documentCount?: number;
  selected?: boolean;
  onClick?: () => void;
  onAdd?: () => void;
  className?: string;
}

export function SubjectCard({
  title,
  description,
  documentCount,
  selected,
  onClick,
  onAdd,
  className,
}: SubjectCardProps) {
  return (
    <Card
      interactive
      selected={selected}
      onClick={onClick}
      padding="md"
      className={cn("flex h-32 flex-col justify-between", className)}
    >
      <div>
        <h3 className="text-[16px] font-semibold leading-snug text-ink">{title}</h3>
        {description && (
          <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-ink-muted">{description}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-faint">{documentCount ?? 0} Documents</span>
        <IconButton
          size="sm"
          circular
          aria-label="문서 추가"
          onClick={(e) => {
            e.stopPropagation();
            onAdd?.();
          }}
        >
          <PlusIcon size={14} />
        </IconButton>
      </div>
    </Card>
  );
}
