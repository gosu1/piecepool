import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Icons } from "../../ds";

// ══ 새 탭 런처 — 검색(문서 점프) · 고정됨 · 최근 문서 · 시작 액션 ══
// 새 탭은 파일을 만들지 않는다(탐색 트리거에 생성 부작용 금지 — VS Code/Arc 관례).
// 새 노트 작성은 onNewNote 로 보낸다(지연 생성: 저장 시에만 파일 생김).

export interface LauncherDoc {
  kind: "wiki" | "archive";
  space: string;
  spaceName: string;
  file: string;
  title: string;
}

const docKey = (d: LauncherDoc) => `${d.kind}:${d.space}:${d.file}`;

export function NewTabPane({
  docs,
  recent,
  pinned,
  onOpenDoc,
  onNewNote,
  onGraph,
}: {
  /** 검색 대상 전체 문서 */
  docs: LauncherDoc[];
  /** 최근 연 문서(최신순) */
  recent: LauncherDoc[];
  /** 페이지 헤더 "고정하기"로 고정한 문서 */
  pinned: LauncherDoc[];
  onOpenDoc: (d: LauncherDoc) => void;
  onNewNote: () => void;
  onGraph: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const hits = useMemo(
    () => (query ? docs.filter((d) => d.title.toLowerCase().includes(query)).slice(0, 10) : []),
    [docs, query],
  );
  return (
    <div className="flex h-full justify-center overflow-y-auto">
      <div className="w-full max-w-md px-4 pb-8 pt-[16vh]">
        {/* 검색 — 타이핑하면 문서 점프, Enter = 첫 결과 열기 */}
        <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2.5">
          <Icons.SearchIcon size={16} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && hits[0]) onOpenDoc(hits[0]);
            }}
            placeholder="노트·위키 검색…"
            aria-label="문서 검색"
            className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {query ? (
          <div className="mt-2">
            {hits.length === 0 && <p className="px-3 py-2 text-[13px] text-ink-faint">결과 없음</p>}
            {hits.map((d) => (
              <DocRow key={docKey(d)} d={d} onClick={() => onOpenDoc(d)} />
            ))}
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <Section label="고정됨">
                {pinned.map((d) => (
                  <DocRow key={docKey(d)} d={d} icon={<Icons.PinIcon size={14} className="shrink-0 text-ink-faint" />} onClick={() => onOpenDoc(d)} />
                ))}
              </Section>
            )}
            {recent.length > 0 && (
              <Section label="최근 문서">
                {recent.map((d) => (
                  <DocRow key={docKey(d)} d={d} onClick={() => onOpenDoc(d)} />
                ))}
              </Section>
            )}
            <Section label="시작하기">
              <ActionRow icon={<Icons.EditIcon size={14} />} label="새 노트 작성" hint="⌘N" onClick={onNewNote} />
              <ActionRow icon={<Icons.GraphIcon size={14} />} label="개념 지도 열기" onClick={onGraph} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="px-3 pb-1 text-[12px] font-medium text-ink-faint">{label}</p>
      {children}
    </div>
  );
}

function DocRow({ d, icon, onClick }: { d: LauncherDoc; icon?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[14px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
    >
      {icon ?? <Icons.FileIcon size={14} className="shrink-0 text-ink-muted" />}
      <span className="min-w-0 flex-1 truncate">{d.title}</span>
      <span className="shrink-0 text-[12px] text-ink-faint">{d.spaceName}</span>
    </button>
  );
}

function ActionRow({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[14px] text-primary transition-colors hover:bg-surface-soft"
    >
      <span className="text-ink-muted">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      {hint && <kbd className="shrink-0 rounded-sm bg-fill-subtle px-1.5 py-0.5 font-sans text-[11px] text-ink-2">{hint}</kbd>}
    </button>
  );
}
