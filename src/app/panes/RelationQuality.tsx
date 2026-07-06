import { useState } from "react";
import { Button, Icons } from "../../ds";
import type { Relation } from "../../lib/types";

// ══ 관계 품질 점검 — related_to 비율 · 저신뢰(confidence) 관계 개수 + 기준 조절 ══
// 기준값은 뷰 상태(localStorage) — 기본 30% 는 relation-types.md 의 "related_to > 30% 리뷰 플래그"를 따른다.

const RATIO_KEY = "relq-related-max"; // related_to 비율 상한(%)
const CONF_KEY = "relq-conf-min"; // confidence 하한(0~1)
const RATIO_BOUNDS = { min: 1, max: 100 };
const CONF_BOUNDS = { min: 0.05, max: 1 };

// 저장·로드 양쪽에서 클램프 — 범위 밖 값이 localStorage 에 굳으면 30% 리뷰 플래그(계약)가 조용히 꺼진다.
function clamp(v: number, b: { min: number; max: number }) {
  return Math.min(b.max, Math.max(b.min, v));
}

function loadNum(key: string, fallback: number, b: { min: number; max: number }) {
  const v = Number(typeof localStorage !== "undefined" ? localStorage.getItem(key) : null);
  return Number.isFinite(v) && v > 0 ? clamp(v, b) : fallback;
}

function relationStats(relations: Relation[], ratioMax: number, confMin: number) {
  const total = relations.length;
  const related = relations.filter((r) => r.relationType === "related_to").length;
  const ratio = total ? Math.round((related / total) * 100) : 0;
  const lowConf = relations.filter((r) => r.confidence < confMin).length;
  // 판정은 원시 비율로 — 반올림(29.6→30)이 "30% 초과" 계약 경계를 흐리지 않게. ratio 는 표시용.
  return { total, ratio, lowConf, ratioOver: total > 0 && (related / total) * 100 > ratioMax };
}

// 그래프 좌하단 상시 미터 — 토큰 카운터풍 조용한 수치 표시. 기준 조절은 위키 화면 "관계 품질" 팝오버.
export function RelationQualityMeter({ relations }: { relations: Relation[] }) {
  const ratioMax = loadNum(RATIO_KEY, 30, RATIO_BOUNDS);
  const confMin = loadNum(CONF_KEY, 0.5, CONF_BOUNDS);
  const s = relationStats(relations, ratioMax, confMin);
  if (s.total === 0) return null;
  const hints = [
    ...(s.ratioOver ? ["related_to 비율 초과 — 관계를 다시 살펴보세요"] : []),
    ...(s.lowConf > 0 ? [`confidence < ${confMin} 관계 ${s.lowConf}개 — 확인해보세요`] : []),
  ];
  return (
    <span
      title={[`관계 ${s.total}개 · 기준 related_to ${ratioMax}% / confidence ${confMin} (위키 화면 '관계 품질'에서 조절)`, ...hints].join("\n")}
      className="pointer-events-auto flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-hairline bg-surface px-2.5 font-mono text-[11px] text-ink-faint shadow-soft"
    >
      <span>
        related_to <span className={s.ratioOver ? "font-semibold text-danger" : "text-ink-2"}>{s.ratio}%</span>
      </span>
      <span>
        conf&lt;{confMin} <span className={s.lowConf > 0 ? "font-semibold text-danger" : "text-ink-2"}>{s.lowConf}</span>
      </span>
      {(s.ratioOver || s.lowConf > 0) && <span aria-hidden>⚠</span>}
    </span>
  );
}

export function RelationQuality({ relations }: { relations: Relation[] }) {
  const [open, setOpen] = useState(false);
  const [ratioMax, setRatioMax] = useState(() => loadNum(RATIO_KEY, 30, RATIO_BOUNDS));
  const [confMin, setConfMin] = useState(() => loadNum(CONF_KEY, 0.5, CONF_BOUNDS));

  const { total, ratio, lowConf, ratioOver } = relationStats(relations, ratioMax, confMin);

  const commit = (key: string, v: number, set: (n: number) => void) => {
    set(v);
    localStorage.setItem(key, String(v));
  };

  return (
    <div className="relative">
      <Button variant="utility" size="sm" onClick={() => setOpen((o) => !o)} leftIcon={<Icons.GearIcon size={14} />}>
        관계 품질
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-1 w-72 space-y-3 rounded-lg border border-hairline bg-surface p-3 text-left shadow-elevated">
            <p className="ds-eyebrow text-ink-faint">관계 품질 · 전체 {total}개</p>

            <div className="space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between text-ink-2">
                <span>related_to 비율</span>
                <span className={ratioOver ? "font-semibold text-danger" : "font-medium text-ink"}>
                  {ratio}% <span className="font-normal text-ink-faint">/ 기준 {ratioMax}%</span>
                </span>
              </div>
              {ratioOver && (
                <p className="rounded-md border border-warning/50 bg-warning/10 px-2.5 py-1.5 text-ink-2">⚠ 관계를 다시 살펴보세요</p>
              )}
              <div className="flex items-center justify-between text-ink-2">
                <span>confidence &lt; {confMin} 관계</span>
                <span className={lowConf > 0 ? "font-semibold text-danger" : "font-medium text-ink"}>{lowConf}개</span>
              </div>
              {lowConf > 0 && (
                <p className="rounded-md border border-warning/50 bg-warning/10 px-2.5 py-1.5 text-ink-2">⚠ 확인해보세요</p>
              )}
            </div>

            <div className="space-y-1.5 border-t border-hairline pt-2.5">
              <p className="text-[12px] font-medium text-ink-faint">기준 조절</p>
              <ThresholdInput
                label="related_to 상한(%)"
                bounds={RATIO_BOUNDS}
                step={5}
                value={ratioMax}
                onCommit={(v) => commit(RATIO_KEY, v, setRatioMax)}
              />
              <ThresholdInput
                label="confidence 하한"
                bounds={CONF_BOUNDS}
                step={0.05}
                value={confMin}
                onCommit={(v) => commit(CONF_KEY, v, setConfMin)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// blur/Enter 커밋 + 범위 클램프 — 타이핑 중엔 uncontrolled(PageHeader 제목 input 과 같은 key+defaultValue 패턴).
// controlled + onChange 저장은 무효 중간값("0.")이 스냅백되고 타이핑 중간값이 localStorage 에 굳는다.
function ThresholdInput({
  label,
  bounds,
  step,
  value,
  onCommit,
}: {
  label: string;
  bounds: { min: number; max: number };
  step: number;
  value: number;
  onCommit: (v: number) => void;
}) {
  const commitEl = (el: HTMLInputElement) => {
    const v = el.valueAsNumber;
    const c = Number.isFinite(v) ? clamp(v, bounds) : value; // 빈/무효 입력 → 기존 기준 복원
    el.value = String(c); // 클램프 결과가 기존 값과 같으면 리마운트가 없으므로 DOM 표기를 직접 정정
    if (c !== value) onCommit(c);
  };
  return (
    <label className="flex items-center justify-between gap-2 text-[13px] text-ink-2">
      {label}
      <input
        key={value}
        type="number"
        min={bounds.min}
        max={bounds.max}
        step={step}
        defaultValue={value}
        onBlur={(e) => commitEl(e.currentTarget)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="w-20 rounded-md border border-hairline bg-surface px-2 py-1 text-right text-[13px] text-ink outline-none focus:border-primary"
      />
    </label>
  );
}
