import type { FormEvent } from "react";
import { useState } from "react";
import { Bell, CalendarClock, Plus, Trash2 } from "lucide-react";
import type { CreateReminderPayload, Reminder } from "../types";
import { Panel } from "./Shell";

const emptyReminder: CreateReminderPayload = {
  title: "",
  schedule: "오늘 21:00",
  project: "운영체제"
};

export function ReminderView({
  reminders,
  onCreateReminder,
  onDeleteReminder
}: {
  reminders: Reminder[];
  onCreateReminder: (payload: CreateReminderPayload) => Promise<void>;
  onDeleteReminder: (reminderId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateReminderPayload>(emptyReminder);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;

    setSaving(true);
    await onCreateReminder({ ...form, title: form.title.trim() });
    setSaving(false);
    setForm(emptyReminder);
  };

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center gap-2 text-pool">
          <Bell size={18} />
          <p className="text-xs font-black uppercase tracking-[0.16em]">Local reminders</p>
        </div>
        <h3 className="mt-3 text-xl font-black text-ink">리마인더는 로컬 알림으로 확장될 예정입니다</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">오늘 확인할 복습 일정과 프로젝트 알림을 한 곳에 모아 보여줍니다.</p>
      </Panel>

      <Panel>
        <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]" onSubmit={submit}>
          <input
            className="rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool focus:bg-white"
            placeholder="새 리마인더"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
          <input
            className="rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool focus:bg-white"
            value={form.schedule}
            onChange={(event) => setForm((current) => ({ ...current, schedule: event.target.value }))}
          />
          <input
            className="rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool focus:bg-white"
            value={form.project}
            onChange={(event) => setForm((current) => ({ ...current, project: event.target.value }))}
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

      {reminders.length === 0 ? (
        <Panel className="grid min-h-52 place-items-center text-center">
          <div>
            <p className="text-lg font-black text-ink">예정된 리마인더가 없습니다</p>
            <p className="mt-2 text-sm text-slate-500">잊기 쉬운 복습과 프로젝트 체크인을 추가하세요.</p>
          </div>
        </Panel>
      ) : null}

      {reminders.map((reminder) => (
        <Panel key={reminder.id}>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-mist text-pool">
              <CalendarClock size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-black text-ink">{reminder.title}</p>
              <p className="mt-1 text-sm text-slate-500">
                {reminder.schedule} · {reminder.project}
              </p>
            </div>
            <button
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              type="button"
              aria-label="리마인더 삭제"
              onClick={() => onDeleteReminder(reminder.id)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </Panel>
      ))}
    </div>
  );
}
