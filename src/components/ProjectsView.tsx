import { useState } from "react";
import { ArrowUpRight, Save } from "lucide-react";
import type { Project, UpdateProjectPayload } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

export function ProjectsView({
  projects,
  onUpdateProject
}: {
  projects: Project[];
  onUpdateProject: (projectId: string, payload: UpdateProjectPayload) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {projects.length === 0 ? (
        <Panel className="grid min-h-52 place-items-center text-center lg:col-span-2">
          <div>
            <p className="text-lg font-black text-ink">아직 프로젝트가 없습니다</p>
            <p className="mt-2 text-sm text-slate-500">과목, 시험, 발표 목표가 생기면 이곳에서 진행률을 추적합니다.</p>
          </div>
        </Panel>
      ) : null}
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} onUpdateProject={onUpdateProject} />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  onUpdateProject
}: {
  project: Project;
  onUpdateProject: (projectId: string, payload: UpdateProjectPayload) => Promise<void>;
}) {
  const [progress, setProgress] = useState(project.progress);
  const [nextAction, setNextAction] = useState(project.next_action);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const changed = progress !== project.progress || nextAction !== project.next_action;

  const save = async () => {
    setSaving(true);
    await onUpdateProject(project.id, { progress, next_action: nextAction });
    setSaving(false);
  };

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-ink">{project.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{project.kind}</p>
        </div>
        <StatusPill tone="pool">{project.d_day}</StatusPill>
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-bold text-slate-600">다음 액션</span>
        <input
          className="mt-2 w-full rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool focus:bg-white"
          value={nextAction}
          onChange={(event) => setNextAction(event.target.value)}
        />
      </label>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-black text-slate-500">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <input
          className="mt-3 w-full accent-pool"
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(event) => setProgress(Number(event.target.value))}
        />
        <div className="mt-2 h-2 rounded-full bg-mist">
          <div className="h-2 rounded-full bg-pool" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button className="inline-flex items-center gap-1.5 text-xs font-black text-pool" type="button" onClick={() => setOpen((current) => !current)}>
          {open ? "접기" : "프로젝트 보기"}
          <ArrowUpRight size={14} />
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          type="button"
          disabled={!changed || saving}
          onClick={save}
        >
          <Save size={15} />
          {saving ? "저장 중" : "저장"}
        </button>
      </div>

      {open ? (
        <div className="mt-5 rounded-lg border border-line bg-mist p-4 text-sm leading-6 text-slate-600">
          <p>
            <strong className="text-ink">{project.title}</strong>는 {project.kind} 목표이며 현재 {progress}% 진행 중입니다.
          </p>
          <p className="mt-2">다음으로 처리할 작업은 “{nextAction}”입니다.</p>
        </div>
      ) : null}
    </Panel>
  );
}
