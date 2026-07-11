import { useState, type ReactNode } from "react";
import { cn, Icons } from "../../ds";

const SHORTCUTS: [string, string][] = [
  ["⌘K", "검색"],
  ["⌘N", "새 파일 생성"],
  ["⌘O", "파일로 이동"],
  ["⌘Tab", "다음 탭"],
  ["⌘⇧Tab", "이전 탭"],
  ["⌘W", "탭 닫기"],
  ["⌘B", "굵게"],
  ["⌘I", "기울임"],
  ["⌘M", "퀵메모 열기 / 닫기"],
  ["⌘E", "퀵메모 정리"],
  ["⌘Enter", "저장 / 임포트"],
];

// ══ 좌측 리본 (Obsidian식 세로 아이콘 네비) — 홈 · 인박스 · 그래프 · 도움말 · 설정 ══
// 파일트리 토글(미닫이)·검색은 상단 타이틀바가 담당(중복 제거).
// Wiki/Source 는 파일 트리로 접근(리본에서 제거). 활성 표시는 현재 탭 kind 기준.
export function Ribbon({
  activeKind,
  onHome,
  onInbox,
  onGraph,
  onSettings,
}: {
  activeKind?: string;
  onHome: () => void;
  onInbox: () => void;
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

      {/* 인박스 — 현재 과목의 수집 화면(초안 유지). 새 노트는 사이드바 헤더 연필이 담당 */}
      <RibbonButton label="Inbox" active={activeKind === "inbox"} onClick={onInbox}>
        <Icons.InboxIcon size={21} />
      </RibbonButton>

      {/* 그래프 */}
      <RibbonButton label="Graph" active={activeKind === "graph"} onClick={onGraph}>
        <Icons.GraphIcon size={21} />
      </RibbonButton>

      <div className="flex-1" />

      {/* 하단: 도움말 → 설정. 사이드바를 접어도 남는 자리라 단축키 안내를 여기 둔다. */}
      <HelpButton />
      <RibbonButton label="설정" onClick={onSettings}>
        <Icons.GearIcon size={21} />
      </RibbonButton>
    </nav>
  );
}

// 단축키 안내 — 리본이 56px 로 좁아 팝오버는 오른쪽 위로 편다.
function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <RibbonButton label="도움말" active={open} onClick={() => setOpen((o) => !o)}>
        <Icons.HelpCircleIcon size={21} />
      </RibbonButton>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          {/* ml — 버튼(40px)이 56px 리본 안에 가운데 정렬돼 있어 리본 우측 경계 밖으로 밀어내야 한다 */}
          <div className="absolute bottom-0 left-full z-30 ml-3.5 w-56 rounded-lg border border-hairline bg-surface p-2 shadow-elevated">
            <p className="px-1 pb-1.5 text-[12px] font-medium text-ink-2">단축키</p>
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between px-1 py-0.5 text-[12px]">
                <span className="text-ink-muted">{label}</span>
                <kbd className="rounded-sm bg-fill-subtle px-1.5 py-0.5 font-sans text-[11px] text-ink-2">{key}</kbd>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
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
