import type { FormEvent } from "react";
import { useState } from "react";
import { FileAudio, FileImage, FileText, Link2, NotebookText, Plus, Sparkles, Trash2 } from "lucide-react";
import type { CreateFragmentPayload, Fragment, FragmentKind } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

const kindIcon = {
  pdf: FileText,
  text: NotebookText,
  image: FileImage,
  link: Link2,
  audio: FileAudio
};

const kindLabels: Record<FragmentKind, string> = {
  pdf: "PDF",
  text: "Text",
  image: "Image",
  link: "Link",
  audio: "Audio"
};

const emptyForm: CreateFragmentPayload = {
  title: "",
  kind: "text",
  source: "직접 입력",
  project: "운영체제",
  summary: ""
};

export function InboxView({
  fragments,
  onCreateFragment,
  onDeleteFragment
}: {
  fragments: Fragment[];
  onCreateFragment: (payload: CreateFragmentPayload) => Promise<void>;
  onDeleteFragment: (fragmentId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateFragmentPayload>(emptyForm);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;

    setSaving(true);
    await onCreateFragment({
      ...form,
      title: form.title.trim(),
      summary: form.summary.trim()
    });
    setSaving(false);
    setForm(emptyForm);
    setExpanded(false);
  };

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-lg font-black text-ink">자료 보관함</p>
            <p className="mt-1 text-sm text-slate-500">PDF, 텍스트, 이미지, 링크, 오디오 조각을 로컬 워크스페이스에 모읍니다.</p>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white shadow-card"
            type="button"
            onClick={() => setExpanded((current) => !current)}
          >
            <Plus size={16} />
            자료 추가
          </button>
        </div>
      </Panel>

      {expanded ? (
        <Panel>
          <form onSubmit={submit}>
            <div className="flex items-center gap-2 text-pool">
              <Sparkles size={17} />
              <p className="text-xs font-black uppercase tracking-[0.16em]">Quick capture</p>
            </div>
            <input
              className="mt-4 w-full border-0 bg-transparent text-2xl font-black text-ink outline-none placeholder:text-slate-300"
              placeholder="새 자료 제목"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
            <textarea
              className="mt-3 min-h-28 w-full resize-none rounded-lg border border-line bg-mist px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pool focus:bg-white"
              placeholder="본문 일부, 요약, 기억할 포인트를 적어두세요."
              value={form.summary}
              onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
            />
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1.2fr]">
              <div>
                <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Type</label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(Object.keys(kindLabels) as FragmentKind[]).map((kind) => (
                    <button
                      key={kind}
                      className={`rounded-lg px-3 py-2 text-xs font-black transition ${
                        form.kind === kind ? "bg-ink text-white" : "bg-mist text-slate-600 hover:bg-slate-100"
                      }`}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, kind }))}
                    >
                      {kindLabels[kind]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Project</span>
                <input
                  className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool"
                  value={form.project}
                  onChange={(event) => setForm((current) => ({ ...current, project: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Source</span>
                <input
                  className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool"
                  value={form.source}
                  onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-bold text-slate-600"
                type="button"
                onClick={() => setExpanded(false)}
              >
                닫기
              </button>
              <button
                className="rounded-lg bg-pool px-4 py-2 text-sm font-black text-white shadow-card disabled:cursor-not-allowed disabled:bg-slate-300"
                type="submit"
                disabled={!form.title.trim() || saving}
              >
                {saving ? "추가 중" : "Inbox에 추가"}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="grid gap-3">
        {fragments.length === 0 ? (
          <Panel className="grid min-h-52 place-items-center text-center">
            <div>
              <p className="text-lg font-black text-ink">아직 자료가 없습니다</p>
              <p className="mt-2 text-sm text-slate-500">자료를 추가하면 Wiki, Plan, Graph로 이어지는 출발점이 됩니다.</p>
            </div>
          </Panel>
        ) : null}
        {fragments.map((fragment) => {
          const Icon = kindIcon[fragment.kind];

          return (
            <Panel key={fragment.id}>
              <div className="flex gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-mist text-pool">
                  <Icon size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-ink">{fragment.title}</h3>
                    <StatusPill tone={fragment.status.includes("완료") ? "green" : fragment.status.includes("필요") ? "amber" : "pool"}>
                      {fragment.status}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{fragment.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                    <span>{fragment.kind.toUpperCase()}</span>
                    <span>{fragment.project}</span>
                    <span>{fragment.source}</span>
                    <span>{fragment.created_at}</span>
                  </div>
                </div>
                <button
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  type="button"
                  aria-label="자료 삭제"
                  onClick={() => onDeleteFragment(fragment.id)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
