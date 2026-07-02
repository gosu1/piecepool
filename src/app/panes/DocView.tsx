import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Card, WikiPage, Icons, cn } from "../../ds";
import { Markdown } from "../../lib/markdown";
import { MarkdownEditor } from "../../lib/MarkdownEditor";
import type { GapQuestion } from "../../llm/gaps";

// ══ 문서 뷰 (위키/원본 공통) — 읽기 ↔ 편집 + 관련 개념 ══
export function DocView({
  docType,
  title,
  meta,
  savedMd,
  isEditing,
  draft,
  onToggleEdit,
  onChangeDraft,
  onSave,
  onLink,
  related,
  topSlot,
  bottomSlot,
  embedSpace,
}: {
  docType: "wiki" | "archive";
  title: string;
  meta?: string;
  savedMd: string;
  isEditing: boolean;
  draft: string;
  onToggleEdit: () => void;
  onChangeDraft: (md: string) => void;
  onSave: () => void | Promise<void>;
  onLink: (target: string) => void;
  related?: { title: string; onClick: () => void }[];
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
  embedSpace?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-6">
      {topSlot}
      <div className="flex items-center justify-end gap-2">
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
          <MarkdownEditor value={draft} onChange={onChangeDraft} />
          <Card padding="lg" className="max-h-[480px] overflow-y-auto">
            <p className="ds-eyebrow mb-2 text-ink-faint">미리보기</p>
            <Markdown source={draft} onLink={onLink} embedSpace={embedSpace} />
          </Card>
        </div>
      ) : docType === "wiki" ? (
        <WikiPage title={title}>
          <Markdown source={savedMd} onLink={onLink} embedSpace={embedSpace} />
        </WikiPage>
      ) : (
        <>
          <div>
            <h1 className="ds-h3 text-ink">{title}</h1>
            {meta && <p className="text-[12px] text-ink-faint">{meta}</p>}
          </div>
          <Card padding="lg">
            <Markdown source={savedMd} onLink={onLink} embedSpace={embedSpace} />
          </Card>
        </>
      )}

      {docType === "wiki" && !isEditing && related && related.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="ds-eyebrow text-ink-faint">관련 개념</p>
          <div className="flex flex-wrap gap-2">
            {related.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={r.onClick}
                className="rounded-full border border-hairline px-3 py-1 text-[13px] text-primary transition-colors hover:bg-surface-soft"
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {bottomSlot}
    </div>
  );
}

// ══ LLM 액션 바 (원본 노트) ══
export function AiBar({ busy, status, onGen, onGaps }: { busy: boolean; status?: string; onGen: () => void; onGaps: () => void }) {
  return (
    <Card padding="md" featured className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ds-eyebrow text-primary">AI</span>
        <Button variant="primary" size="sm" onClick={onGen} disabled={busy} leftIcon={<Icons.SparkleIcon size={14} />}>
          {busy ? "생성 중…" : "AI 위키 생성"}
        </Button>
        <Button variant="utility" size="sm" onClick={onGaps} disabled={busy}>
          간극 점검
        </Button>
        {status && <span className="text-[13px] text-ink-muted">{status}</span>}
      </div>
    </Card>
  );
}

export function GapPanel({ questions, onClose }: { questions: GapQuestion[]; onClose: () => void }) {
  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="ds-eyebrow text-primary">정보 간극 메우기 · 이렇게 생각하신 게 맞나요?</p>
        <button type="button" onClick={onClose} aria-label="닫기" className="rounded p-1 text-ink-faint hover:bg-surface-soft hover:text-ink">
          <Icons.CloseIcon size={14} />
        </button>
      </div>
      {questions.map((q, i) => (
        <GapItem key={i} q={q} />
      ))}
    </Card>
  );
}

function GapItem({ q }: { q: GapQuestion }) {
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
              onChange={(e) => setOther(e.target.value)}
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
    </div>
  );
}
