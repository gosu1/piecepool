import { useEffect, useRef, useState } from "react";
import { Icons, cn } from "../../ds";
import { Markdown } from "../../lib/markdown";
import { errorHint } from "../panes/FeynmanPanel";
import { askQuery, type QueryTurn } from "../../llm/queryAgent";
import { errMsg, isAbort } from "../../llm/http";
import * as ipc from "../../lib/ipc";
import type { QuerySessionMeta } from "../../lib/types";
import { SlashBlockEditor } from "../../lib/SlashBlockEditor";
import { useQuerySession } from "./useQuerySession";
import { parseCommand, QUERY_COMMANDS, QUERY_SLASH_ITEMS, type QueryCommandName } from "./commands";

// ══ 쿼리바 창 — 메인 앱과 별개로 뜨는 두 번째 창 ══
//
// `main.tsx` 가 창 이름표(label)를 보고 이 화면을 고른다. 메인 앱과 같은 번들을 쓰되 그리는
// 것만 다르다. 설계: "쿼리바 설계" §1~§2.
//
// `/lint`(§5)는 이어지는 작업에서 채운다.

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

/**
 * 명령이 띄우는 판 — 입력창 바로 위에 뜬다.
 *
 * 대화 흐름에 끼우지 않는다. 도움말이나 목록은 주고받은 말이 아니라서 세션 파일에 남으면
 * 안 되고, 다음에 그 대화를 열었을 때 다시 보일 이유도 없다.
 */
function CommandPanel({
  cmd,
  sessions,
  onPick,
  onClose,
}: {
  cmd: QueryCommandName;
  sessions: QuerySessionMeta[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mx-auto mb-2 max-w-[680px] overflow-hidden rounded-lg border border-hairline bg-surface shadow-soft">
      <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2">
        <span className="font-mono text-[11px] font-medium tracking-wide text-ink-muted">/{cmd}</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-ink-faint hover:text-ink-2">
          <Icons.CloseIcon size={13} />
        </button>
      </div>

      {cmd === "help" && (
        <ul className="px-3.5 py-2.5">
          {QUERY_COMMANDS.map((c) => (
            <li key={c.name} className="flex gap-3 py-1 text-[13px] leading-relaxed">
              <code className="w-[76px] shrink-0 font-mono text-[12px] text-primary">/{c.name}</code>
              <span className="text-ink-muted">{c.help}</span>
            </li>
          ))}
        </ul>
      )}

      {cmd === "sessions" &&
        (sessions.length === 0 ? (
          <p className="px-3.5 py-3 text-[13px] text-ink-faint">아직 지난 대화가 없습니다.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto py-1.5">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                className="flex w-full items-baseline gap-3 px-3.5 py-1.5 text-left hover:bg-surface-soft"
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-2">{s.title}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">
                  {relTime(s.updatedAt)} · {s.turnCount}
                </span>
              </button>
            ))}
          </div>
        ))}

      {cmd === "lint" && (
        <p className="px-3.5 py-3 text-[13px] text-ink-faint">위키에 반영하는 기능은 아직 준비 중입니다.</p>
      )}
    </div>
  );
}

export default function QueryWindow() {
  const { turns, sessions, currentId, append, open, reset, remove, storageError } = useQuerySession();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  /** 명령이 띄우는 판 — 대화가 아니라 화면 것이라 세션 파일에는 안 남는다 */
  const [panel, setPanel] = useState<QueryCommandName | null>(null);
  const titles = useWikiTitles();
  const abortRef = useRef<AbortController | null>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  // 창이 닫히면 진행 중인 요청을 끊는다(설계 §1.5). 답이 없어진 화면에 도착하지 않게.
  useEffect(() => () => abortRef.current?.abort(), []);

  // 새 말이 오가면 아래로 따라간다.
  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    const next: QueryTurn[] = [...turns, { role: "user", text: q }];
    append({ role: "user", text: q });
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

  function runCommand(cmd: QueryCommandName) {
    setError("");
    if (cmd === "new") {
      reset();
      setPanel(null);
      return;
    }
    setPanel(cmd);
  }

  /** 보내기 — 첫 글자가 슬래시이고 아는 명령이면 명령으로, 아니면 질문으로 간다(설계 §4.2). */
  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    const cmd = parseCommand(text);
    setDraft("");
    if (cmd) runCommand(cmd);
    else void send(text);
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
          {panel && (
            <CommandPanel
              cmd={panel}
              sessions={sessions}
              onPick={(id) => {
                void open(id);
                setPanel(null);
              }}
              onClose={() => setPanel(null)}
            />
          )}
          <div className="mx-auto flex max-w-[680px] items-end gap-2 rounded-lg border border-hairline bg-surface py-1 pl-3.5 pr-2 shadow-soft">
            {/* 인박스 캡처와 같은 입력창이다 — 한글 조합과 `http://` 슬래시가 거기서 이미 해결돼 있다(설계 §4.2) */}
            <SlashBlockEditor
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              placeholder="무엇이든 물어보세요"
              height="auto"
              frameless
              readOnly={busy}
              slashItems={QUERY_SLASH_ITEMS}
              submitOnEnter
              className="min-w-0 flex-1 max-h-40 overflow-y-auto"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy || !draft.trim()}
              aria-label="보내기"
              className="mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary transition-opacity disabled:opacity-35"
            >
              <Icons.ArrowRightIcon size={18} />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-faint">↵ 보내기 · ⇧↵ 줄바꿈 · / 명령</p>
        </div>
      </div>
    </div>
  );
}
