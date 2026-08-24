import { useEffect, useRef, useState } from "react";
import { Icons, cn } from "../../ds";
import { errorHint } from "../panes/FeynmanPanel";
import { errMsg, isAbort } from "../../llm/http";
import { geminiKey } from "../../lib/settings";
import { applyProposal, proposeLint, type LintProposal } from "../../llm/lintProposal";
import type { QueryTurn } from "../../llm/queryAgent";

// ══ `/lint` — 넣을 내용을 보여주고, 체크한 것만 저장한다 ══
//
// 설계: "쿼리바 설계" §5. 판이 열리면 바로 뽑기 시작하고, 다 뽑히면 체크박스로 보여준다.
// 기본은 전부 체크다 — 제안은 이미 프롬프트와 파일 대조로 두 번 걸러졌고, `/lint` 를 친 것
// 자체가 넣고 싶다는 뜻이다. 전부 해제로 두면 매번 다 눌러야 한다.

export function LintPanel({
  turns,
  citedWiki,
  onDone,
}: {
  turns: QueryTurn[];
  citedWiki: string[];
  /** 위키를 고쳤을 때 — 창의 위키 제목 목록을 다시 읽게 한다 */
  onDone: () => void;
}) {
  const [proposals, setProposals] = useState<LintProposal[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ ok: number; failed: string[] } | null>(null);
  // StrictMode 는 effect 를 두 번 돌린다(mount → unmount → mount). 그대로 두면 AI 를 두 번
  // 부르므로 ref 로 막는다 — 돈이 나가는 자리다.
  //
  // **여기서 cleanup 에 abort 를 두면 안 된다.** 첫 mount 가 요청을 보내고, 가짜 unmount 가
  // 그걸 끊고, 두 번째 mount 는 이 가드에 걸려 다시 시작하지 않는다. 요청이 죽은 채로 끝난다.
  // 그래서 끊지 않고, 사라진 뒤에는 결과만 버린다. 한 번 호출이라 끊어서 아끼는 것도 없다.
  const startedRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const out = await proposeLint(turns, citedWiki, geminiKey());
        if (!aliveRef.current) return;
        setProposals(out);
        setPicked(new Set(out.map((_, i) => i)));
      } catch (e) {
        if (aliveRef.current && !isAbort(e)) setError(errMsg(e));
      } finally {
        if (aliveRef.current) setBusy(false);
      }
    })();
    return () => {
      aliveRef.current = false;
    };
    // 판을 여는 순간의 대화로 한 번만 뽑는다. 다시 뽑으려면 판을 닫았다 연다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  }

  async function save() {
    if (!proposals) return;
    setBusy(true);
    const failed: string[] = [];
    let ok = 0;
    // 하나씩 차례로 넣는다. 같은 파일에 두 건이 걸리면 동시에 하면 안 된다 — 둘 다 고치기
    // 전 본문을 읽어서 나중 것이 앞 것을 지운다. 차례로 하면 뒤엣것이 앞 결과를 읽는다.
    for (const p of proposals.filter((_, i) => picked.has(i))) {
      try {
        await applyProposal(p);
        ok++;
      } catch (e) {
        failed.push(`${p.title} · ${p.section} — ${errMsg(e)}`);
      }
    }
    setSaved({ ok, failed });
    setBusy(false);
    if (ok > 0) onDone();
  }

  if (saved) {
    return (
      <div className="px-3.5 py-3">
        <p className="text-[13.5px] text-ink-2">
          {saved.ok > 0 ? `${saved.ok}건을 위키에 넣었습니다.` : "넣은 것이 없습니다."}
        </p>
        {saved.failed.map((f) => (
          <p key={f} className="mt-1 text-[12px] text-warning">
            {f}
          </p>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3.5 py-3">
        <p className="text-[13.5px] text-ink-2">{errorHint(error)}</p>
        <p className="mt-1 text-[11px] text-ink-faint">{error}</p>
      </div>
    );
  }

  if (!proposals) {
    return <p className="px-3.5 py-3 text-[13px] text-ink-faint">대화에서 넣을 내용을 고르는 중…</p>;
  }

  if (proposals.length === 0) {
    return <p className="px-3.5 py-3 text-[13px] text-ink-faint">위키에 넣을 만한 내용이 없습니다.</p>;
  }

  return (
    <>
      <div className="max-h-72 overflow-y-auto py-1.5">
        {proposals.map((p, i) => (
          <label
            key={`${p.space}/${p.file}#${p.section}#${i}`}
            className="flex cursor-pointer gap-2.5 px-3.5 py-2 hover:bg-surface-soft"
          >
            <input
              type="checkbox"
              checked={picked.has(i)}
              onChange={() => toggle(i)}
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--ds-primary)]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 text-[12px]">
                <span className="truncate font-medium text-ink-2">{p.title}</span>
                <span className="shrink-0 text-ink-faint">›</span>
                <span className="truncate text-ink-muted">{p.section}</span>
                {p.kind === "new-section" && (
                  <span className="shrink-0 rounded border border-hairline px-1 text-[10px] text-ink-faint">
                    새 소제목
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{p.block}</p>
              {p.reason && <p className="mt-0.5 text-[11.5px] text-ink-faint">{p.reason}</p>}
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-hairline px-3.5 py-2">
        <span className="text-[11px] text-ink-faint">원래 글은 그대로 두고 끼워 넣습니다</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || picked.size === 0}
          className={cn(
            "flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[12.5px] font-medium text-on-primary",
            "transition-opacity disabled:opacity-35",
          )}
        >
          <Icons.CheckIcon size={13} />
          고른 {picked.size}건 넣기
        </button>
      </div>
    </>
  );
}
