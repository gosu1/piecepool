import { useEffect, useState } from "react";
import { getWorkspace } from "../lib/ipc";
import type { Workspace } from "../lib/types";

// IPC 왕복 검증 화면 (Rust get_workspace → 표시). docs/40-frontend/screens/workspace.md (작성 예정).
export default function WorkspaceScreen() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getWorkspace()
      .then(setWs)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <section className="p-6">
      <h1 className="text-xl font-semibold">Workspace</h1>
      <p className="mt-1 text-sm text-neutral-500">IPC 왕복 검증 — Rust get_workspace</p>
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      <pre className="mt-4 rounded bg-neutral-100 p-3 text-sm">
        {ws ? JSON.stringify(ws, null, 2) : "loading…"}
      </pre>
    </section>
  );
}
