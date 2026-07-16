import { useEffect, useState } from "react";
import { Button, cn } from "../../ds";
import { useFeynmanStore, hasGeminiKey } from "../../store/feynmanStore";
import { splitFeynmanSection, bodyHash, type FeynmanSession, type FeynmanTurn } from "../../lib/feynmanSection";
import type { WikiPage } from "../../lib/types";

// ══ 위키 파인만 패널 — 이 개념을 자기 말로 설명하게 한다 ══
//
// 위키 본문 아래에 인라인으로 붙는다(모달이 아니다). 본문을 보면서 설명해야 하기
// 때문이다 — 가려버리면 파인만이 아니라 암기 시험이 된다.
//
// 과거 세션은 접힌 카드로 쌓인다. 3개월 전의 자신이 무엇을 알고 무엇을 몰랐는지가
// 복기의 재료다. "이후 문서 바뀜" 배지는 그때의 설명이 지금 본문과 어긋날 수 있음을 알린다.

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
};
const VERDICT_TEXT: Record<FeynmanSession["verdict"], string> = { understood: "이해함", not_yet: "아직 모르겠다고 표시" };

/** 대화 렌더 — 과거 카드와 진행 중 세션이 같은 모양을 쓴다. */
function Turns({ turns }: { turns: readonly FeynmanTurn[] }) {
  return (
    <>
      {turns.map((t, i) => (
        <p key={i} className={cn("whitespace-pre-wrap text-[13px] leading-relaxed", t.role === "user" ? "text-ink-2" : "font-medium text-ink")}>
          {t.role === "user" ? "나: " : "↳ "}
          {t.text}
        </p>
      ))}
    </>
  );
}

function SessionCard({ s, stale }: { s: FeynmanSession; stale: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-hairline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] text-ink-2 hover:bg-surface-soft"
      >
        <span className="text-ink-faint">{open ? "▾" : "▸"}</span>
        <span>{fmtDate(s.at)}</span>
        <span className="text-ink-faint">·</span>
        <span className={cn(s.verdict === "understood" ? "text-ink" : "text-danger")}>{VERDICT_TEXT[s.verdict]}</span>
        {stale && <span className="ml-auto shrink-0 text-ink-faint">이후 문서가 바뀌었어요</span>}
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-hairline px-2 py-2">
          <Turns turns={s.turns} />
        </div>
      )}
    </div>
  );
}

export function FeynmanPanel({ space, page }: { space: string; page: WikiPage }) {
  const session = useFeynmanStore((s) => s.session);
  const start = useFeynmanStore((s) => s.start);
  const explain = useFeynmanStore((s) => s.explain);
  const retryProbe = useFeynmanStore((s) => s.retryProbe);
  const finish = useFeynmanStore((s) => s.finish);
  const dismiss = useFeynmanStore((s) => s.dismiss);
  const [draft, setDraft] = useState("");

  // 세션은 앱 전역 싱글턴이다 — 다른 페이지의 세션이면 이 패널의 것이 아니다.
  const mine = session && session.space === space && session.path === page.path ? session : null;
  // 세션이 바뀌면 입력창을 비운다 — 이전 세션에 쓰던 설명이 다음 세션으로 새면 안 된다.
  useEffect(() => setDraft(""), [mine?.id ?? null]);

  const { sessions } = splitFeynmanSection(page.markdown);
  const now = bodyHash(page.markdown);
  const keyed = hasGeminiKey();

  const send = async () => {
    const said = draft.trim();
    if (!said || mine?.probing) return;
    setDraft("");
    await explain(said);
  };

  if (!mine) {
    return (
      <div className="mt-4 space-y-2">
        {sessions.map((s, i) => (
          <SessionCard key={`${s.at}-${i}`} s={s} stale={!!s.bodyHash && s.bodyHash !== now} />
        ))}
        <Button size="sm" variant="utility" disabled={!keyed} onClick={() => start(space, page)}>
          {!keyed ? "파인만 — API 키 필요" : sessions.length ? "다시 설명해보기" : "이 개념을 설명해보기"}
        </Button>
      </div>
    );
  }

  const { history, probing, error } = mine;
  const answered = history.some((t) => t.role === "user");

  return (
    <div className="mt-4 space-y-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">
          <span className="text-primary">{page.title}</span> — 처음 배우는 사람에게 설명해보세요
        </p>
        <button type="button" onClick={dismiss} className="shrink-0 text-[12px] text-ink-faint hover:text-ink" aria-label="파인만 닫기">
          닫기
        </button>
      </div>

      {history.length > 0 && (
        <div className="max-h-44 space-y-1.5 overflow-y-auto">
          <Turns turns={history} />
        </div>
      )}

      {probing && <p className="text-[13px] text-ink-faint">읽는 중…</p>}
      {error && (
        // 설명은 history 에 남아 있다 — 다시 타이핑하지 않고 그대로 재시도한다.
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-danger">문제가 생겼어요. 설명은 그대로 있어요.</p>
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
        placeholder={history.length ? "이어서 설명해보세요… (⌘Enter 로 보내기)" : `"${page.title}" 을(를) 아는 대로 설명해보세요 (⌘Enter 로 보내기)`}
        aria-label="개념 설명"
        className="w-full resize-none rounded border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus-visible:shadow-soft disabled:opacity-60"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="solid" disabled={!draft.trim() || probing} onClick={send}>
            {history.length ? "다시 설명" : "설명 보내기"}
          </Button>
          <Button size="sm" variant="utility" disabled={probing} onClick={dismiss}>
            나중에
          </Button>
        </div>
        {/* 이해 판정은 오직 사용자. LLM 은 채점하지 않는다(relation-types.md §review_needed).
            단 설명을 한 번도 안 했으면 판정할 근거가 없다 — [나중에] 로만 넘어간다. */}
        <div className="flex gap-2">
          <Button size="sm" variant="utility" disabled={probing || !answered} onClick={() => void finish(false)}>
            아직 모르겠어요
          </Button>
          <Button size="sm" variant="utility" disabled={probing || !answered} onClick={() => void finish(true)}>
            네, 이해했어요
          </Button>
        </div>
      </div>
    </div>
  );
}
