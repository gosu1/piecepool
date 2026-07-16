import { useMemo } from "react";
import type { ReactNode } from "react";
import { Button, Icons } from "../../ds";
import { Markdown } from "../../lib/markdown";
import { stripEvidenceSection } from "../../lib/noteSections";
import { SlashBlockEditor } from "../../lib/SlashBlockEditor";
import { MiniRelationGraph, type MiniGroup } from "../../lib/MiniGraph";
import { RELATION_LABEL, REVIEW_COLOR, groupOf } from "../../lib/relationMeta";
import type { RelationType } from "../../lib/generated/RelationType";
import type { RefConflict } from "../../lib/sourceRefConflicts";

// ══ 문서 뷰 (위키/원본 공통) — 읽기 ↔ 편집 + 개념 중심 섹션(소스·관계·헷갈리는 개념) ══
export interface DocLinkItem {
  label: string;
  onClick?: () => void;
}

export function DocView({
  docType,
  title,
  header,
  savedMd,
  isEditing,
  draft,
  onToggleEdit,
  onCancel,
  onChangeDraft,
  onSave,
  onLink,
  linkExists,
  sources,
  relationGroups,
  confused,
  conflicts,
  topSlot,
  bottomSlot,
  toolSlot,
  sideSlot,
  embedSpace,
  terms,
}: {
  docType: "wiki" | "archive";
  title: string;
  /** 페이지형 헤더(PageHeader) — 아이콘·제목·속성·관계형 */
  header?: ReactNode;
  savedMd: string;
  isEditing: boolean;
  draft: string;
  onToggleEdit: () => void;
  /** 편집 취소 — draft를 버리고 저장된 원본으로 되돌린다 */
  onCancel: () => void;
  onChangeDraft: (md: string) => void;
  onSave: () => void | Promise<void>;
  onLink: (target: string) => void;
  linkExists?: (target: string) => boolean;
  /** 위키 개념 섹션 — 관련 소스(원본 노트/파일) */
  sources?: DocLinkItem[];
  /** 위키 개념 섹션 — 타입별 관계 그룹 */
  relationGroups?: MiniGroup[];
  /** 위키 개념 섹션 — confused_with 이웃 */
  confused?: { title: string; onClick: () => void }[];
  /** sourceRefs ↔ 본문 embed 충돌 (감지만, 자동 수정 금지 — 수용기준 §2.3) */
  conflicts?: RefConflict[];
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
  /** 편집/읽기 버튼 줄에 붙는 도구 — 위키: 관계 품질 점검(RelationQuality) */
  toolSlot?: ReactNode;
  /** 읽기 모드(archive)에서 본문 옆에 나란히 붙는 패널 — 정리 글 스트리밍 미리보기 */
  sideSlot?: ReactNode;
  embedSpace?: string;
  /** 본문 속 개념 키워드 강조 — 이 공간 위키 제목 목록. 클릭 시 onLink(제목) */
  terms?: string[];
}) {
  const hasConceptPanel = !!(sources?.length || relationGroups?.length || confused?.length);
  // 자기 자신 링크 방지 — 위키 문서 안에서 그 문서 제목은 강조하지 않는다.
  // archive 노트는 제외하지 않는다: 노트 제목이 어떤 위키와 같아도 그 노트가 그 위키는 아니다.
  const termsKey = terms?.join("\n") ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const docTerms = useMemo(() => (docType === "wiki" ? terms?.filter((t) => t !== title) : terms), [termsKey, title, docType]);
  // 읽기 모드 본문 — 카드 없이 페이지에 바로. 빈 페이지는 클릭해서 작성 시작.
  // 위키는 본문의 `## 근거`(PDF 임베드)를 표시에서만 감춘다 — 관련 소스 섹션이 이미 출처를 담는다.
  // 저장 데이터·편집 모드·conflicts 점검(원본 마크다운 기준)에는 영향 없다.
  const displayMd = docType === "wiki" ? stripEvidenceSection(savedMd) : savedMd;
  const readBody = displayMd.trim() ? (
    <div className="px-1">
      <Markdown source={displayMd} onLink={onLink} linkExists={linkExists} embedSpace={embedSpace} terms={docTerms} />
    </div>
  ) : (
    <button
      type="button"
      onClick={onToggleEdit}
      className="w-full rounded-md px-1 py-2 text-left text-[15px] text-ink-faint transition-colors hover:bg-surface-soft"
    >
      비어 있는 페이지예요 — 클릭해서 작성 시작
    </button>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-6">
      {header}
      {topSlot}

      {conflicts && conflicts.length > 0 && <ConflictBanner conflicts={conflicts} />}

      <div className="flex items-center justify-end gap-2">
        {toolSlot}
        {isEditing && (
          <Button variant="primary" size="sm" onClick={onSave}>
            저장
          </Button>
        )}
        <Button
          variant="utility"
          size="sm"
          onClick={isEditing ? onCancel : onToggleEdit}
          leftIcon={isEditing ? <Icons.CloseIcon size={14} /> : <Icons.FileIcon size={14} />}
        >
          {isEditing ? "취소" : "편집"}
        </Button>
      </div>

      {isEditing ? (
        <SlashBlockEditor
          value={draft}
          onChange={onChangeDraft}
          onSubmit={onSave}
          height="480px"
          placeholder="'/' 로 블록 · ⌘Enter 로 저장"
          wikiTerms={docTerms}
          onWikiTerm={onLink}
        />
      ) : sideSlot ? (
        // 변환 중: 파편 원문(좌) | 정리 글 스트리밍(우) — 편집 모드 그리드와 동일 패턴
        <div className="grid items-start gap-3 md:grid-cols-2">
          {readBody}
          {sideSlot}
        </div>
      ) : (
        readBody
      )}

      {/* 개념 중심 섹션 (scope §2.7) — 관련 소스 · 관계 · 헷갈리는 개념 */}
      {docType === "wiki" && !isEditing && hasConceptPanel && (
        <div className="space-y-4 border-t border-hairline pt-4">
          {sources && sources.length > 0 && (
            <section className="space-y-2">
              <p className="ds-eyebrow text-ink-faint">관련 소스</p>
              <div className="flex flex-wrap gap-2">
                {sources.map((s, i) =>
                  s.onClick ? (
                    <button
                      key={i}
                      type="button"
                      onClick={s.onClick}
                      className="rounded-full border border-hairline px-3 py-1 text-[13px] text-primary transition-colors hover:bg-surface-soft"
                    >
                      {s.label}
                    </button>
                  ) : (
                    <span key={i} className="rounded-full border border-hairline px-3 py-1 text-[13px] text-ink-muted">
                      {s.label}
                    </span>
                  ),
                )}
              </div>
            </section>
          )}

          {relationGroups && relationGroups.length > 0 && (
            <section className="space-y-2">
              <p className="ds-eyebrow text-ink-faint">관계</p>
              {/* 미니 로컬 그래프 — 현재 개념 중심 이웃 한눈에 (이웃 클릭 → 이동) */}
              <MiniRelationGraph
                centerTitle={title}
                groups={relationGroups}
                className="ds-dotgrid h-72 w-full rounded-lg border border-hairline bg-surface"
              />
              <div className="space-y-1.5">
                {relationGroups.map((g) => {
                  // 대칭 관계(연관·복습)엔 방향 표기가 거짓 정보 — 그래프의 화살표 규약과 동일 (graph-view.md §1)
                  const directed = groupOf(g.type as RelationType).arrow;
                  return (
                    <div key={g.type} className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-0.5 text-[12px] font-medium text-ink-2">
                        {RELATION_LABEL[g.type as RelationType] ?? g.type}
                      </span>
                      {g.items.map((it, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={it.onClick}
                          className="rounded-full border border-hairline px-3 py-1 text-[13px] text-primary transition-colors hover:bg-surface-soft"
                          title={directed ? (it.dir === "out" ? "이 개념 → 대상" : "대상 → 이 개념") : undefined}
                        >
                          {directed && (it.dir === "out" ? "→ " : "← ")}
                          {it.label}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {confused && confused.length > 0 && (
            <section className="space-y-2">
              <p className="ds-eyebrow text-ink-faint">헷갈리는 개념</p>
              <div className="flex flex-wrap gap-2">
                {confused.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={c.onClick}
                    className="rounded-full border border-warning/50 bg-warning/10 px-3 py-1 text-[13px] text-ink-2 transition-colors hover:bg-warning/20"
                  >
                    ⚠ {c.title}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {bottomSlot}
    </div>
  );
}

// sourceRefs ↔ 본문 embed 충돌 배너 — 자동 삭제/재작성 금지, 상태만 표시.
function ConflictBanner({ conflicts }: { conflicts: RefConflict[] }) {
  return (
    <div className="space-y-1 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-[13px]">
      <p className="font-semibold text-ink">frontmatter 출처와 본문 embed가 어긋나요 — 자동으로 고치지 않습니다.</p>
      <ul className="list-disc pl-5 text-ink-2">
        {conflicts.map((c, i) => (
          <li key={i}>
            <code className="text-[12px]">
              {c.file}
              {c.page ? `#page=${c.page}` : ""}
            </code>
            {c.kind === "missing-embed" ? " — frontmatter에는 있는데 본문에 없음" : " — 본문에만 있고 frontmatter에 없음"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 노트 하단 플로팅 바 — 이 노트에서 나온 개념 중 사용자가 "아직 모르겠어요" 로 표시한 것.
 *
 * 사용자가 부르지 않았는데 노트를 열면 먼저 뜬다. 다만 과장하지 말 것:
 * 이건 사용자가 스스로 남긴 표시를 되비추는 것이지, AI 가 새로 판단한 게 아니다.
 * 표시를 붙이고 거두는 주체는 언제나 사용자다(relation-types.md §review_needed).
 */
export function ReviewBar({
  concepts,
  onOpen,
}: {
  concepts: { conceptId: string; title: string }[];
  onOpen: (conceptId: string) => void;
}) {
  if (!concepts.length) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-2">
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed bg-surface/95 px-3 py-2 shadow-elevated backdrop-blur"
        style={{ borderColor: REVIEW_COLOR }}
      >
        <span className="text-[13px] text-ink-2">
          {concepts.length === 1 ? "이 노트의 개념 하나를" : `이 노트의 개념 ${concepts.length}개를`} 아직 모르겠다고 표시하셨어요
        </span>
        <div className="flex flex-wrap gap-1.5">
          {concepts.map((c) => (
            <button
              key={c.conceptId}
              type="button"
              onClick={() => onOpen(c.conceptId)}
              className="rounded-full border border-dashed px-2 py-0.5 text-[12px] transition-colors hover:bg-surface-soft"
              style={{ borderColor: REVIEW_COLOR, color: REVIEW_COLOR }}
            >
              {c.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
