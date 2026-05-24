"use client";

import {
  connectionCandidates,
  isolatedNodes,
  wikiFlowSteps,
  wikiLayers,
  wikiOpsSummary
} from "@/lib/wikiSystemData";
import { ArrowRight, Check, FileClock, Link2, Plus, Sparkles, TriangleAlert } from "lucide-react";

const severityStyle = {
  높음: "bg-red-50 text-red-700 ring-red-200",
  중간: "bg-amber-50 text-amber-700 ring-amber-200",
  낮음: "bg-slate-100 text-slate-600 ring-slate-200"
};

const statusStyle = {
  "검토 필요": "bg-amber-50 text-amber-700 ring-amber-200",
  "승인 가능": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  보류: "bg-slate-100 text-slate-600 ring-slate-200"
};

export function WikiSystemDashboard() {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-line bg-white p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-lg font-black text-ink">오늘의 지식 정리 컨트롤</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              사용자는 파일명이나 마크다운을 다루지 않습니다. 자료를 추가하고, AI의 정리 제안을 확인하고,
              의미 있는 연결만 승인하면 됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white shadow-card hover:bg-slate-800"
              type="button"
            >
              <Plus size={16} />
              자료 추가
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-mist px-4 py-2 text-sm font-bold text-slate-700 hover:bg-white"
              type="button"
            >
              <Sparkles size={16} />
              AI 정리 실행
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {wikiOpsSummary.map((item) => (
          <article key={item.label} className="rounded-lg border border-line bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
                <p className="mt-2 text-xl font-black text-ink">{item.value}</p>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-mist text-pool">
                <item.icon size={18} />
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-card">
        <div>
          <p className="text-lg font-black text-ink">사용자가 보는 3개의 작업 영역</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            내부적으로는 LLM-Wiki 구조를 따르지만, 화면에서는 사용자가 조작할 수 있는 제품 영역으로 보여줍니다.
          </p>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {wikiLayers.map((layer) => (
            <article key={layer.title} className="rounded-lg border border-line bg-mist p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-ink">{layer.title}</p>
                  <p className="mt-1 text-xs font-bold text-pool">{layer.subtitle}</p>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-pool shadow-card">
                  <layer.icon size={17} />
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-card">
                사용자가 하는 일: {layer.action}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{layer.rule}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-card">
        <p className="text-lg font-black text-ink">사용자 흐름</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {wikiFlowSteps.map((step, index) => (
            <article key={step.title} className="relative rounded-lg border border-line bg-white p-4 shadow-card">
              <p className="text-sm font-black text-ink">{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              {index < wikiFlowSteps.length - 1 ? (
                <ArrowRight className="absolute -right-4 top-6 hidden text-slate-300 lg:block" size={18} />
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-5 shadow-card">
          <div className="flex items-center gap-2 text-amber-600">
            <TriangleAlert size={18} />
            <p className="text-xs font-black uppercase tracking-[0.16em]">Needs attention</p>
          </div>
          <h2 className="mt-4 text-lg font-black text-ink">정리되지 않은 자료</h2>
          <div className="mt-4 space-y-3">
            {isolatedNodes.map((node) => (
              <article key={node.id} className="rounded-lg border border-line bg-mist p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-black text-ink">{node.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${severityStyle[node.severity]}`}>
                    {node.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{node.reason}</p>
                <p className="mt-3 text-xs font-bold text-pool">권장: {node.recommendedAction}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-5 shadow-card">
          <div className="flex items-center gap-2 text-pool">
            <Link2 size={18} />
            <p className="text-xs font-black uppercase tracking-[0.16em]">Connection review</p>
          </div>
          <h2 className="mt-4 text-lg font-black text-ink">연결 검토함</h2>
          <div className="mt-4 space-y-3">
            {connectionCandidates.map((candidate) => (
              <article key={candidate.id} className="rounded-lg border border-line bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink">{candidate.source}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">→ {candidate.target}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${statusStyle[candidate.status]}`}>
                    {candidate.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{candidate.rationale}</p>
                <button
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                  type="button"
                >
                  <Check size={14} />
                  연결 승인
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-line bg-white p-5 shadow-card">
        <div className="flex items-center gap-2 text-pool">
          <FileClock size={18} />
          <p className="text-xs font-black uppercase tracking-[0.16em]">MVP note</p>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          현재 화면은 실제 저장소나 AI 자동 정리 없이 동작하는 프로토타입입니다. 사용자 경험은
          “자료를 넣고, AI 정리 결과를 확인하고, 중요한 연결을 직접 승인하는 것”에 맞춰 설계했습니다.
        </p>
      </section>
    </div>
  );
}
