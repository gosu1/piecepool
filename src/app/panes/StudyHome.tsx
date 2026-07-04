import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Card, EmptyState, Icons, cn } from "../../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT, ArchiveNote, GraphData } from "../../lib/types";

// ══ Study Home (부팅 탭-0) — 유니브-AI식 warm 대시보드 ══
// 처음 화면: 히어로 카드 2개(새 노트 · 개념 지도)가 중앙에 크게. 상세(나의 학습 공간 · 최근 위키 ·
// 정리 추천)는 기본 접힘 토글. 토글을 하나라도 열면 히어로가 자연스럽게 축소되며 아래로 자리 정렬(reflow).
export function StudyHome({
  spaces,
  wikiBySlug,
  notesBySlug,
  graphBySlug,
  currentSpace,
  onOpenWiki,
  onNewNote,
  onOpenGraph,
  onSelectSpace,
}: {
  spaces: KnowledgeSpace[];
  wikiBySlug: Record<string, WikiPageT[]>;
  notesBySlug: Record<string, ArchiveNote[]>;
  graphBySlug: Record<string, GraphData>;
  currentSpace: string;
  onOpenWiki: (space: string, file: string) => void;
  onNewNote: () => void;
  onOpenGraph: (space: string) => void;
  onSelectSpace?: (slug: string) => void;
}) {
  const nameOf = (slug: string) => spaces.find((s) => s.slug === slug)?.name ?? slug;

  const allWiki = spaces.flatMap((s) => (wikiBySlug[s.slug] ?? []).map((wiki) => ({ wiki, space: s.slug })));

  const recentWiki = [...allWiki].sort((a, b) => (b.wiki.updatedAt || "").localeCompare(a.wiki.updatedAt || "")).slice(0, 6);

  const totalNotes = spaces.reduce((n, s) => n + (notesBySlug[s.slug] ?? []).length, 0);
  const totalWiki = allWiki.length;
  const totalConcepts = spaces.reduce((a, s) => a + (graphBySlug[s.slug]?.nodes.length ?? 0), 0);

  // 정리 추천 (candidates only — review_needed 절대 자동기록 안 함, SSOT: user-only)
  const nudges: string[] = [];
  for (const s of spaces) {
    const g = graphBySlug[s.slug];
    if (g && g.relations.length > 0) {
      const relatedRatio = g.relations.filter((r) => r.relationType === "related_to").length / g.relations.length;
      if (relatedRatio > 0.3) nudges.push(`${s.name} · related_to ${Math.round(relatedRatio * 100)}% — 관계를 다시 살펴보면 좋아요`);
      const lowConf = g.relations.filter((r) => r.confidence < 0.5).length;
      if (lowConf > 0) nudges.push(`${s.name} · 확신도 낮은 관계 ${lowConf}개 — 한 번 확인해보세요`);
    }
    const notes = notesBySlug[s.slug] ?? [];
    const wiki = wikiBySlug[s.slug] ?? [];
    if (notes.length > wiki.length) nudges.push(`${s.name} · 원본 ${notes.length}개 · 위키 ${wiki.length}개 — 위키로 정리할 여지가 있어요`);
  }
  const topNudges = nudges.slice(0, 5);

  // 열린 토글 집합 — 하나라도 열리면 히어로 축소(compact)
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const compact = open.size > 0;

  // 콜드스타트 온보딩
  if (spaces.length === 0) {
    return (
      <div className="mx-auto max-w-3xl pt-10">
        <EmptyState
          icon={<Icons.SparkleIcon size={28} />}
          title="세컨드브레인을 시작해볼까요?"
          description="강의 노트 · PDF · 필기를 올리면 AI가 개념 위키와 관계 그래프로 정리해줘요."
          action={
            <Button variant="solid" onClick={onNewNote}>
              새 노트
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <h1 className="ds-h2 text-ink">안녕하세요 👋</h1>
        <p className="text-[16px] text-ink-muted">오늘도 배운 걸 정리해볼까요?</p>
        <p className="text-[14px] text-ink-faint">
          노트 {totalNotes} · 위키 {totalWiki} · 개념 {totalConcepts}
        </p>
      </header>

      {/* 히어로 카드 — 처음엔 크게, 토글 열리면(compact) 자연스럽게 축소 */}
      <section className="grid gap-5 sm:grid-cols-2">
        <HeroCard
          compact={compact}
          onClick={onNewNote}
          tone="fill"
          icon={<Icons.PlusIcon size={24} />}
          title="새 노트"
          subtitle="오늘 배운 걸 캡처하고 AI로 정리"
        />
        <HeroCard
          compact={compact}
          onClick={() => onOpenGraph(currentSpace)}
          tone="surface"
          icon={<Icons.GraphIcon size={24} />}
          title="개념 지도"
          subtitle="개념들이 어떻게 연결됐는지 보기"
        />
      </section>

      {/* 상세 — 기본 접힘 토글. 열면 펼쳐지고 히어로가 축소되며 자리 정렬(reflow) */}
      <div className="space-y-3">
        <CollapsibleSection title="나의 학습 공간" count={spaces.length} open={open.has("spaces")} onToggle={() => toggle("spaces")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {spaces.map((s) => {
              const noteCount = (notesBySlug[s.slug] ?? []).length;
              const wikiCount = (wikiBySlug[s.slug] ?? []).length;
              const relCount = graphBySlug[s.slug]?.relations.length ?? 0;
              return (
                <Card key={s.slug} interactive padding="lg" onClick={() => onSelectSpace?.(s.slug)}>
                  <p className="truncate text-[16px] font-semibold text-ink">{s.name}</p>
                  <p className="text-[14px] text-ink-muted">
                    원본 {noteCount} · 위키 {wikiCount} · 관계 {relCount}
                  </p>
                </Card>
              );
            })}
          </div>
        </CollapsibleSection>

        {recentWiki.length > 0 && (
          <CollapsibleSection title="최근 위키" count={recentWiki.length} open={open.has("recent")} onToggle={() => toggle("recent")}>
            <div className="grid gap-3 sm:grid-cols-3">
              {recentWiki.map((x) => (
                <Card key={`${x.space}:${x.wiki.path}`} interactive padding="lg" onClick={() => onOpenWiki(x.space, x.wiki.path)}>
                  <p className="truncate text-[16px] font-medium text-ink">{x.wiki.title}</p>
                  <p className="truncate text-[14px] text-ink-faint">{nameOf(x.space)}</p>
                </Card>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {topNudges.length > 0 && (
          <CollapsibleSection title="정리 추천" count={topNudges.length} open={open.has("nudges")} onToggle={() => toggle("nudges")}>
            <div className="space-y-2">
              {topNudges.map((t, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-md bg-surface-soft px-4 py-3 text-[15px] text-ink-2">
                  <Icons.ArrowRightIcon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[14px] text-ink-faint">※ 추천일 뿐이에요 — 아무것도 자동으로 바꾸지 않아요.</p>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

// 히어로 카드 — compact 여부에 따라 패딩·아이콘·제목이 부드럽게(300ms) 축소된다.
function HeroCard({
  compact,
  onClick,
  tone,
  icon,
  title,
  subtitle,
}: {
  compact: boolean;
  onClick: () => void;
  tone: "fill" | "surface";
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  const dark = tone === "fill";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex cursor-pointer flex-col items-start rounded-xl text-left shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated",
        dark ? "bg-fill text-on-fill" : "border border-hairline bg-surface",
        compact ? "gap-4 p-4" : "gap-10 p-7",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-lg transition-all duration-300",
          dark ? "bg-primary text-on-primary" : "bg-fill text-on-fill",
          compact ? "h-11 w-11" : "h-14 w-14",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className={cn("block font-semibold transition-all duration-300", dark ? "" : "text-ink", compact ? "text-[17px]" : "text-[20px]")}>
          {title}
        </span>
        <span className={cn("mt-1 block text-[14px]", dark ? "text-on-fill/60" : "text-ink-muted")}>{subtitle}</span>
      </span>
      <Icons.ArrowRightIcon
        size={18}
        className={cn(
          "absolute right-5 top-5 opacity-0 transition-opacity group-hover:opacity-100",
          dark ? "text-on-fill/40" : "text-ink-faint",
        )}
      />
    </button>
  );
}

// 접이식 섹션 — 헤더 클릭으로 열고 닫기(상태는 부모 소유). 기본 접힘. 열면 본문이 렌더되며 아래가 자연스럽게 정렬.
function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-soft/60"
      >
        {open ? (
          <Icons.ChevronDownIcon size={16} className="shrink-0 text-ink-faint" />
        ) : (
          <Icons.ChevronRightIcon size={16} className="shrink-0 text-ink-faint" />
        )}
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        {count != null && <span className="ml-0.5 text-[13px] text-ink-faint">{count}</span>}
      </button>
      {open && <div className="border-t border-hairline p-4">{children}</div>}
    </div>
  );
}
