import type { FormEvent } from "react";
import { useState } from "react";
import { FolderOpen, HardDrive, Plus, ShieldCheck } from "lucide-react";
import type { WorkspaceProfile } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

export function WorkspaceGate({
  recentWorkspace,
  onCreateWorkspace,
  onOpenWorkspace
}: {
  recentWorkspace: WorkspaceProfile | null;
  onCreateWorkspace: (name: string) => void;
  onOpenWorkspace: (workspace: WorkspaceProfile) => void;
}) {
  const [name, setName] = useState(recentWorkspace?.name ?? "My Study Pool");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreateWorkspace(name.trim() || "My Study Pool");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-mist p-4 text-ink">
      <div className="w-full max-w-5xl">
        <div className="mb-5 flex items-center gap-3 px-1">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white shadow-card">
            <HardDrive size={19} />
          </div>
          <div>
            <p className="text-lg font-black text-ink">PiecePool</p>
            <p className="text-xs font-semibold text-slate-500">Local-first AI workspace</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel>
            <div className="flex items-center gap-2 text-pool">
              <ShieldCheck size={18} />
              <p className="text-xs font-black uppercase tracking-[0.16em]">Start local workspace</p>
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight text-ink">Workspace를 만들거나 열고 시작합니다.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              PiecePool의 1차 MVP는 로그인보다 내 기기의 Workspace 진입이 우선입니다. 자료는 먼저 로컬 공간에 모이고, 계정/동기화는
              이후 선택 기능으로 붙습니다.
            </p>

            <form className="mt-6" onSubmit={submit}>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Workspace name</span>
                <input
                  className="mt-2 w-full rounded-lg border border-line bg-mist px-4 py-3 text-base font-bold text-ink outline-none focus:border-pool focus:bg-white"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-black text-white" type="submit">
                <Plus size={16} />
                Create Local Workspace
              </button>
            </form>
          </Panel>

          <div className="space-y-5">
            <Panel>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-ink">Recent Workspace</p>
                  <p className="mt-1 text-sm text-slate-500">이 기기에서 마지막으로 열었던 로컬 작업 공간</p>
                </div>
                <StatusPill tone="green">Offline Ready</StatusPill>
              </div>
              {recentWorkspace ? (
                <button
                  className="mt-4 block w-full rounded-lg border border-line bg-mist p-4 text-left transition hover:bg-slate-100"
                  type="button"
                  onClick={() => onOpenWorkspace(recentWorkspace)}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-white text-pool shadow-card">
                      <FolderOpen size={18} />
                    </div>
                    <div>
                      <p className="font-black text-ink">{recentWorkspace.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{recentWorkspace.storageLabel}</p>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-line bg-mist p-4 text-sm leading-6 text-slate-500">
                  아직 이 기기에 저장된 Workspace 기록이 없습니다. 새 Workspace를 만들면 다음 실행부터 여기서 열 수 있습니다.
                </div>
              )}
            </Panel>

            <Panel>
              <p className="text-sm font-black text-ink">Sync Account</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                기존 Mock Login은 삭제하지 않고, 나중에 서버 ID와 동기화 계정을 붙일 자리로 남깁니다. 현재 MVP의 기본 흐름은 로컬
                Workspace입니다.
              </p>
              <button className="mt-4 w-full rounded-lg border border-line bg-white px-4 py-3 text-sm font-black text-slate-400" type="button" disabled>
                Sync Account Later
              </button>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
