import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, cn } from "../../ds";

// ══ 셸 공용 오버레이 — 컨텍스트 메뉴 · 확인 · 이름 입력 ══

export interface MenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

// 우클릭 컨텍스트 메뉴. 화면 밖으로 나가지 않게 뷰포트에 맞춰 클램프.
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 180);
  const top = Math.min(y, window.innerHeight - items.length * 36 - 16);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div style={{ left, top }} className="fixed z-50 w-44 rounded-lg border border-hairline bg-surface p-1 shadow-elevated">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className={cn(
              "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[14px] transition-colors hover:bg-surface-soft",
              it.danger ? "text-danger" : "text-ink-2 hover:text-ink",
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[20vh]" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface p-4 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "확인",
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {message && <p className="mt-1 text-[13px] text-ink-muted">{message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="utility" onClick={onCancel}>
          취소
        </Button>
        <Button size="sm" variant="solid" onClick={onConfirm} className={danger ? "!bg-danger" : undefined}>
          {confirmLabel}
        </Button>
      </div>
    </Overlay>
  );
}

export function PromptDialog({
  title,
  initial = "",
  placeholder,
  submitLabel = "저장",
  quickSubmit,
  validate,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial?: string;
  placeholder?: string;
  submitLabel?: string;
  /** 입력 없이 원클릭 제출 — 버튼 문구가 그대로 값이 된다 */
  quickSubmit?: string;
  /** 값 검증 — 에러 메시지를 돌려주면 인라인 표시 + 저장 차단 */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const invalid = validate ? validate(value.trim()) : null;
  const submit = () => value.trim() && !invalid && onSubmit(value.trim());
  return (
    <Overlay onClose={onCancel}>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="mt-3 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-[14px] text-ink outline-none focus-visible:shadow-soft"
      />
      {invalid && <p className="mt-1.5 text-[12px] text-danger">{invalid}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="utility" onClick={onCancel}>
          취소
        </Button>
        {quickSubmit && (
          <Button size="sm" variant="utility" className="whitespace-nowrap" onClick={() => onSubmit(quickSubmit)}>
            {quickSubmit}
          </Button>
        )}
        <Button size="sm" variant="solid" onClick={submit} disabled={!value.trim() || !!invalid}>
          {submitLabel}
        </Button>
      </div>
    </Overlay>
  );
}
