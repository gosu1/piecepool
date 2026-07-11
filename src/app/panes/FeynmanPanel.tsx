import { useEffect, useState } from "react";
import { Button, cn } from "../../ds";
import { useFeynmanStore } from "../../store/feynmanStore";
import type { SectionTopic } from "../../lib/noteSections";
import type { Turn } from "../../llm/feynman";

// ══ 섹션 파인만 패널 — 주제 하나씩, 자기 말로 설명하게 한다 ══
//
// 노트 본문 아래에 인라인으로 붙는다(모달이 아니다). 원문을 보면서 설명해야
// 하기 때문이다 — 가려버리면 파인만이 아니라 암기 시험이 된다.
// 편집/읽기 토글 바깥에 렌더되므로 모드를 바꿔도 세션이 살아 있다.

export interface FeynmanHandlers {
  /** [네, 이해했어요] — 설명을 위키에 반영할 기회 */
  onUnderstood?: (topic: SectionTopic, history: Turn[]) => void;
  /** [아직 모르겠어요] — 복습 표시 */
  onStillConfused?: (topic: SectionTopic, explanations: string[]) => void;
}

export function FeynmanPanel({ noteId, handlers }: { noteId: string; handlers?: FeynmanHandlers }) {
  const session = useFeynmanStore((s) => s.session);
  const explain = useFeynmanStore((s) => s.explain);
  const retryProbe = useFeynmanStore((s) => s.retryProbe);
  const finishTopic = useFeynmanStore((s) => s.finishTopic);
  const skipTopic = useFeynmanStore((s) => s.skipTopic);
  const cancel = useFeynmanStore((s) => s.cancel);
  const [draft, setDraft] = useState("");

  // 주제가 바뀌거나 세션이 바뀌면 입력창을 비운다. 안 그러면 [건너뛰기]·[닫기] 로 넘어갈 때
  // 이전 주제에 쓰던 설명이 남아 다음 주제의 설명으로 전송된다.
  const cursor = session ? `${session.id}:${session.idx}` : null;
  useEffect(() => setDraft(""), [cursor]);

  if (!session || session.noteId !== noteId) return null;
  const topic = session.topics[session.idx];
  if (!topic) return null;

  const { history, probing, error, idx, topics } = session;
  const answered = history.some((t) => t.role === "user");

  const send = async () => {
    const said = draft.trim();
    if (!said || probing) return;
    setDraft("");
    await explain(said);
  };

  const finish = (understood: boolean) => {
    const done = finishTopic(understood);
    if (!done) return; // probing 중이면 판정하지 않는다
    if (understood) handlers?.onUnderstood?.(done.topic, history);
    else handlers?.onStillConfused?.(done.topic, done.explanations);
  };

  return (
    <div className="mt-4 space-y-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">
          <span className="text-primary">{topic.title}</span> — 처음 배우는 사람에게 설명해보세요
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {topics.length > 1 && (
            <span className="text-[12px] text-ink-faint">
              주제 {idx + 1}/{topics.length}
            </span>
          )}
          <button type="button" onClick={cancel} className="text-[12px] text-ink-faint hover:text-ink" aria-label="파인만 닫기">
            닫기
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="max-h-44 space-y-1.5 overflow-y-auto">
          {history.map((t, i) => (
            <p key={i} className={cn("text-[13px] leading-relaxed", t.role === "user" ? "text-ink-2" : "font-medium text-ink")}>
              {t.role === "user" ? "나: " : "↳ "}
              {t.text}
            </p>
          ))}
        </div>
      )}

      {probing && <p className="text-[13px] text-ink-faint">읽는 중…</p>}
      {error && (
        // 설명은 history 에 남아 있다 — 다시 타이핑하지 않고 그대로 재시도한다.
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-danger">파인만 질문을 못 만들었어요. 설명은 그대로 있어요.</p>
          <Button size="sm" variant="utility" onClick={retryProbe}>
            다시 시도
          </Button>
        </div>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
        }}
        disabled={probing}
        rows={3}
        placeholder={history.length ? "이어서 설명해보세요… (⌘Enter 로 보내기)" : `"${topic.title}" 을(를) 아는 대로 설명해보세요 (⌘Enter 로 보내기)`}
        aria-label="주제 설명"
        className="w-full resize-none rounded border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus-visible:shadow-soft disabled:opacity-60"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="solid" disabled={!draft.trim() || probing} onClick={send}>
            {history.length ? "다시 설명" : "설명 보내기"}
          </Button>
          <Button size="sm" variant="utility" disabled={probing} onClick={skipTopic}>
            건너뛰기
          </Button>
        </div>
        {/* 이해 판정은 오직 사용자. LLM 은 채점하지 않는다(relation-types.md §review_needed).
            단 설명을 한 번도 안 했으면 판정할 근거가 없다 — 건너뛰기로만 넘어간다. */}
        <div className="flex gap-2">
          <Button size="sm" variant="utility" disabled={probing || !answered} onClick={() => finish(false)}>
            아직 모르겠어요
          </Button>
          <Button size="sm" variant="utility" disabled={probing || !answered} onClick={() => finish(true)}>
            네, 이해했어요
          </Button>
        </div>
      </div>
    </div>
  );
}
