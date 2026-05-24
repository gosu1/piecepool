import type { FormEvent } from "react";
import { useState } from "react";
import { CheckCircle2, Circle, Clock3, Plus, Trash2 } from "lucide-react";
import type { CreateStudyTaskPayload, StudyTask } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

const emptyTask: CreateStudyTaskPayload = {
  title: "",
  project: "운영체제",
  estimate: "20분",
  reason: "직접 추가한 학습 액션"
};

export function PlanView({
  tasks,
  onCreateTask,
  onToggleTask,
  onDeleteTask
}: {
  tasks: StudyTask[];
  onCreateTask: (payload: CreateStudyTaskPayload) => Promise<void>;
  onToggleTask: (task: StudyTask) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateStudyTaskPayload>(emptyTask);
  const [saving, setSaving] = useState(false);
  const doneCount = tasks.filter((task) => task.done).length;
  const totalMinutes = tasks.reduce((sum, task) => sum + Number.parseInt(task.estimate, 10) || sum, 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;

    setSaving(true);
    await onCreateTask({ ...form, title: form.title.trim() });
    setSaving(false);
    setForm(emptyTask);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Today</p>
          <p className="mt-2 text-2xl font-black text-ink">{tasks.length}개</p>
          <p className="mt-1 text-sm text-slate-500">오늘 계획된 학습 액션</p>
        </Panel>
        <Panel>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Done</p>
          <p className="mt-2 text-2xl font-black text-ink">
            {doneCount}/{tasks.length}
          </p>
          <p className="mt-1 text-sm text-slate-500">완료한 태스크</p>
        </Panel>
        <Panel>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Focus time</p>
          <p className="mt-2 text-2xl font-black text-ink">{totalMinutes}분</p>
          <p className="mt-1 text-sm text-slate-500">예상 학습 시간</p>
        </Panel>
      </div>

      <Panel>
        <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_7rem_auto]" onSubmit={submit}>
          <input
            className="rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool focus:bg-white"
            placeholder="오늘 할 일 추가"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
          <input
            className="rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool focus:bg-white"
            value={form.project}
            onChange={(event) => setForm((current) => ({ ...current, project: event.target.value }))}
          />
          <input
            className="rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool focus:bg-white"
            value={form.estimate}
            onChange={(event) => setForm((current) => ({ ...current, estimate: event.target.value }))}
          />
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            type="submit"
            disabled={!form.title.trim() || saving}
          >
            <Plus size={16} />
            추가
          </button>
        </form>
      </Panel>

      {tasks.length === 0 ? (
        <Panel className="grid min-h-52 place-items-center text-center">
          <div>
            <p className="text-lg font-black text-ink">오늘 계획이 비어 있습니다</p>
            <p className="mt-2 text-sm text-slate-500">Wiki나 Project에서 파생된 액션을 Plan에 모아 관리합니다.</p>
          </div>
        </Panel>
      ) : null}

      {tasks.map((task) => (
        <Panel key={task.id}>
          <div className="flex gap-3">
            <button
              className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-left"
              type="button"
              aria-label={task.done ? "완료 취소" : "완료 처리"}
              onClick={() => onToggleTask(task)}
            >
              {task.done ? <CheckCircle2 className="text-leaf" size={22} /> : <Circle className="text-slate-300" size={22} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={`text-base font-black ${task.done ? "text-slate-400 line-through" : "text-ink"}`}>{task.title}</h3>
                <StatusPill tone="pool">{task.project}</StatusPill>
              </div>
              <p className="mt-2 text-sm text-slate-600">{task.reason}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1 text-xs font-bold text-slate-600">
                <Clock3 size={13} />
                {task.estimate}
              </div>
            </div>
            <button
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              type="button"
              aria-label="태스크 삭제"
              onClick={() => onDeleteTask(task.id)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </Panel>
      ))}
    </div>
  );
}
