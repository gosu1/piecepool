import { useCallback, useEffect, useRef, useState } from "react";
import * as ipc from "../../lib/ipc";
import type { QuerySession, QuerySessionMeta } from "../../lib/types";
import type { QueryTurn } from "../../llm/queryAgent";

// ══ 대화 기록 — 파일로 남기고 다시 꺼낸다 ══
//
// 대화 1건 = `queries/sessions/<id>.json` 파일 1개. 계약: workspace-layout.md §3.10.
// 설계: "쿼리바 설계" §3 · §6.
//
// 말이 오갈 때마다 통째로 다시 쓴다. 대화가 아주 커지면 손해지만 위키에 묻는 대화는
// 그 정도로 커지지 않고, 무엇보다 **창을 닫아도 안 날아가는 것**이 먼저다.

/** 대화 id. 파일명이 되므로 경로 문자가 섞이면 안 된다(백엔드도 한 번 더 막는다). */
function newId(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 목록에 뜰 이름 — 첫 질문을 줄여 쓴다. 사용자가 이름을 짓게 하지 않는다. */
function titleFrom(turns: QueryTurn[]): string {
  const first = turns.find((t) => t.role === "user")?.text.replace(/\s+/g, " ").trim() ?? "";
  if (!first) return "새 대화";
  return first.length > 40 ? `${first.slice(0, 39)}…` : first;
}

export interface QuerySessionState {
  turns: QueryTurn[];
  sessions: QuerySessionMeta[];
  currentId: string | null;
  /** 말 한 마디를 붙이고 파일에 남긴다. 저장이 실패해도 화면의 대화는 유지된다. */
  append: (turn: QueryTurn, citedWiki?: string[]) => void;
  /** 지난 대화를 꺼내 온다. */
  open: (id: string) => Promise<void>;
  /** 새 대화 — 지금 것은 이미 파일에 있으므로 화면만 비운다. */
  reset: () => void;
  remove: (id: string) => Promise<void>;
  /** 목록·저장 실패 사유. 대화 자체는 계속 된다. */
  storageError: string;
}

export function useQuerySession(): QuerySessionState {
  const [turns, setTurns] = useState<QueryTurn[]>([]);
  const [sessions, setSessions] = useState<QuerySessionMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState("");

  // 상태(useState)는 다음 렌더에야 반영된다. 한 번의 대화에서 질문과 답변이 잇달아 붙는데
  // 그 사이에 상태를 읽으면 옛 값이 나와 **대화 id 가 두 번 만들어진다.** 그래서 저장에 쓰는
  // 값은 전부 ref 로 들고, 화면용 state 는 그 사본으로 둔다.
  const turnsRef = useRef<QueryTurn[]>([]);
  const idRef = useRef<string | null>(null);
  const createdAtRef = useRef<string>("");
  const citedRef = useRef<Map<number, string[]>>(new Map());

  const refresh = useCallback(async () => {
    try {
      setSessions(await ipc.listQuerySessions());
      setStorageError("");
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 창을 다시 앞으로 가져오면 목록을 새로 읽는다 — 메인 앱에서 뭔가 바뀌었을 수 있다(설계 §1.3).
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const append = useCallback(
    (turn: QueryTurn, citedWiki?: string[]) => {
      // 파일 쓰기를 setTurns 안에 두면 안 된다. 상태 갱신 함수는 순수해야 하고, StrictMode 는
      // 버그를 드러내려고 그 함수를 두 번 부른다 — 그러면 같은 대화가 두 벌 저장된다.
      const next = [...turnsRef.current, turn];
      turnsRef.current = next;
      if (citedWiki?.length) citedRef.current.set(next.length - 1, citedWiki);
      setTurns(next);

      if (!idRef.current) {
        idRef.current = newId();
        createdAtRef.current = new Date().toISOString();
        setCurrentId(idRef.current);
      }

      const now = new Date().toISOString();
      const session: QuerySession = {
        id: idRef.current,
        title: titleFrom(next),
        createdAt: createdAtRef.current,
        updatedAt: now,
        turns: next.map((t, i) => ({
          role: t.role,
          text: t.text,
          at: now,
          citedWiki: citedRef.current.get(i),
        })),
      };
      // 저장 실패는 알리되 대화를 끊지 않는다 — 화면에 있는 말이 사라지는 게 더 나쁘다.
      ipc
        .saveQuerySession(session)
        .then(() => {
          setStorageError("");
          void refresh();
        })
        .catch((e) => setStorageError(e instanceof Error ? e.message : String(e)));
    },
    [refresh],
  );

  const open = useCallback(async (id: string) => {
    try {
      const s = await ipc.readQuerySession(id);
      const cited: Array<[number, string[]]> = s.turns
        .map((t, i): [number, string[]] => [i, t.citedWiki ?? []])
        .filter(([, c]) => c.length > 0);
      citedRef.current = new Map(cited);
      createdAtRef.current = s.createdAt;
      idRef.current = s.id;
      const loaded: QueryTurn[] = s.turns.map((t) => ({ role: t.role, text: t.text }));
      turnsRef.current = loaded;
      setCurrentId(s.id);
      setTurns(loaded);
      setStorageError("");
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const reset = useCallback(() => {
    citedRef.current = new Map();
    createdAtRef.current = "";
    idRef.current = null;
    turnsRef.current = [];
    setCurrentId(null);
    setTurns([]);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      try {
        await ipc.deleteQuerySession(id);
        if (id === idRef.current) reset();
        await refresh();
      } catch (e) {
        setStorageError(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh, reset],
  );

  return { turns, sessions, currentId, append, open, reset, remove, storageError };
}
