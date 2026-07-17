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

/**
 * 실패 원인을 사용자가 할 일로 번역한다.
 *
 * 429(기다리면 됨)와 401(키를 고쳐야 함)은 사용자가 취할 행동이 완전히 다른데
 * "문제가 생겼어요" 만 띄우면 구분이 안 된다. gemini.ts 가 이미 429 를 rate_limit 으로
 * 분류하는 것과 같은 취지 — feynman.ts 는 `HTTP ${status}` 로 뭉개므로 여기서 읽는다.
 * 429 는 분당 속도 제한(기다리면 풀림)과 할당량 소진(키·결제 필요) 둘 다 온다(cb994d2) —
 * 구분은 아래 작게 남기는 원문(진단용)으로 한다.
 */
export function errorHint(raw: string): string {
  if (/HTTP 429/.test(raw)) return "요청이 몰렸어요 — 잠시 후 다시 시도해보세요.";
  if (/HTTP 40[13]/.test(raw)) return "API 키를 확인하거나 교체해주세요.";
  if (/API key 필요/.test(raw)) return "설정에서 Gemini 키를 넣어주세요.";
  if (/network:/.test(raw)) return "연결을 확인해주세요.";
  if (/no structured output/.test(raw)) return "답을 못 알아들었어요 — 다시 시도해보세요.";
  return "문제가 생겼어요.";
}

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

export function FeynmanPanel({
  space,
  page,
  onSaved,
}: {
  space: string;
  page: WikiPage;
  /**
   * 판정 저장 직후 — 호출부가 앱의 메모리 사본(wikiBySlug)을 갱신한다.
   * 없으면 page prop 이 stale 인 채로 남아 **접힌 카드가 같은 앱 세션에서 영영 안 나타난다.**
   * 스토어는 디스크만 안다.
   */
  onSaved?: (saved: WikiPage) => void;
}) {
  const session = useFeynmanStore((s) => s.session);
  const start = useFeynmanStore((s) => s.start);
  const explain = useFeynmanStore((s) => s.explain);
  const retryProbe = useFeynmanStore((s) => s.retryProbe);
  const requestHint = useFeynmanStore((s) => s.requestHint);
  const finish = useFeynmanStore((s) => s.finish);
  const dismiss = useFeynmanStore((s) => s.dismiss);
  const [draft, setDraft] = useState("");

  // 세션은 앱 전역 싱글턴이다 — 다른 페이지의 세션이면 이 패널의 것이 아니다.
  const mine = session && session.space === space && session.path === page.path ? session : null;
  // 세션이 바뀌면 입력창을 비운다 — 이전 세션에 쓰던 설명이 다음 세션으로 새면 안 된다.
  useEffect(() => setDraft(""), [mine?.id ?? null]);

  const send = async () => {
    const said = draft.trim();
    if (!said || mine?.probing) return;
    setDraft("");
    await explain(said);
  };

  // 저장된 페이지를 호출부에 올려보내야 카드가 화면에 나타난다 — 스토어는 디스크만 안다.
  const done = async (understood: boolean) => {
    const saved = await finish(understood);
    if (saved) onSaved?.(saved);
  };

  // 본문 파싱은 이 분기에서만 필요하다 — 위로 올리면 진행 중 세션의 타이핑마다 위키 전체를 다시 판다.
  if (!mine) {
    const { sessions } = splitFeynmanSection(page.markdown);
    const now = bodyHash(page.markdown);
    const keyed = hasGeminiKey();
    return (
      <div className="mt-4 space-y-2">
        {sessions.map((s, i) => (
          // bodyHash 없는 세션(손편집·구버전)은 판정을 건너뛴다 — 모르면 배지를 안 띄운다.
          <SessionCard key={`${s.at}-${i}`} s={s} stale={!!s.bodyHash && s.bodyHash !== now} />
        ))}
        <Button size="sm" variant="utility" disabled={!keyed} onClick={() => start(space, page)}>
          {!keyed ? "파인만 — API 키 필요" : sessions.length ? "다시 설명해보기" : "파인만 기능"}
        </Button>
      </div>
    );
  }

  const { history, probing, saving, error, hint, hinting, hintError } = mine;
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
      {/* finish 는 디스크 왕복(readWiki→saveWiki)이다 — 피드백이 없으면 눌렀는지 모른다. */}
      {saving && <p className="text-[13px] text-ink-faint">기록하는 중…</p>}
      {error && (
        // 설명은 history 에 남아 있다 — 다시 타이핑하지 않고 그대로 재시도한다.
        // 원인을 보여준다: "API 키 필요" 와 "HTTP 429" 는 사용자가 할 일이 완전히 다른데,
        // "문제가 생겼어요" 만 띄우면 무엇을 해야 할지 알 수 없고 우리도 진단할 수 없다.
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] text-danger">
              {errorHint(error)} 설명은 그대로 있어요.
            </p>
            <Button size="sm" variant="utility" onClick={retryProbe}>
              다시 시도
            </Button>
          </div>
          <p className="break-all text-[11px] text-ink-faint">{error}</p>
        </div>
      )}

      {/* [아직 모르겠어요] 1단계 힌트 — 답이 아니라 출발점이다. 비유 프레임 + 유도 질문:
          질문에 순서대로 답하다 보면 그게 곧 설명이 된다(키워드 나열은 할 일을 안 줘서 버렸다). */}
      {hinting && <p className="text-[13px] text-ink-faint">힌트 만드는 중…</p>}
      {hintError && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-danger">힌트를 못 만들었어요.</p>
          <Button size="sm" variant="utility" onClick={requestHint}>
            다시 시도
          </Button>
        </div>
      )}
      {hint && (
        <div className="space-y-1.5 rounded border border-hairline bg-surface px-2.5 py-2">
          <p className="text-[13px] leading-relaxed text-ink">
            <span className="font-semibold text-primary">힌트</span> — {hint.analogy}
          </p>
          {hint.questions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] text-ink-faint">이 질문에 하나씩 답해보세요 — 그게 곧 설명이 돼요.</p>
              {hint.questions.map((q, i) => (
                <p key={q} className="text-[13px] leading-relaxed text-ink-2">
                  {i + 1}. {q}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
        }}
        disabled={probing || saving}
        rows={3}
        placeholder={history.length ? "이어서 설명해보세요… (⌘Enter 로 보내기)" : `"${page.title}" 을(를) 아는 대로 설명해보세요 (⌘Enter 로 보내기)`}
        aria-label="개념 설명"
        className="w-full resize-none rounded border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus-visible:shadow-soft disabled:opacity-60"
      />

      {/* 이해 판정은 오직 사용자. LLM 은 채점하지 않는다(relation-types.md §review_needed).
          [네, 이해했어요] 는 설명이 한 번은 있어야 한다 — 근거 없는 판정은 착각만 강화한다.
          [아직 모르겠어요] 는 설명 전에도 누른다: 1단계는 비유 힌트, 힌트를 보고도 모르면 그때 기록.
          [나중에] 는 없앴다: 헤더 [닫기] 와 똑같이 dismiss() 라 완전히 중복이었다.
          인박스 위키 패널은 좁아서(min 280px) 한 줄에 다 안 들어간다 — flex-wrap 이 알아서 내린다. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="solid" disabled={!draft.trim() || probing || saving} onClick={send}>
          {history.length ? "다시 설명" : "설명 보내기"}
        </Button>
        <Button size="sm" variant="utility" disabled={probing || saving || hinting} onClick={() => (hint ? void done(false) : void requestHint())}>
          {hint ? "그래도 모르겠어요" : "아직 모르겠어요"}
        </Button>
        <Button size="sm" variant="utility" disabled={probing || saving || !answered} onClick={() => void done(true)}>
          네, 이해했어요
        </Button>
      </div>
    </div>
  );
}
