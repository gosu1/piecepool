import { useState } from "react";
import type { ReactNode } from "react";
import { Icons, cn } from "../../ds";
import type { Subject } from "../../lib/types";
import { titleError } from "../../lib/titleValidation";

// ══ 페이지형 헤더 — 제목(인라인 이름 변경) · 속성(과목/고정/더 보기) · 관계형 ══
// 고정은 뷰 상태(workspaceStore, localStorage) — frontmatter 는 계약(SSOT)이라 건드리지 않는다.

export interface LinkedItem {
  key: string;
  label: string;
  onClick?: () => void;
}

export function PageHeader({
  docType,
  title,
  onRename,
  subjects,
  subjectIds,
  onToggleSubject,
  pinned,
  onTogglePin,
  createdAt,
  updatedAt,
  filePath,
  linked,
  candidates,
  onAddLink,
}: {
  docType: "wiki" | "archive";
  title: string;
  onRename: (title: string) => void;
  subjects: Subject[];
  subjectIds: string[];
  onToggleSubject: (id: string) => void;
  pinned: boolean;
  onTogglePin: () => void;
  createdAt?: string;
  updatedAt?: string;
  filePath: string;
  linked: LinkedItem[];
  candidates: { key: string; label: string }[];
  onAddLink: (key: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [popover, setPopover] = useState<"subject" | "link" | null>(null);
  const [linkQuery, setLinkQuery] = useState("");

  // 새 노트 기본 제목("제목 없음")은 빈 placeholder 로 보여준다.
  const isUntitled = title === "제목 없음";
  // 허용 문자 위반 시 저장 차단 + 인라인 안내(titleValidation) — 입력값은 남겨 고칠 수 있게 한다.
  const [titleErr, setTitleErr] = useState("");
  const commitTitle = (el: HTMLInputElement) => {
    const v = el.value.trim();
    if (v && v !== title) {
      const err = titleError(v);
      if (err) {
        setTitleErr(err);
        return;
      }
      onRename(v);
    } else el.value = isUntitled ? "" : title;
    setTitleErr("");
  };

  const selected = subjects.filter((s) => subjectIds.includes(s.id));
  const q = linkQuery.trim().toLowerCase();
  const shownCandidates = q ? candidates.filter((c) => c.label.toLowerCase().includes(q)) : candidates;

  return (
    <div>
      {/* 제목 — Enter/blur 커밋, Esc 취소 */}
      <input
        key={title}
        defaultValue={isUntitled ? "" : title}
        placeholder="새 페이지"
        aria-label="페이지 제목"
        onBlur={(e) => commitTitle(e.currentTarget)}
        onChange={() => titleErr && setTitleErr("")}
        onKeyDown={(e) => {
          // 한글 IME 조합 확정 Enter 는 제출이 아니다 — 조합 중이면 무시.
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.currentTarget.value = isUntitled ? "" : title;
            setTitleErr("");
            e.currentTarget.blur();
          }
        }}
        className="w-full bg-transparent text-[32px] font-bold leading-tight text-ink outline-none placeholder:text-ink-faint"
      />
      {titleErr && <p className="mt-1 text-[12px] text-danger">{titleErr}</p>}

      {/* 속성 행 */}
      <div className="mt-3 space-y-px text-[14px]">
        <div className="flex min-h-[30px] items-center">
          <PropLabel icon={<Icons.LayersIcon size={15} />} label="영역 · 과목" />
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setPopover(popover === "subject" ? null : "subject")}
              className="flex w-full flex-wrap items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-soft"
            >
              {selected.length === 0 ? (
                <span className="text-ink-faint">비어 있음</span>
              ) : (
                selected.map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-0.5 text-[13px] text-ink-2">
                    <SubjectDot color={s.color} />
                    {s.name}
                  </span>
                ))
              )}
            </button>
            {popover === "subject" && (
              <Popover onClose={() => setPopover(null)} className="w-60">
                {subjects.length === 0 && <p className="px-2.5 py-2 text-[13px] text-ink-faint">이 공간에 과목이 없어요</p>}
                {subjects.map((s) => {
                  const on = subjectIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onToggleSubject(s.id)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[14px] text-ink-2 hover:bg-surface-soft hover:text-ink"
                    >
                      <SubjectDot color={s.color} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {on && <span className="text-[13px] text-primary">✓</span>}
                    </button>
                  );
                })}
              </Popover>
            )}
          </div>
        </div>

        <div className="flex min-h-[30px] items-center">
          <PropLabel icon={<Icons.PinIcon size={15} />} label="북마크" />
          <div className="flex-1 px-2">
            <input type="checkbox" checked={pinned} onChange={onTogglePin} aria-label="북마크에 추가" className="h-[15px] w-[15px] accent-primary" />
          </div>
        </div>

        {moreOpen && (
          <>
            <InfoRow icon={<Icons.CalendarIcon size={15} />} label="생성일" value={createdAt ? createdAt.slice(0, 10) : "—"} />
            <InfoRow icon={<Icons.CalendarIcon size={15} />} label="수정일" value={updatedAt ? updatedAt.slice(0, 10) : "—"} />
            <InfoRow icon={<Icons.FileIcon size={15} />} label="파일" value={filePath} />
            <InfoRow icon={<Icons.SparkleIcon size={15} />} label="종류" value={docType === "wiki" ? "위키 (AI 정리)" : "원본 노트"} />
          </>
        )}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-faint transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <Icons.ChevronDownIcon size={14} className={cn("transition-transform", moreOpen && "rotate-180")} />
          {moreOpen ? "속성 접기" : "속성 4개 더 보기"}
        </button>
      </div>

      {/* 관계형 — 연결된 노트(관계 그래프 기반) + 추가 */}
      <div className="mt-5">
        <p className="text-[12px] font-medium text-ink-faint">관계형</p>
        <div className="mt-1 space-y-px">
          {linked.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={l.onClick}
              disabled={!l.onClick}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[14px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
            >
              <Icons.FileIcon size={14} className="shrink-0 text-ink-muted" />
              <span className="truncate">{l.label}</span>
            </button>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setLinkQuery("");
                setPopover(popover === "link" ? null : "link");
              }}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-[14px] text-ink-faint transition-colors hover:bg-surface-soft hover:text-ink"
            >
              <Icons.LinkIcon size={14} />
              연결된 노트 추가
            </button>
            {popover === "link" && (
              <Popover onClose={() => setPopover(null)} className="w-72 p-2">
                <input
                  autoFocus
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder="노트 검색…"
                  className="mb-1 w-full rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-faint"
                />
                <div className="max-h-56 overflow-y-auto">
                  {shownCandidates.length === 0 && <p className="px-2.5 py-2 text-[13px] text-ink-faint">연결할 수 있는 노트가 없어요</p>}
                  {shownCandidates.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => {
                        onAddLink(c.key);
                        setPopover(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[14px] text-ink-2 hover:bg-surface-soft hover:text-ink"
                    >
                      <Icons.FileIcon size={14} className="shrink-0 text-ink-muted" />
                      <span className="truncate">{c.label}</span>
                    </button>
                  ))}
                </div>
              </Popover>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-hairline" />
    </div>
  );
}

// 인라인 앵커 팝오버 — AccountFooter/SidebarChrome 과 같은 패턴(백드롭 + absolute 패널)
function Popover({ onClose, className, children }: { onClose: () => void; className?: string; children: ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className={cn("absolute left-0 top-full z-30 mt-1 rounded-lg border border-hairline bg-surface p-1 shadow-elevated", className)}>{children}</div>
    </>
  );
}

function PropLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex w-40 shrink-0 items-center gap-2 px-2 text-[14px] text-ink-muted">
      <span className="text-ink-faint">{icon}</span>
      {label}
    </span>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-[30px] items-center">
      <PropLabel icon={icon} label={label} />
      <span className="min-w-0 flex-1 truncate px-2 text-ink-2">{value}</span>
    </div>
  );
}

function SubjectDot({ color }: { color?: string | null }) {
  return color ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} /> : <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />;
}
