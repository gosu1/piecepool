import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icons, cn } from "../../ds";
import { Markdown } from "../../lib/markdown";
import {
  getMemoPos,
  setMemoPos,
  clampPos,
  getMemoSize,
  setMemoSize,
  clampSize,
  MEMO_DEFAULT_SIZE,
} from "../../lib/quickMemo";
import { useInboxDraftStore, EMPTY_DRAFT } from "../../store/inboxDraftStore";
import { runTidy, TidyNoKeyError, TidyStreamError } from "../../llm/tidy";
import { geminiKey, llmEndpoint } from "../../lib/settings";

// ══ Quick Memo — 강의 중 파편을 흘려 담는 플로팅 메모장 ══
// SSOT: docs/superpowers/specs/2026-07-13-quickmemo-per-note-design.md
//
// 화면에 보이는 것은 글 + 버튼뿐이다. 탭도 분할선도 목록도 없다 ("번잡하면 안 된다"가 최우선 제약).
// [정리] 를 누르면 같은 자리에서 결과로 바뀌고, [원문] 으로 언제든 돌아온다.
// 원문(draft)과 정리본(tidied)은 각각 별개로 들고 화면만 전환한다 — 정리본이 원문을 덮어쓰는 경로는 없다.
//
// 원문은 노트 초안(InboxDraft.memo)에 산다 — 노트 하나 = 메모 하나. 탭을 닫으면 함께 사라진다.
// 정리본(tidied)은 컴포넌트 상태다 — 탭을 옮기면 사라지고 원문만 남는다(파생물이므로 다시 만들면 된다).

const SAVE_DEBOUNCE_MS = 400;
const SAVED_HOLD_MS = 1200; // "자동 저장됨"을 띄워 두는 시간 — 이후 페이드아웃

function viewport(): { vw: number; vh: number } {
  return {
    vw: typeof window !== "undefined" ? window.innerWidth : 1200,
    vh: typeof window !== "undefined" ? window.innerHeight : 800,
  };
}

type Phase = "edit" | "tidying" | "done";

function apiKey(): string {
  return geminiKey(); // 설정 키 우선, 없으면 빌드 주입(VITE_GEMINI_API_KEY) 폴백
}

export function QuickMemo({ draftKey, onClose }: { draftKey: string; onClose: () => void }) {
  const draft = useInboxDraftStore((s) => s.drafts[draftKey]?.memo ?? EMPTY_DRAFT.memo);
  const write = useInboxDraftStore((s) => s.write);
  const setDraft = useCallback((memo: string) => write(draftKey, { memo }), [write, draftKey]);
  const [tidied, setTidied] = useState("");
  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 저장 표시는 "방금 저장됐다"는 순간의 신호다 — 띄웠다가 사라진다. 상시 표시는 잡음일 뿐이다.
  const [saveTick, setSaveTick] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const [size, setSize] = useState(() => {
    const { vw, vh } = viewport();
    return clampSize(getMemoSize() ?? MEMO_DEFAULT_SIZE, vw, vh);
  });
  const [pos, setPos] = useState(() => {
    const { vw, vh } = viewport();
    const s = clampSize(getMemoSize() ?? MEMO_DEFAULT_SIZE, vw, vh);
    const saved = getMemoPos();
    return saved ? clampPos(saved, s.w, s.h, vw, vh) : { x: Math.max(vw - s.w - 32, 0), y: 96 };
  });
  const abortRef = useRef<AbortController | null>(null);

  // 저장 자체는 타이핑 즉시 스토어로 간다(노트 본문과 같다). 여기 타이머는 "방금 저장됐다"는
  // 표시를 띄우는 용도다 — 타이핑이 멎은 순간에만 보여야 신호가 된다.
  // saveTick 을 올려 표시를 다시 띄운다(boolean 이면 연속 저장 때 재점화가 안 된다).
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(() => setSaveTick((n) => n + 1), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft]);

  // 저장 표시 페이드아웃 — 잠깐 보였다 사라진다.
  useEffect(() => {
    if (saveTick === 0) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), SAVED_HOLD_MS);
    return () => clearTimeout(t);
  }, [saveTick]);

  // 언마운트 시 진행 중인 스트림 취소 — 닫고 나서 상태를 건드리지 않게.
  useEffect(() => () => abortRef.current?.abort(), []);

  // 드래그 — 상단 바를 잡아 옮긴다. 놓을 때만 저장.
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const onGrab = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // 닫기 버튼은 드래그 아님
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { vw, vh } = viewport();
    setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, size.w, size.h, vw, vh));
  };
  const onDrop = () => {
    if (dragRef.current) setMemoPos(pos);
    dragRef.current = null;
  };

  // 크기 조절 — 우하단 모서리를 잡아 늘린다. 창이 화면 밖으로 커지지 않게 남은 공간까지만.
  const sizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const onResizeGrab = (e: React.PointerEvent) => {
    e.stopPropagation();
    sizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const s = sizeRef.current;
    if (!s) return;
    const { vw, vh } = viewport();
    setSize(clampSize({ w: s.w + (e.clientX - s.x), h: s.h + (e.clientY - s.y) }, vw - pos.x, vh - pos.y));
  };
  const onResizeDrop = () => {
    if (sizeRef.current) setMemoSize(size);
    sizeRef.current = null;
  };

  const tidy = useCallback(async () => {
    if (!draft.trim() || phase === "tidying") return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("tidying");
    setError(null);
    setTidied("");
    try {
      const text = await runTidy(draft, apiKey(), { onDelta: setTidied, signal: ac.signal, endpoint: llmEndpoint() });
      setTidied(text);
      setPhase("done");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // 창을 닫았다
      // 실패는 조용히 덮지 않는다 — 사유를 띄우고 원문은 그대로 둔다.
      if (e instanceof TidyNoKeyError) setError(e.message);
      else if (e instanceof TidyStreamError) setError(`정리가 도중에 끊겼어요: ${e.message}`);
      else setError(`정리 실패: ${e instanceof Error ? e.message : String(e)}`);
      // 부분 텍스트가 있으면 그대로 보여준다(TidyStreamError). 없으면 편집으로 되돌린다.
      setPhase((p) => (p === "tidying" ? "done" : p));
    }
  }, [draft, phase]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tidied);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("복사에 실패했어요 — 글을 직접 선택해 복사해 주세요");
    }
  };

  const back = () => {
    abortRef.current?.abort();
    setPhase("edit");
    setError(null);
  };

  // ⌘E → 정리. 창이 열려 있는 동안에만 산다(언마운트하면 자동 해제).
  // textarea 안에서도 눌리도록 window 에 건다 — 손이 자판을 떠나지 않아야 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "e") return;
      e.preventDefault();
      void tidy();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tidy]);

  const showResult = phase === "tidying" || phase === "done";

  return (
    <div
      role="dialog"
      aria-label="퀵메모"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      // 노트 에디터와 같은 배경(canvas) — 색으로 구분되지 않는다. 10% 테두리만이 메모장의 존재를 알린다.
      // 그림자·내부 구분선은 모두 뺐다. 선이 하나 늘 때마다 메모장은 "패널"이 되고, 글에서 멀어진다.
      // hover 시 테두리만 아주 약하게 밝아진다 — 만질 수 있다는 최소한의 신호.
      className="group fixed z-50 flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-canvas transition-colors hover:border-ink/20"
    >
      {/* 상단 바 — 제목도 손잡이 선도 없다. 잡는 곳과 닫는 곳만. */}
      <div
        onPointerDown={onGrab}
        onPointerMove={onMove}
        onPointerUp={onDrop}
        className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-end active:cursor-grabbing"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="퀵메모 닫기"
          className="absolute right-1.5 rounded p-1 text-ink-faint hover:text-ink"
        >
          <Icons.CloseIcon size={13} />
        </button>
      </div>

      {showResult ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          {tidied ? (
            <Markdown source={tidied} className="text-[14.5px]" />
          ) : (
            <p className="text-[14.5px] text-ink-faint">정리하는 중…</p>
          )}
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          placeholder="의식의 흐름대로 적어보세요.&#10;나중에 구조만 정리해 드려요 — 말투는 그대로."
          aria-label="퀵메모 파편"
          // 글꼴은 노트 에디터와 같다(SlashBlockEditor: var(--font-sans), lineHeight 1.6).
          // 여기서 쓴 파편이 그대로 노트로 넘어가므로, 쓰는 감각이 달라지면 안 된다.
          className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[14.5px] leading-[1.6] text-ink outline-none placeholder:text-ink-faint"
        />
      )}

      {error && <p className="shrink-0 px-3 pb-1.5 text-[11.5px] text-danger">{error}</p>}

      <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 py-2">
        {showResult ? (
          <>
            <Button size="sm" variant="utility" onClick={back} leftIcon={<Icons.ArrowLeftIcon size={13} />}>
              원문
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={copy}
              disabled={!tidied || phase === "tidying"}
              leftIcon={copied ? <Icons.CheckIcon size={13} /> : undefined}
            >
              {copied ? "복사됨" : "복사"}
            </Button>
          </>
        ) : (
          <>
            <span
              aria-live="polite"
              className={cn(
                "text-[11px] text-ink-faint transition-opacity duration-700",
                showSaved ? "opacity-100" : "opacity-0",
              )}
            >
              자동 저장됨
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={tidy}
              disabled={!draft.trim()}
              title="⌘E"
              leftIcon={<Icons.SparkleIcon size={13} />}
            >
              정리
            </Button>
          </>
        )}
      </div>

      {/* 크기 조절 — 우하단 모서리. 평소엔 보이지 않고 hover 때만 희미하게 드러난다. */}
      <div
        onPointerDown={onResizeGrab}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeDrop}
        role="separator"
        aria-label="퀵메모 크기 조절"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none opacity-0 transition-opacity group-hover:opacity-100"
      >
        <span className="absolute bottom-[5px] right-[5px] h-[6px] w-[6px] rounded-[1px] border-b border-r border-ink/30" />
      </div>
    </div>
  );
}
