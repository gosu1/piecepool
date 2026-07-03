import { cn, Icons, IconButton } from "../../ds";
import { Breadcrumb } from "./Breadcrumb";

// ══ 페인 헤더 — 뒤로/앞으로 + 위치 경로 + "…" 탭 메뉴. full-bleed 본문의 형제로 렌더된다. ══
export function PaneHeader({
  crumbs,
  canBack,
  canForward,
  onBack,
  onForward,
  onMenu,
}: {
  crumbs: string[];
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  /** "…" 클릭 — 화면 좌표 전달(ContextMenu 앵커). 미지정 시 버튼 숨김. */
  onMenu?: (x: number, y: number) => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-hairline px-2">
      <IconButton size="sm" aria-label="뒤로" disabled={!canBack} onClick={onBack}>
        <Icons.ChevronLeftIcon size={16} className={cn(canBack ? "text-ink-muted" : "text-ink-faint")} />
      </IconButton>
      <IconButton size="sm" aria-label="앞으로" disabled={!canForward} onClick={onForward}>
        <Icons.ChevronRightIcon size={16} className={cn(canForward ? "text-ink-muted" : "text-ink-faint")} />
      </IconButton>

      <div className="flex min-w-0 flex-1 justify-center">
        <Breadcrumb crumbs={crumbs} />
      </div>

      {onMenu ? (
        <IconButton
          size="sm"
          aria-label="더 보기"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.right, r.bottom + 4);
          }}
        >
          <Icons.MoreHorizontalIcon size={16} className="text-ink-muted" />
        </IconButton>
      ) : (
        // 좌측 네비 버튼과 균형 맞춤용 자리(브레드크럼 중앙 유지)
        <span className="w-14" />
      )}
    </div>
  );
}
