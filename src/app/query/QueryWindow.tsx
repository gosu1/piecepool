import { useEffect, useRef, useState } from "react";
import { Icons, cn } from "../../ds";
import { Markdown } from "../../lib/markdown";
import { errorHint } from "../panes/FeynmanPanel";
import { askQuery, type QueryTurn } from "../../llm/queryAgent";
import { errMsg, isAbort } from "../../llm/http";
import * as ipc from "../../lib/ipc";
import { useQuerySession } from "./useQuerySession";

// ══ 쿼리바 창 — 메인 앱과 별개로 뜨는 두 번째 창 ══
//
// `main.tsx` 가 창 이름표(label)를 보고 이 화면을 고른다. 메인 앱과 같은 번들을 쓰되 그리는
// 것만 다르다. 설계: "쿼리바 설계" §1~§2.
//
// 대화 저장(§6)·대화 목록(§3)·슬래시 명령(§4)·/lint(§5)는 이어지는 작업에서 채운다.
// 지금은 물으면 답이 오는 데까지다.

const EXAMPLES = [
  "지난주에 적어둔 것 중에 지금 쓸 만한 게 뭐야?",
  "내 위키에서 서로 어긋나는 내용 찾아줘",
  "이 주제에서 내가 아직 안 적어둔 빈틈이 뭐지?",
];

/** 답변 글 속 위키 제목을 강조하려면 제목 목록이 필요하다 — 모든 폴더에서 한 번 모은다. */
function useWikiTitles(): string[] {
  const [titles, setTitles] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const spaces = await ipc.listSpaces();
        const lists = await Promise.all(spaces.map((s) => ipc.listWiki(s.slug).catch(() => [])));
        if (alive) setTitles([...new Set(lists.flat().map((w) => w.title).filter(Boolean))]);
      } catch {
        // 제목을 못 모아도 대화는 된다 — 강조만 안 될 뿐이다
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return titles;
}

/** 목록의 상대 시각 — 방금 · N분 전 · 어제 · 8월 18일. StudyHome 과 같은 감각. */
function relTime(iso: string): string {
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

/** 답을 만드는 동안 보여주는 점 세 개. 파일 이름은 띄우지 않는다(설계 §2.5). */
function Thinking({ label }: { label: string }) {
  return (
    <div className="mb-6 flex items-center gap-2.5 text-[14px] text-ink-faint">
      <span className="inline-flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full bg-ink-faint"
            style={{ opacity: 1 - i * 0.35, animation: `ds-wave 1.2s ${i * 0.15}s ease-in-out infinite` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function QueryWindow() {
  const { turns, sessions, currentId, append, open, reset, remove, storageError } = useQuerySession();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const titles = useWikiTitles();
  const abortRef = useRef<AbortController | null>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 창이 닫히면 진행 중인 요청을 끊는다(설계 §1.5). 답이 없어진 화면에 도착하지 않게.
  useEffect(() => () => abortRef.current?.abort(), []);

  // textarea 는 내용이 늘어도 저절로 안 커진다 — 높이를 0으로 되돌린 뒤 실제 내용 높이로 다시 잡는다.
  // (되돌리지 않으면 한 번 커진 높이가 줄지 않는다.)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  // 새 말이 오가면 아래로 따라간다.
  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    const next: QueryTurn[] = [...turns, { role: "user", text: q }];
    append({ role: "user", text: q });
    setDraft("");
    setError("");
    setBusy(true);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const r = await askQuery(next, { signal: ac.signal, onProgress: setProgress });
      append({ role: "assistant", text: r.text }, r.citedWiki);
    } catch (e) {
      if (isAbort(e)) return; // 새로 물어보느라 끊은 것 — 오류가 아니다
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const empty = turns.length === 0 && !busy;

  return (
    <div className="flex h-screen bg-canvas text-ink">
      {/* 왼쪽 — 지난 대화. 저장 기능이 아직 없어 비어 있다(설계 §3·§6). */}
      <aside className="flex w-[216px] shrink-0 flex-col border-r border-hairline bg-chrome">
        <button
          type="button"
          onClick={reset}
          className="m-2.5 mb-1.5 flex h-[34px] shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 text-[13px] font-medium text-ink-2 shadow-soft transition-colors hover:bg-surface-soft"
        >
          <Icons.PlusIcon size={15} />
          <span className="flex-1 text-left">새 대화</span>
        </button>

        {sessions.length === 0 ? (
          <p className="px-3.5 pt-3 text-[11px] leading-relaxed text-ink-faint">지난 대화가 여기 쌓입니다.</p>
        ) : (
          <>
            <p className="px-3.5 pb-1.5 pt-2 text-[11px] font-semibold tracking-wider text-ink-faint">
              세션 {sessions.length}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group mx-2 mb-px flex gap-2 rounded-lg px-2.5 py-1.5",
                    s.id === currentId ? "bg-surface-soft" : "hover:bg-surface-soft/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void open(s.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span
                      className={cn(
                        "block truncate text-[13px] leading-snug",
                        s.id === currentId ? "font-medium text-ink" : "text-ink-muted",
                      )}
                    >
                      {s.title}
                    </span>
                    {/* 날짜로 묶지 않는다 — 마지막 시각과 주고받은 횟수만(설계 §3) */}
                    <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-faint">
                      {relTime(s.updatedAt)} · {s.turnCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(s.id)}
                    aria-label={`${s.title} 삭제`}
                    className="mt-0.5 h-4 shrink-0 self-start text-ink-faint opacity-0 transition-opacity hover:text-ink-2 group-hover:opacity-100"
                  >
                    <Icons.CloseIcon size={13} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-auto shrink-0 border-t border-hairline px-3.5 py-2.5 text-[11px] text-ink-faint">
          {storageError ? <span className="text-warning">대화를 저장하지 못했어요</span> : "PiecePool 쿼리바"}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {empty ? (
          <div className="flex flex-1 items-center justify-center overflow-hidden px-8">
            <div className="w-[420px] pb-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-soft text-primary">
                <Icons.AskIcon size={22} />
              </div>
              <p className="mt-4 text-[20px] font-semibold leading-normal text-ink">쌓아둔 것에 물어보세요</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
                이 워크스페이스의 위키와 자료를 읽고 답합니다
              </p>
              <div className="mt-6 flex flex-col gap-2">
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="flex items-center gap-2.5 rounded-md border border-hairline bg-surface px-3.5 py-2.5 text-left text-[14px] leading-snug text-ink-2 transition-colors hover:bg-surface-soft"
                  >
                    <span className="shrink-0 text-ink-faint">
                      <Icons.SearchIcon size={15} />
                    </span>
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-8 pt-7">
            <div className="mx-auto max-w-[680px]">
              {turns.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="mb-6 flex justify-end">
                    <p className="max-w-[78%] whitespace-pre-wrap rounded-2xl bg-surface-soft px-3.5 py-2.5 text-[15px] leading-relaxed text-ink">
                      {t.text}
                    </p>
                  </div>
                ) : (
                  // 근거로 쓴 위키는 답변 글 안에서 제목이 강조된다 — 파일 목록을 따로 띄우지 않는다(설계 §2.5)
                  <Markdown key={i} source={t.text} terms={titles} className="mb-7 text-[15px] leading-[1.8] text-ink-2" />
                ),
              )}
              {busy && <Thinking label={progress || "위키를 찾는 중"} />}
              {error && (
                <div className="mb-6 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3">
                  <p className="text-[14px] text-ink-2">{errorHint(error)}</p>
                  <p className="mt-1 text-[11px] text-ink-faint">{error}</p>
                </div>
              )}
              <div ref={tailRef} />
            </div>
          </div>
        )}

        <div className="shrink-0 px-8 pb-4">
          <div className="mx-auto flex max-w-[680px] items-end gap-2 rounded-lg border border-hairline bg-surface py-2 pl-3.5 pr-2 shadow-soft">
            <textarea
              ref={inputRef}
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter 보내기 · Shift+Enter 줄바꿈. 한글 조합 중 Enter 는 글자를 확정하는 키라 흘려보낸다.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              placeholder="무엇이든 물어보세요"
              disabled={busy}
              className="min-h-[32px] flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void send(draft)}
              disabled={busy || !draft.trim()}
              aria-label="보내기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary transition-opacity disabled:opacity-35"
            >
              <Icons.ArrowRightIcon size={18} />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-faint">↵ 보내기 · ⇧↵ 줄바꿈</p>
        </div>
      </div>
    </div>
  );
}
