import { Button, EmptyState, Icons, cn } from "../../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT, ArchiveNote, GraphData } from "../../lib/types";

// ══ Study Home (부팅 탭-0) — "파편이 지식이 되다, Piecepool" ══
// C1 저널 레이아웃(넉넉·시원): 브랜드 태그라인(단어별 3초 페이드업) → 새 노트 CTA(블루+후광)
// → 개념 지도 미니 그래프(추상 장식) → 최근 위키 피드 → 정리 추천 → 공간. 색은 기존 primary(Notion 블루) 토큰.
const TAGWORDS = ["파편이", "지식이", "되다,", "Piecepool"];

// 상대 시간 — 최근 피드용(방금/N분/N시간/어제/N일/날짜).
function relTime(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

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

  // 최근 위키(전체 공간) — updatedAt 내림차순. ISO 문자열이라 사전식 = 시간순.
  const recentWiki = spaces
    .flatMap((s) => (wikiBySlug[s.slug] ?? []).map((wiki) => ({ wiki, space: s.slug })))
    .sort((a, b) => (b.wiki.updatedAt || "").localeCompare(a.wiki.updatedAt || ""))
    .slice(0, 6);

  const graph = graphBySlug[currentSpace];
  const conceptCount = graph?.nodes.length ?? 0;
  const relationCount = graph?.relations.length ?? 0;

  // 정리 추천 (candidates only — review_needed 는 절대 자동기록 안 함, SSOT: user-only)
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
  const topNudges = nudges.slice(0, 3);

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

  const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="mx-auto max-w-[680px] pt-10 pb-16">
      {/* 브랜드 태그라인 — 단어가 파편이 → 지식이 → 되다 → Piecepool 순서로 3초에 걸쳐 떠오름.
          span 이 inline-block 이라 span 끝 일반 공백은 잘린다 → 단어 사이는 nbsp( ) 로 유지. */}
      <h1 className="text-center text-[36px] font-bold leading-[1.15] tracking-tight text-ink">
        {TAGWORDS.map((w, i) => (
          <span key={w} className={cn("pp-tagword", w === "Piecepool" && "text-primary")} style={{ animationDelay: `${i * 0.7}s` }}>
            {w}
            {i < TAGWORDS.length - 1 ? " " : ""}
          </span>
        ))}
      </h1>
      <p className="pp-date-in mt-3 text-center text-[14px] text-ink-faint">{today}</p>

      {/* 새 노트 — 유일한 주액션. 블루 채움 + accent 후광(시그니처) */}
      <button
        type="button"
        onClick={onNewNote}
        className="mt-9 flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-[18px] text-[17px] font-semibold text-on-primary shadow-[0_14px_32px_-12px_var(--color-primary)] dark:shadow-[0_10px_24px_-17px_var(--color-primary)] transition-transform hover:-translate-y-0.5"
      >
        <Icons.PlusIcon size={22} /> 새 노트
      </button>

      {/* 개념 지도 — 핵심 차별점. 추상 그래프 일러스트로 "지식망" 은유 + 클릭 시 진짜 그래프 */}
      <button
        type="button"
        onClick={() => onOpenGraph(currentSpace)}
        className="pp-map mt-5 block w-full rounded-3xl border border-hairline bg-surface p-6 text-left shadow-soft transition-transform hover:-translate-y-0.5"
      >
        <ConceptMapPreview empty={conceptCount < 2} />
        <div className="flex items-center gap-2.5 px-1 pt-4">
          <span className="text-[17px] font-bold text-ink">개념 지도</span>
          <span className="text-[13px] text-ink-faint">
            {conceptCount}개 개념 · {relationCount}개 연결
          </span>
          <Icons.ArrowRightIcon size={18} className="ml-auto text-primary" />
        </div>
      </button>

      {/* 최근 위키 — 이어서 학습(타임라인 피드) */}
      {recentWiki.length > 0 && (
        <section className="mt-10">
          <p className="mb-2 px-1 text-[12px] font-bold uppercase tracking-wider text-ink-faint">최근</p>
          <div>
            {recentWiki.map((x) => (
              <button
                key={`${x.space}:${x.wiki.path}`}
                type="button"
                onClick={() => onOpenWiki(x.space, x.wiki.path)}
                className="flex w-full items-baseline gap-4 border-b border-hairline px-1 py-3.5 text-left transition-colors hover:bg-surface-soft/50"
              >
                <span className="truncate text-[15px] font-medium text-ink">{x.wiki.title}</span>
                <span className="ml-auto shrink-0 text-[12px] text-ink-faint">
                  {nameOf(x.space)} · {relTime(x.wiki.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 정리 추천 — 절제된 어드바이저리(있을 때만). 자동으로 아무것도 바꾸지 않음 */}
      {topNudges.length > 0 && (
        <section className="mt-8">
          <p className="mb-2 px-1 text-[12px] font-bold uppercase tracking-wider text-ink-faint">정리 추천</p>
          <div className="space-y-2">
            {topNudges.map((t, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl bg-surface-soft px-4 py-3 text-[14px] text-ink-2">
                <Icons.ArrowRightIcon size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 공간 — 조용한 footer. 클릭하면 그 공간으로 이동 */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
        {spaces.map((s, i) => (
          <span key={s.slug} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectSpace?.(s.slug)}
              className={cn("transition-colors hover:text-primary", s.slug === currentSpace && "font-semibold text-ink")}
            >
              {s.name}
            </button>
            {i < spaces.length - 1 && <span className="text-ink-faint">·</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// 개념 지도 미니 프리뷰 — 북두칠성(Big Dipper) 별자리. 국자로 흩어진 조각을 퍼 담는(pool) 형상 + 길잡이 은유.
// 별은 밝기에 따라 크기가 다르고, 카드(.pp-map) hover 시 엇갈려 반짝이며(pp-star) 별자리 선이 파랗게 켜진다(pp-cline).
// 실제 탐색은 카드 클릭 → onOpenGraph. 개념이 거의 없으면(empty) 전체 톤다운.
function ConceptMapPreview({ empty }: { empty: boolean }) {
  // 북두칠성 7성 (viewBox 460×200) — 손잡이(왼쪽) → 국자(오른쪽). 캔버스를 크게 채운다. r = 밝기(magnitude).
  const stars = [
    { x: 44, y: 66, r: 4.2 }, // Alkaid (손잡이 끝)
    { x: 124, y: 96, r: 3.4 }, // Mizar
    { x: 204, y: 118, r: 3.8 }, // Alioth
    { x: 290, y: 128, r: 3 }, // Megrez (손잡이-국자 연결)
    { x: 392, y: 66, r: 4.8 }, // Dubhe (국자 우상)
    { x: 420, y: 166, r: 3.7 }, // Merak (국자 우하)
    { x: 300, y: 180, r: 3.4 }, // Phecda (국자 좌하)
  ];
  const lines: [number, number][] = [
    [0, 1], [1, 2], [2, 3], // 손잡이
    [3, 4], [4, 5], [5, 6], [6, 3], // 국자
  ];
  // 배경 성진(star dust) — 밤하늘 앰비언스. 함께 반짝인다.
  const dust = [
    { x: 96, y: 42, r: 1.5 }, { x: 224, y: 46, r: 1.2 }, { x: 340, y: 40, r: 1.6 }, { x: 436, y: 116, r: 1.3 },
    { x: 158, y: 186, r: 1.2 }, { x: 40, y: 148, r: 1.4 }, { x: 262, y: 78, r: 1.1 },
  ];
  return (
    <svg viewBox="0 0 460 200" className={cn("w-full", empty && "opacity-50")} role="img" aria-label="개념 지도 미리보기 — 북두칠성">
      {lines.map(([a, b], i) => (
        <line key={i} className="pp-cline" x1={stars[a].x} y1={stars[a].y} x2={stars[b].x} y2={stars[b].y} stroke="var(--color-graph-edge)" strokeWidth={1.5} />
      ))}
      {dust.map((d, i) => (
        <circle key={`d${i}`} className="pp-star" style={{ animationDelay: `${i * 0.21}s` }} cx={d.x} cy={d.y} r={d.r} fill="var(--color-graph-result)" />
      ))}
      {stars.map((s, i) => (
        <circle key={i} className="pp-star" style={{ animationDelay: `${i * 0.19}s` }} cx={s.x} cy={s.y} r={s.r} fill="var(--color-primary)" />
      ))}
    </svg>
  );
}
