import { progressGoals } from "@/lib/mockData";
import { ArrowUpRight } from "lucide-react";

export function ProjectProgress() {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-card">
      <div>
        <p className="text-lg font-bold text-ink">프로젝트 진행률</p>
        <p className="mt-1 text-sm text-slate-500">시험, 발표, 아이디어를 목표 단위로 추적</p>
      </div>

      <div className="mt-5 space-y-3">
        {progressGoals.map((goal) => (
          <article key={goal.id} className="rounded-lg border border-line bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink">{goal.title}</h3>
                <p className="mt-1 text-xs text-slate-500">다음: {goal.next}</p>
              </div>
              <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white">
                {goal.dday}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-mist">
                <div className={`h-2 rounded-full ${goal.tone}`} style={{ width: `${goal.progress}%` }} />
              </div>
              <span className="w-9 text-right text-xs font-bold text-slate-600">{goal.progress}%</span>
            </div>
            <button
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-pool hover:text-ink"
              type="button"
            >
              학습 흐름 보기
              <ArrowUpRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
