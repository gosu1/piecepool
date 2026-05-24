import { todayTasks } from "@/lib/mockData";
import { CheckCircle2, Circle, Clock3 } from "lucide-react";

export function TodayTasks() {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-card">
      <div>
        <p className="text-lg font-bold text-ink">오늘 할 일</p>
        <p className="mt-1 text-sm text-slate-500">자료와 목표를 기반으로 만든 추천 순서</p>
      </div>

      <div className="mt-5 space-y-3">
        {todayTasks.map((task) => (
          <article
            key={task.id}
            className={`rounded-lg border p-4 ${
              task.done ? "border-line bg-mist/70" : "border-line bg-white"
            }`}
          >
            <div className="flex items-start gap-3">
              {task.done ? (
                <CheckCircle2 className="mt-0.5 shrink-0 text-leaf" size={19} />
              ) : (
                <Circle className="mt-0.5 shrink-0 text-slate-300" size={19} />
              )}
              <div className="min-w-0">
                <h3 className={`text-sm font-bold ${task.done ? "text-slate-400 line-through" : "text-ink"}`}>
                  {task.title}
                </h3>
                <p className="mt-1 text-xs font-semibold text-pool">{task.project}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{task.reason}</p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-xs font-bold text-slate-600">
                  <Clock3 size={13} />
                  {task.estimate}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
