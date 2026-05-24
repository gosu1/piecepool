import Link from "next/link";
import { intakeActions } from "@/lib/mockData";
import { ArrowRight, PenLine, Plus } from "lucide-react";

export function UploadPanel() {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-bold text-ink">Inbox에 조각 모으기</p>
          <p className="mt-1 text-xs text-slate-500">
            업로드 처리는 mock 상태지만, 실제 제품 흐름을 기준으로 구성했습니다.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white shadow-card hover:bg-slate-800"
          type="button"
        >
          <Plus size={16} />
          새 프로젝트
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link
          className="group flex min-h-24 flex-col justify-between rounded-lg border border-line bg-white p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:border-pool hover:shadow-soft"
          href="/inbox"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-white shadow-card">
              <PenLine size={18} />
            </span>
            <ArrowRight className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-pool" size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">글 작성</p>
            <p className="mt-1 text-xs text-slate-500">Notion식 텍스트 조각</p>
          </div>
        </Link>
        {intakeActions.map((action) => (
          <button
            key={action.label}
            className="group flex min-h-24 flex-col justify-between rounded-lg border border-line bg-mist p-3 text-left transition hover:-translate-y-0.5 hover:border-pool hover:bg-white hover:shadow-card"
            type="button"
          >
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-pool shadow-card">
                <action.icon size={18} />
              </span>
              <ArrowRight className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-pool" size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">{action.label}</p>
              <p className="mt-1 text-xs text-slate-500">{action.description}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
