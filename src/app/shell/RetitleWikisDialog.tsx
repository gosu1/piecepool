import { useEffect, useState } from "react";
import { Button, cn } from "../../ds";
import { suggestRetitles } from "../../llm/retitle";
import { planRetitles, type RetitlePlanRow } from "../../lib/retitlePlan";
import { geminiKey } from "../../lib/settings";

// ══ 위키 제목 일괄 정리 — 음차 제목을 관례 표기로 (공간 우클릭 → 위키 제목 정리) ══
//
// Gemini 가 규칙에 어긋나는 제목만 골라 관례 표기를 제안하고, 바꿀지는 사용자가 행마다
// 고른다 — 자동 rename 은 없다. 대상 제목이 이미 존재하면 rename 이 아니라 병합이 필요한
// 일이라 여기서 하지 않는다(행이 잠기고 이유를 보여준다).

export function RetitleWikisDialog({
  spaceName,
  wikis,
  onApply,
  onClose,
}: {
  spaceName: string;
  wikis: { path: string; title: string }[];
  /** 선택된 변경을 순차 rename 한다(PiecePoolApp.applyRetitles) — 결과는 notice 로 알린다 */
  onApply: (changes: { file: string; to: string }[]) => Promise<void>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RetitlePlanRow[] | null>(null); // null = 제안 만드는 중
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(0); // [다시 시도] 가 올린다

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError("");
    const key = geminiKey(); // 설정 키 우선, 없으면 빌드 주입(VITE_GEMINI_API_KEY) 폴백
    suggestRetitles(
      wikis.map((w) => w.title),
      key,
    )
      .then((sug) => {
        if (!alive) return;
        const plan = planRetitles(wikis, sug);
        setRows(plan);
        setChecked(Object.fromEntries(plan.filter((r) => !r.conflict).map((r) => [r.file, true])));
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
    // wikis 는 부모 렌더마다 새 배열이다 — 열 때 스냅샷 한 번이면 충분하다(재요청은 seq 로만).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const picked = (rows ?? []).filter((r) => !r.conflict && checked[r.file]);

  const apply = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await onApply(picked.map((r) => ({ file: r.file, to: r.to })));
      onClose();
    } catch (e) {
      // 무소음 실패 금지 — busy 로 잠긴 채 멈추지 않게 풀고, 에러를 그대로 보여준다.
      setBusy(false);
      setError(String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[20vh]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-hairline bg-surface p-4 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-semibold text-ink">위키 제목 정리 — {spaceName}</p>
        <p className="mt-1 text-[12px] text-ink-faint">영어가 관례인 용어의 한글 음차 제목을 관례 표기로 바꿔요.</p>

        {error ? (
          <div className="mt-3 space-y-2">
            <p className="text-[12px] text-danger">{error}</p>
            <Button size="sm" variant="utility" onClick={() => setSeq((n) => n + 1)}>
              다시 시도
            </Button>
          </div>
        ) : rows === null ? (
          <p className="mt-3 text-[13px] text-ink-faint">제안 만드는 중… (위키 {wikis.length}개)</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-2">바꿀 제목이 없어요 — 전부 표기 규칙에 맞아요.</p>
        ) : (
          <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
            {rows.map((r) => (
              <label
                key={r.file}
                className={cn(
                  "flex items-start gap-2 rounded border border-hairline px-2.5 py-2",
                  r.conflict ? "opacity-60" : "cursor-pointer hover:bg-surface-soft",
                )}
              >
                <input
                  type="checkbox"
                  disabled={r.conflict || busy}
                  checked={!r.conflict && !!checked[r.file]}
                  onChange={(e) => setChecked((m) => ({ ...m, [r.file]: e.target.checked }))}
                  className="mt-0.5 accent-[var(--color-primary)]"
                />
                <span className="min-w-0 text-[13px] leading-relaxed">
                  <span className="text-ink-2">{r.from}</span>
                  <span className="text-ink-faint"> → </span>
                  <span className="font-medium text-ink">{r.to}</span>
                  {r.conflict && <span className="block text-[12px] text-ink-faint">같은 제목이 이미 있어요 — 수동 병합 필요</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="utility" onClick={onClose} disabled={busy}>
            취소
          </Button>
          {!error && rows !== null && rows.length > 0 && (
            <Button size="sm" variant="solid" disabled={!picked.length || busy} onClick={apply}>
              {busy ? "변경하는 중…" : `${picked.length}개 적용`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
