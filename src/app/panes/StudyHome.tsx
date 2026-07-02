import type { ReactNode } from "react";
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
  onOpenArchive,
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
  onOpenArchive: (space: string, file: string) => void;
  onNewNote: () => void;
  onOpenGraph: (space: string) => void;
  onSelectSpace?: (slug: string) => void;
}) {
  const nameOf = (slug: string) => spaces.find((s) => s.slug === slug)?.name ?? slug;

  const allNotes = spaces.flatMap((s) => (notesBySlug[s.slug] ?? []).map((note) => ({ note, space: s.slug })));
  const allWiki = spaces.flatMap((s) => (wikiBySlug[s.slug] ?? []).map((wiki) => ({ wiki, space: s.slug })));

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCaptures = allNotes.filter((x) => x.note.createdAt.slice(0, 10) === todayStr);
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
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <h1 className="ds-h2 text-ink">안녕하세요 👋</h1>
        <p className="text-[15px] text-ink-muted">
          오늘도 배운 걸 정리해볼까요? · 노트 {totalNotes} · 위키 {totalWiki} · 개념 {totalConcepts}
        </p>
      </header>

      {/* 빠른 시작 */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Card interactive featured padding="lg" onClick={onNewNote} className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Icons.PlusIcon size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">새 노트 작성</span>
            <span className="block text-[13px] text-ink-muted">오늘 배운 걸 캡처하고 AI로 정리</span>
          </span>
        </Card>
        <Card interactive padding="lg" onClick={() => onOpenGraph(currentSpace)} className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-ink">
            <Icons.GraphIcon size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">지식 그래프</span>
            <span className="block text-[13px] text-ink-muted">개념들이 어떻게 연결됐는지 보기</span>
          </span>
        </Card>
      </section>

      {/* 지식 공간 — 공간별 원본/위키/관계 카운트 */}
      {spaces.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={<Icons.FolderIcon size={14} />} title="지식 공간" />
          <div className="grid gap-2 sm:grid-cols-2">
            {spaces.map((s) => {
              const noteCount = (notesBySlug[s.slug] ?? []).length;
              const wikiCount = (wikiBySlug[s.slug] ?? []).length;
              const relCount = graphBySlug[s.slug]?.relations.length ?? 0;
              return (
                <Card key={s.slug} interactive padding="md" onClick={() => onSelectSpace?.(s.slug)}>
                  <p className="truncate text-[14px] font-semibold text-ink">{s.name}</p>
                  <p className="text-[12px] text-ink-muted">
                    원본 {noteCount} · 위키 {wikiCount} · 관계 {relCount}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* 오늘 캡처 */}
      <section className="space-y-3">
        <SectionTitle icon={<Icons.FileUpIcon size={14} />} title={`오늘 캡처 (${todayCaptures.length})`} />
        {todayCaptures.length === 0 ? (
          <p className="text-[14px] text-ink-muted">오늘은 아직 캡처가 없어요. 강의 끝나고 한 줄이라도 남겨볼까요?</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {todayCaptures.map((x) => (
              <Card key={`${x.space}:${x.note.path}`} interactive padding="md" onClick={() => onOpenArchive(x.space, x.note.path)}>
                <p className="truncate text-[14px] font-medium text-ink">{x.note.title}</p>
                <p className="truncate text-[12px] text-ink-faint">{nameOf(x.space)}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 최근 위키 */}
      {recentWiki.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={<Icons.FileIcon size={14} />} title="최근 위키" />
          <div className="grid gap-2 sm:grid-cols-3">
            {recentWiki.map((x) => (
              <Card key={`${x.space}:${x.wiki.path}`} interactive padding="md" onClick={() => onOpenWiki(x.space, x.wiki.path)}>
                <p className="truncate text-[14px] font-medium text-ink">{x.wiki.title}</p>
                <p className="truncate text-[12px] text-ink-faint">{nameOf(x.space)}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 정리 추천 (candidates only) */}
      {nudges.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={<Icons.SparkleIcon size={14} />} title="정리 추천" />
          <div className="space-y-1.5">
            {nudges.slice(0, 5).map((t, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-hairline bg-surface-soft px-3 py-2 text-[13px] text-ink-2">
                <Icons.ArrowRightIcon size={14} className="mt-0.5 shrink-0 text-ink-faint" />
                <span>{t}</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-ink-faint">※ 추천일 뿐이에요 — 아무것도 자동으로 바꾸지 않아요.</p>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-faint">{icon}</span>
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
    </div>
  );
}
