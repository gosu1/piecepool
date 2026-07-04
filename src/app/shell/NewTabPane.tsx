// ══ 새 탭 / 무탭 상태 (Obsidian식) — 중앙 액션 링크 3개 ══
export function NewTabPane({ onCreate, onSwitch, onClose }: { onCreate: () => void; onSwitch: () => void; onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <ActionLink label="새 파일 생성하기 (⌘N)" onClick={onCreate} />
      <ActionLink label="파일로 이동하기 (⌘O)" onClick={onSwitch} />
      {onClose && <ActionLink label="닫기" onClick={onClose} />}
    </div>
  );
}

function ActionLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[15px] text-primary transition-colors hover:text-primary-active hover:underline">
      {label}
    </button>
  );
}
