import type { FormEvent } from "react";
import { useState } from "react";
import { ArrowUpRight, Bot, Plus, Trash2 } from "lucide-react";
import type { CreateProjectPayload, Project, ProjectGoal } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

const projectKinds = [
  "대학교 수업용",
  "대학교 프로젝트용",
  "운동",
  "시험/자격증",
  "독서/리서치",
  "개인 루틴",
  "기타/추후 확장"
];

const emptyProject = {
  title: "",
  kind: "대학교 수업용",
  d_day: "D-14",
  goalsText: "핵심 자료 모으기\n개념 정리하기\n결과물 또는 복습 계획 만들기"
};

const goalTone: Record<ProjectGoal["status"], "slate" | "pool" | "green"> = {
  not_started: "slate",
  in_progress: "pool",
  covered: "green"
};

const goalLabel: Record<ProjectGoal["status"], string> = {
  not_started: "대기",
  in_progress: "진행 중",
  covered: "반영됨"
};

export function ProjectsView({
  projects,
  onCreateProject,
  onDeleteProject
}: {
  projects: Project[];
  onCreateProject: (payload: CreateProjectPayload) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}) {
  const [form, setForm] = useState(emptyProject);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;

    setSaving(true);
    await onCreateProject({
      title: form.title.trim(),
      kind: form.kind,
      d_day: form.d_day.trim() || "상시",
      goals: form.goalsText
        .split("\n")
        .map((goal) => goal.trim())
        .filter(Boolean)
    });
    setSaving(false);
    setForm(emptyProject);
    setExpanded(false);
  };

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-lg font-black text-ink">프로젝트 목표</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              진행률은 사용자가 조작하지 않습니다. 자료가 프로젝트에 쌓이면 로컬 AI가 목표 커버리지를 기준으로 갱신합니다.
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white shadow-card"
            type="button"
            onClick={() => setExpanded((current) => !current)}
          >
            <Plus size={16} />
            프로젝트 만들기
          </button>
        </div>
      </Panel>

      {expanded ? (
        <Panel>
          <form onSubmit={submit}>
            <div className="flex items-center gap-2 text-pool">
              <Bot size={18} />
              <p className="text-xs font-black uppercase tracking-[0.16em]">AI tracked project</p>
            </div>
            <input
              className="mt-4 w-full border-0 bg-transparent text-2xl font-black text-ink outline-none placeholder:text-slate-300"
              placeholder="프로젝트 이름"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />

            <div className="mt-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Project option</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {projectKinds.map((kind) => (
                  <button
                    key={kind}
                    className={`rounded-lg px-3 py-2 text-xs font-black transition ${
                      form.kind === kind ? "bg-ink text-white" : "bg-mist text-slate-600 hover:bg-slate-100"
                    }`}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, kind }))}
                  >
                    {kind}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                대학교 수업, 대학교 프로젝트, 운동 외에도 사용 패턴에 따라 옵션은 계속 확장됩니다.
              </p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[9rem_minmax(0,1fr)]">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">D-day</span>
                <input
                  className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool"
                  value={form.d_day}
                  onChange={(event) => setForm((current) => ({ ...current, d_day: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Goals</span>
                <textarea
                  className="mt-2 min-h-28 w-full resize-none rounded-lg border border-line bg-mist px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pool focus:bg-white"
                  value={form.goalsText}
                  onChange={(event) => setForm((current) => ({ ...current, goalsText: event.target.value }))}
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
                {saving ? "생성 중" : "목표 생성"}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.length === 0 ? (
          <Panel className="grid min-h-52 place-items-center text-center lg:col-span-2">
            <div>
              <p className="text-lg font-black text-ink">아직 프로젝트가 없습니다</p>
              <p className="mt-2 text-sm text-slate-500">목표를 만들고 Inbox에서 자료를 추가하면 AI가 진행률을 추적합니다.</p>
            </div>
          </Panel>
        ) : null}
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} onDeleteProject={onDeleteProject} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onDeleteProject
}: {
  project: Project;
  onDeleteProject: (projectId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-ink">{project.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone="pool">{project.kind}</StatusPill>
            <StatusPill>{project.d_day}</StatusPill>
            <StatusPill tone="green">AI 추적</StatusPill>
          </div>
        </div>
        <button
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          type="button"
          aria-label="프로젝트 삭제"
          onClick={() => onDeleteProject(project.id)}
        >
          <Trash2 size={17} />
        </button>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-black text-slate-500">
          <span>AI progress</span>
          <span>{project.progress}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-mist">
          <div className="h-2 rounded-full bg-pool" style={{ width: `${project.progress}%` }} />
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{project.progress_note}</p>
      </div>

      <div className="mt-5 rounded-lg border border-line bg-mist p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-ink">목표 커버리지</p>
          <span className="text-xs font-bold text-slate-500">연결 자료 {project.evidence_count}개</span>
        </div>
        <div className="mt-3 space-y-2">
          {project.goals.map((goal) => (
            <div key={goal.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 shadow-card">
              <p className="min-w-0 text-sm font-semibold text-slate-700">{goal.title}</p>
              <StatusPill tone={goalTone[goal.status]}>{goalLabel[goal.status]}</StatusPill>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 text-sm font-bold text-slate-600">다음 액션: {project.next_action}</p>

      <button className="mt-5 inline-flex items-center gap-1.5 text-xs font-black text-pool" type="button" onClick={() => setOpen((current) => !current)}>
        {open ? "접기" : "프로젝트 보기"}
        <ArrowUpRight size={14} />
      </button>

      {open ? (
        <div className="mt-5 rounded-lg border border-line bg-mist p-4 text-sm leading-6 text-slate-600">
          <p>
            사용자는 이 진행률을 직접 조작하지 않습니다. 글, 사진, 수업 녹음본을 Inbox에 추가하고 프로젝트 이름을 연결하면 로컬 AI가
            목표별 반영 상태와 진행률을 다시 계산합니다.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
