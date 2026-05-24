import { useState } from "react";
import { Cloud, LockKeyhole, Monitor, Sparkles } from "lucide-react";
import { api } from "../api/client";
import type { LlmOperationResult, ProviderSettings } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";
import { fallbackOperationResult } from "../data/mockData";

export function AiEngineView({
  settings,
  onSettingsChange,
  onPlanChange,
  onWorkspaceRefresh
}: {
  settings: ProviderSettings;
  onSettingsChange: (settings: ProviderSettings) => void;
  onPlanChange: (tier: "free" | "pro") => Promise<void>;
  onWorkspaceRefresh: () => Promise<void>;
}) {
  const [operation, setOperation] = useState<LlmOperationResult | null>(null);
  const [notice, setNotice] = useState("");
  const selectedProvider = settings.providers.find((provider) => provider.selected);

  const selectProvider = async (providerId: string) => {
    const target = settings.providers.find((provider) => provider.id === providerId);
    if (target?.status === "locked") {
      setNotice("이 엔진은 Pro 플랜에서 사용할 수 있습니다. MVP에서는 Pro 체험 모드로 잠금 상태를 확인할 수 있습니다.");
      return;
    }

    try {
      const nextSettings = await api.selectProvider(providerId);
      onSettingsChange(nextSettings);
      setNotice(`${nextSettings.providers.find((provider) => provider.selected)?.name ?? "AI 엔진"}을 선택했습니다.`);
    } catch {
      if (target?.status === "available") {
        onSettingsChange({
          ...settings,
          providers: settings.providers.map((provider) => ({ ...provider, selected: provider.id === providerId }))
        });
        setNotice(`${target.name}을 선택했습니다.`);
        return;
      }
      setNotice("엔진 선택에 실패했습니다. 로컬 엔진 상태를 확인하세요.");
    }
  };

  const runOperation = async (kind: "ingest" | "lint" | "suggest" | "approve") => {
    try {
      const result =
        kind === "ingest"
          ? await api.ingest()
          : kind === "lint"
            ? await api.lint()
            : kind === "suggest"
              ? await api.suggestConnections()
              : await api.approveConnections();
      setOperation(result);
      await onWorkspaceRefresh();
    } catch {
      setOperation(fallbackOperationResult);
    }
  };

  const changePlan = async (tier: "free" | "pro") => {
    await onPlanChange(tier);
    setNotice(tier === "pro" ? "Pro 체험 모드가 켜졌습니다. 클라우드 엔진 선택 UI를 확인할 수 있습니다." : "Free 플랜으로 돌아왔습니다. 로컬 AI만 사용합니다.");
  };

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-lg font-black text-ink">AI Engine</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              기본은 로컬 AI입니다. GPT와 Gemini는 추후 Pro 플랜에서 선택 가능한 클라우드 옵션입니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={settings.plan.tier === "pro" ? "green" : "pool"}>
              {settings.plan.tier === "pro" ? "Pro 체험" : "Free Plan"}
            </StatusPill>
            <StatusPill tone="pool">사용 중: {selectedProvider?.name ?? "Local LLM"}</StatusPill>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-black text-ink">플랜 상태</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              실제 결제는 없고, Pro 체험 모드는 GPT/Gemini 선택 흐름을 검증하기 위한 MVP 상태입니다.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-line bg-mist p-1">
            <button
              className={`rounded-md px-4 py-2 text-sm font-black ${settings.plan.tier === "free" ? "bg-white text-ink shadow-card" : "text-slate-500"}`}
              type="button"
              onClick={() => changePlan("free")}
            >
              Free
            </button>
            <button
              className={`rounded-md px-4 py-2 text-sm font-black ${settings.plan.tier === "pro" ? "bg-white text-ink shadow-card" : "text-slate-500"}`}
              type="button"
              onClick={() => changePlan("pro")}
            >
              Pro 체험
            </button>
          </div>
        </div>
        {notice ? <p className="mt-4 rounded-lg bg-mist px-3 py-2 text-sm font-semibold text-slate-600">{notice}</p> : null}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        {settings.providers.map((provider) => {
          const locked = provider.status === "locked";
          const Icon = provider.mode === "local" ? Monitor : Cloud;

          return (
            <Panel key={provider.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-mist text-pool">
                  <Icon size={19} />
                </div>
                <StatusPill tone={provider.selected ? "green" : locked ? "amber" : "slate"}>
                  {provider.selected ? "사용 중" : locked ? "Pro 잠금" : "사용 가능"}
                </StatusPill>
              </div>
              <h3 className="mt-4 text-lg font-black text-ink">{provider.name}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{provider.description}</p>
              <button
                className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-black transition ${
                  locked ? "bg-mist text-slate-400" : "bg-ink text-white hover:bg-slate-800"
                }`}
                type="button"
                onClick={() => selectProvider(provider.id)}
              >
                {locked ? <LockKeyhole size={15} /> : <Sparkles size={15} />}
                {locked ? "Pro 플랜에서 사용" : "이 엔진 선택"}
              </button>
            </Panel>
          );
        })}
      </div>

      <Panel>
        <p className="text-lg font-black text-ink">AI 정리 컨트롤</p>
        <p className="mt-1 text-sm text-slate-500">현재 선택된 엔진으로 자료 정리 흐름을 실행합니다.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white" type="button" onClick={() => runOperation("ingest")}>
            AI 정리 실행
          </button>
          <button className="rounded-lg border border-line bg-mist px-4 py-2 text-sm font-bold text-slate-700" type="button" onClick={() => runOperation("lint")}>
            고립 노드 점검
          </button>
          <button className="rounded-lg border border-line bg-mist px-4 py-2 text-sm font-bold text-slate-700" type="button" onClick={() => runOperation("suggest")}>
            연결 후보 만들기
          </button>
          <button className="rounded-lg border border-line bg-mist px-4 py-2 text-sm font-bold text-slate-700" type="button" onClick={() => runOperation("approve")}>
            연결 승인
          </button>
        </div>
        {operation ? (
          <div className="mt-5 rounded-lg border border-line bg-mist p-4">
            <p className="text-sm font-black text-ink">{operation.provider_name}</p>
            <p className="mt-2 text-sm text-slate-600">{operation.message}</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-500">
              {operation.suggested_actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
