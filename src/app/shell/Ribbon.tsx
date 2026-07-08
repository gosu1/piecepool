import type { ReactNode } from "react";
import { cn, Icons } from "../../ds";

// ══ 좌측 리본 (Obsidian식 세로 아이콘 네비) — 홈 · 그래프 · 설정 ══
// 파일트리 토글(미닫이)·검색은 상단 타이틀바가 담당(중복 제거).
// Wiki/Source 는 파일 트리로 접근(리본에서 제거). 활성 표시는 현재 탭 kind 기준.
export function Ribbon({
  activeKind,
  onHome,
  onGraph,
  onSettings,
}: {
  activeKind?: string;
  onHome: () => void;
  onGraph: () => void;
  onSettings: () => void;
}) {
  return (
    <nav className="flex w-[56px] shrink-0 flex-col items-center gap-1.5 border-r border-hairline bg-chrome pt-1 pb-3">
      {/* Study Home */}
      <RibbonButton label="Study Home" active={activeKind === "home"} onClick={onHome}>
        <Icons.HomeIcon size={21} />
      </RibbonButton>

      <Divider />

      {/* 그래프 (새 노트는 사이드바 헤더 연필 아이콘이 담당 → 중복 "+" 제거) */}
      <RibbonButton label="Graph" active={activeKind === "graph"} onClick={onGraph}>
        <Icons.GraphIcon size={21} />
      </RibbonButton>

      <div className="flex-1" />

      {/* 하단: 설정 */}
      <RibbonButton label="설정" onClick={onSettings}>
        <Icons.GearIcon size={21} />
      </RibbonButton>
    </nav>
  );
}

function Divider() {
  // 자체 여백 없이 부모 gap(1.5)만 사용 → 홈·검색·그래프 세로 간격 균일
  return <div className="h-px w-7 bg-hairline" />;
}

function RibbonButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
        // Obsidian quiet chrome — 활성도 모노크롬(액센트 없음)
        active ? "bg-fill-subtle text-ink" : "text-ink-muted hover:bg-fill-subtle hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
