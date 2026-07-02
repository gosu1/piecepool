import { Button, Card, EmptyState, Icons } from "../../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT, ArchiveNote, GraphData } from "../../lib/types";

// ══ Study Home (부팅 탭-0) — 유니브-AI식 warm 대시보드 ══
// 전체 vault 집계: 오늘 캡처 · 최근 위키 · 정리 추천(candidates only, 자동 변경 없음).
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

  const allNotes = spaces.flatMap((s) => (notesBySlug[s.slug] ?? []).map((note) => ({ note, space: s.slug })));
  const allWiki = spaces.flatMap((s) => (wikiBySlug[s.slug] ?? []).map((wiki) => ({ wiki, space: s.slug })));

  const recentWiki = [...allWiki].sort((a, b) => (b.wiki.updatedAt || "").localeCompare(a.wiki.updatedAt || "")).slice(0, 6);

  const totalNotes = allNotes.length;
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
              새 노트 작성
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-12">
      <header className="space-y-2">
        <h1 className="ds-h2 text-ink">안녕하세요 👋</h1>
        <p className="text-[16px] text-ink-muted">오늘도 배운 걸 정리해볼까요?</p>
        <p className="text-[14px] text-ink-faint">
          노트 {totalNotes} · 위키 {totalWiki} · 개념 {totalConcepts}
        </p>
      </header>

      {/* 빠른 시작 — 히어로 카드 한 쌍: 다크 아일랜드(새 노트) ↔ 밝은 카드(그래프) */}
      <section className="grid gap-5 sm:grid-cols-2">
        <button
          type="button"
          onClick={onNewNote}
          className="group relative flex cursor-pointer flex-col items-start gap-8 rounded-xl bg-fill p-6 text-left text-on-fill shadow-soft transition-all duration-150 hover:-translate-y-0.5 hover:shadow-elevated"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Icons.PlusIcon size={24} />
          </span>
          <span className="min-w-0">
            <span className="block text-[18px] font-semibold">새 노트 작성</span>
            <span className="mt-1 block text-[14px] text-on-fill/60">오늘 배운 걸 캡처하고 AI로 정리</span>
          </span>
          <Icons.ArrowRightIcon
            size={18}
            className="absolute right-5 top-5 text-on-fill/40 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>
        <button
          type="button"
          onClick={() => onOpenGraph(currentSpace)}
          className="group relative flex cursor-pointer flex-col items-start gap-8 rounded-xl border border-hairline bg-surface p-6 text-left shadow-soft transition-all duration-150 hover:-translate-y-0.5 hover:shadow-elevated"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-fill text-on-fill">
            <Icons.GraphIcon size={24} />
          </span>
          <span className="min-w-0">
            <span className="block text-[18px] font-semibold text-ink">지식 그래프</span>
            <span className="mt-1 block text-[14px] text-ink-muted">개념들이 어떻게 연결됐는지 보기</span>
          </span>
          <Icons.ArrowRightIcon
            size={18}
            className="absolute right-5 top-5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>
      </section>

      {/* 지식 공간 — 공간별 원본/위키/관계 카운트 */}
      {spaces.length > 0 && (
        <section className="space-y-4">
          <SectionTitle title="지식 공간" />
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
        </section>
      )}

      {/* 최근 위키 */}
      {recentWiki.length > 0 && (
        <section className="space-y-4">
          <SectionTitle title="최근 위키" />
          <div className="grid gap-3 sm:grid-cols-3">
            {recentWiki.map((x) => (
              <Card key={`${x.space}:${x.wiki.path}`} interactive padding="lg" onClick={() => onOpenWiki(x.space, x.wiki.path)}>
                <p className="truncate text-[16px] font-medium text-ink">{x.wiki.title}</p>
                <p className="truncate text-[14px] text-ink-faint">{nameOf(x.space)}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 정리 추천 (candidates only) */}
      {nudges.length > 0 && (
        <section className="space-y-4">
          <SectionTitle title="정리 추천" />
          <div className="space-y-2">
            {nudges.slice(0, 5).map((t, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-md bg-surface-soft px-4 py-3 text-[15px] text-ink-2">
                <Icons.ArrowRightIcon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
                <span>{t}</span>
              </div>
            ))}
          </div>
          <p className="text-[14px] text-ink-faint">※ 추천일 뿐이에요 — 아무것도 자동으로 바꾸지 않아요.</p>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-[14px] font-semibold text-ink-muted">{title}</h2>;
}
