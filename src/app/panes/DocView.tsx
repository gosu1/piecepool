import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AIWritingBanner, Button, Card, SkeletonText, Icons, cn } from "../../ds";
import { Markdown } from "../../lib/markdown";
import { SlashBlockEditor } from "../../lib/SlashBlockEditor";
import { MiniRelationGraph, type MiniGroup } from "../../lib/MiniGraph";
import { RELATION_LABEL, REVIEW_COLOR, groupOf } from "../../lib/relationMeta";
import type { RelationType } from "../../lib/generated/RelationType";
import type { RefConflict } from "../../lib/sourceRefConflicts";
import type { GapQuestion, GapEngine } from "../../llm/gaps";
import type { ConvertJob } from "../../store/convertStore";

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
}: {
  docType: "wiki" | "archive";
  title: string;
  /** Notion풍 페이지 헤더(PageHeader) — 아이콘·제목·속성·관계형 */
  header?: ReactNode;
  savedMd: string;
  isEditing: boolean;
  draft: string;
  onToggleEdit: () => void;
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
}) {
  const hasConceptPanel = !!(sources?.length || relationGroups?.length || confused?.length);
  // 읽기 모드 본문 — Notion 처럼 카드 없이 페이지에 바로. 빈 페이지는 클릭해서 작성 시작.
  const readBody = savedMd.trim() ? (
    <div className="px-1">
      <Markdown source={savedMd} onLink={onLink} linkExists={linkExists} embedSpace={embedSpace} />
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
        <Button variant="utility" size="sm" onClick={onToggleEdit} leftIcon={<Icons.FileIcon size={14} />}>
          {isEditing ? "읽기" : "편집"}
        </Button>
      </div>

      {isEditing ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SlashBlockEditor value={draft} onChange={onChangeDraft} onSubmit={onSave} height="480px" placeholder="'/' 로 블록 · ⌘Enter 로 저장" />
          <Card padding="lg" className="max-h-[480px] overflow-y-auto">
            <p className="ds-eyebrow mb-2 text-ink-faint">미리보기</p>
            <Markdown source={draft} onLink={onLink} linkExists={linkExists} embedSpace={embedSpace} />
          </Card>
        </div>
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

// ══ LLM 액션 바 (원본 노트) ══
export function AiBar({
  busy,
  gapBusy,
  status,
  onGen,
  onGaps,
  convertBusy,
  convertStreaming,
  onConvert,
  onCancelConvert,
}: {
  busy: boolean;
  gapBusy?: boolean;
  status?: string;
  onGen: () => void;
  onGaps: () => void;
  /** 변환 진행 중(전역 single-flight) — 버튼 비활성 */
  convertBusy?: boolean;
  /** 이 노트가 스트리밍 중 — 버튼이 '중단'으로 전환 */
  convertStreaming?: boolean;
  onConvert?: () => void;
  onCancelConvert?: () => void;
}) {
  return (
    <Card padding="md" featured className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ds-eyebrow text-primary">AI</span>
        <Button variant="primary" size="sm" onClick={onGen} disabled={busy || gapBusy} leftIcon={<Icons.SparkleIcon size={14} />}>
          {busy ? "생성 중…" : "AI 위키 생성"}
        </Button>
        <Button variant="utility" size="sm" onClick={onGaps} disabled={busy || gapBusy}>
          {gapBusy ? "점검 중…" : "간극 점검"}
        </Button>
        {onConvert &&
          (convertStreaming ? (
            <Button variant="utility" size="sm" onClick={onCancelConvert}>
              중단
            </Button>
          ) : (
            <Button variant="solid" size="sm" onClick={onConvert} disabled={busy || gapBusy || convertBusy} leftIcon={<Icons.SparkleIcon size={14} />}>
              정리 글 변환
            </Button>
          ))}
        {status && <span className="text-[13px] text-ink-muted">{status}</span>}
      </div>
    </Card>
  );
}

// ══ 정리 글 변환 패널 — 스트리밍 미리보기 (docs/40-frontend/screens/convert.md) ══
const CONVERT_ENGINE_LABEL: Record<string, string> = { gemini: "Gemini", heuristic: "휴리스틱" };

export function ConvertPanel({
  job,
  onCancel,
  onClose,
  onOpen,
  onRetry,
  onLink,
  linkExists,
}: {
  job: ConvertJob;
  onCancel: () => void;
  onClose: () => void;
  onOpen: () => void;
  onRetry: () => void;
  onLink: (target: string) => void;
  linkExists?: (target: string) => boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // 바닥 48px 이내면 자동 스크롤 유지, 위로 올리면 해제
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [job.text]);
  const streaming = job.status === "streaming";
  return (
    <div className="space-y-3">
      {streaming ? (
        <AIWritingBanner label="AI가 글을 정리하고 있어요" />
      ) : (
        <div className="flex items-center justify-between">
          <p className="ds-eyebrow text-primary">
            파편 → 정리 글
            {job.engine && (
              <span className="ml-2 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                {CONVERT_ENGINE_LABEL[job.engine]}
              </span>
            )}
          </p>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded p-1 text-ink-faint hover:bg-surface-soft hover:text-ink">
            <Icons.CloseIcon size={14} />
          </button>
        </div>
      )}
      <Card padding="lg">
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
          className="max-h-[480px] overflow-y-auto"
        >
          {streaming && !job.text ? (
            <SkeletonText lines={3} />
          ) : (
            <>
              {/* 스트리밍 중 embedSpace 미전달 — 재파싱마다 FilePreview 가 파일을 다시 읽는 churn 방지 */}
              <Markdown source={job.text} onLink={onLink} linkExists={linkExists} />
              {streaming && <span className="animate-pulse text-ink-muted">▍</span>}
            </>
          )}
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
        {streaming && (
          <>
            <span>{job.text.length.toLocaleString()}자</span>
            <span className="flex-1" />
            <Button variant="utility" size="sm" onClick={onCancel}>
              중단
            </Button>
          </>
        )}
        {job.status === "saving" && <span>저장 중…</span>}
        {job.status === "done" && (
          <>
            <span>
              저장됨 · {job.noteTitle} 정리{job.warning ? ` · ${job.warning}` : ""}
            </span>
            <span className="flex-1" />
            <Button variant="solid" size="sm" onClick={onOpen}>
              열기
            </Button>
            <Button variant="utility" size="sm" onClick={onClose}>
              닫기
            </Button>
          </>
        )}
        {job.status === "cancelled" && (
          <>
            <span>중단됨 — 저장 안 됨 (개념 추출은 계속 진행돼요)</span>
            <span className="flex-1" />
            <Button variant="utility" size="sm" onClick={onRetry}>
              다시 시도
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              닫기
            </Button>
          </>
        )}
        {job.status === "failed" && (
          <>
            <span className="text-danger">실패 — 저장 안 됨{job.error ? ` · ${job.error}` : ""}</span>
            <span className="flex-1" />
            <Button variant="utility" size="sm" onClick={onRetry}>
              다시 시도
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              닫기
            </Button>
          </>
        )}
      </div>
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

const GAP_ENGINE_LABEL: Record<GapEngine, string> = {
  liner: "Liner 출처 기반",
  gemini: "Gemini 소크라테스",
  heuristic: "오프라인 점검",
};

export function GapPanel({
  questions,
  engine,
  onClose,
  onSubmit,
}: {
  questions: GapQuestion[];
  engine?: GapEngine;
  onClose: () => void;
  onSubmit?: (answers: { prompt: string; answer: string }[]) => void | Promise<void>;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const answered = answers.some((a) => a.trim());
  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="ds-eyebrow text-primary">
          정보 간극 메우기 · 이렇게 생각하신 게 맞나요?
          {engine && <span className="ml-2 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-medium text-ink-muted">{GAP_ENGINE_LABEL[engine]}</span>}
        </p>
        <button type="button" onClick={onClose} aria-label="닫기" className="rounded p-1 text-ink-faint hover:bg-surface-soft hover:text-ink">
          <Icons.CloseIcon size={14} />
        </button>
      </div>
      {questions.map((q, i) => (
        <GapItem key={i} q={q} onAnswer={(a) => setAnswers((prev) => prev.map((x, j) => (j === i ? a : x)))} />
      ))}
      {onSubmit && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="solid"
            disabled={!answered}
            onClick={() => onSubmit(questions.map((q, i) => ({ prompt: q.prompt, answer: answers[i] ?? "" })))}
          >
            답변을 노트에 저장
          </Button>
        </div>
      )}
    </Card>
  );
}

function GapItem({ q, onAnswer }: { q: GapQuestion; onAnswer: (a: string) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [other, setOther] = useState("");
  const [otherMode, setOtherMode] = useState(false);
  return (
    <div className="space-y-2 border-t border-hairline pt-3 first:border-0 first:pt-0">
      <p className="text-[15px] font-semibold text-ink">{q.prompt}</p>
      <div className="flex flex-col gap-1.5">
        {q.choices.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setPicked(i);
              setOtherMode(false);
              onAnswer(c);
            }}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-[14px] transition-colors",
              picked === i && !otherMode ? "border-primary bg-surface-soft text-ink" : "border-hairline text-ink-2 hover:bg-surface-soft",
            )}
          >
            {c}
          </button>
        ))}
        {q.allowOther &&
          (otherMode ? (
            <input
              autoFocus
              value={other}
              onChange={(e) => {
                setOther(e.target.value);
                onAnswer(e.target.value);
              }}
              placeholder="직접 설명해 보세요…"
              className="rounded-md border border-primary bg-surface px-3 py-2 text-[14px] text-ink outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setOtherMode(true);
                setPicked(null);
              }}
              className="rounded-md border border-dashed border-hairline px-3 py-2 text-left text-[14px] text-ink-muted hover:bg-surface-soft"
            >
              기타 — 직접 설명
            </button>
          ))}
      </div>
      {q.sources && q.sources.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {q.sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-primary underline-offset-2 hover:underline"
            >
              ↗ {s.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
