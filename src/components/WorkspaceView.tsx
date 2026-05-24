import type { FormEvent } from "react";
import { useState } from "react";
import { AudioLines, Bot, Camera, File, FileText, Link2, Network, Plus, ShieldCheck } from "lucide-react";
import type { CreateFragmentPayload, Fragment, FragmentKind, GraphData, Project, StudyTask, ViewKey } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

const captureActions: Array<{ kind: FragmentKind; label: string; source: string; icon: typeof FileText }> = [
  { kind: "text", label: "Text Note", source: "Quick Capture", icon: FileText },
  { kind: "pdf", label: "File", source: "Local File", icon: File },
  { kind: "image", label: "Image", source: "Camera Roll", icon: Camera },
  { kind: "audio", label: "Audio", source: "Voice Memo", icon: AudioLines },
  { kind: "link", label: "Link", source: "Saved Link", icon: Link2 }
];

export function WorkspaceView({
  workspaceName,
  fragments,
  tasks,
  projects,
  graph,
  apiOnline,
  onCreateFragment,
  onChangeView
}: {
  workspaceName: string;
  fragments: Fragment[];
  tasks: StudyTask[];
  projects: Project[];
  graph: GraphData;
  apiOnline: boolean;
  onCreateFragment: (payload: CreateFragmentPayload) => Promise<void>;
  onChangeView: (view: ViewKey) => void;
}) {
  const [selectedKind, setSelectedKind] = useState<FragmentKind>("text");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const organized = fragments.filter((fragment) => fragment.status === "Organized" || fragment.status.includes("완료")).length;
  const needsReview = fragments.filter((fragment) => fragment.status === "Needs Review" || fragment.status.includes("필요")).length;
  const activeProject = [...projects].sort((a, b) => a.progress - b.progress)[0];
  const nextTask = tasks.find((task) => !task.done);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const action = captureActions.find((item) => item.kind === selectedKind) ?? captureActions[0];

    setSaving(true);
    await onCreateFragment({
      title: note.trim() || `${action.label} from Workspace`,
      kind: action.kind,
      source: action.source,
      project: activeProject?.title ?? "미분류",
      summary: note.trim() || "Quick Capture에서 추가한 로컬 조각입니다."
    });
    setSaving(false);
    setNote("");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel className="bg-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-pool">
                <ShieldCheck size={18} />
                <p className="text-xs font-black uppercase tracking-[0.16em]">Workspace Status</p>
              </div>
              <h2 className="mt-3 text-2xl font-black text-ink">{workspaceName}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                저장 위치는 Local Device입니다. 현재 MVP는 실제 파일 시스템 API 없이도 내 기기 중심의 정보 정리 흐름을 먼저 보여줍니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone="green">{apiOnline ? "Offline Ready" : "Preview Data"}</StatusPill>
              <StatusPill tone="pool">Local-first</StatusPill>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Metric label="Local Pieces" value={fragments.length} />
            <Metric label="Organized" value={organized} />
            <Metric label="Needs Review" value={needsReview} />
            <Metric label="Projects" value={projects.length} />
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-2 text-pool">
            <Bot size={18} />
            <p className="text-xs font-black uppercase tracking-[0.16em]">AI Today</p>
          </div>
          <div className="mt-4 space-y-3">
            <TodayItem label="오늘 할 일" value={nextTask?.title ?? "오늘 계획이 비어 있습니다"} onClick={() => onChangeView("plan")} />
            <TodayItem label="복습 필요" value={needsReview > 0 ? `검토 필요한 자료 ${needsReview}개` : "검토 대기 자료 없음"} onClick={() => onChangeView("inbox")} />
            <TodayItem label="마감 임박" value={activeProject ? `${activeProject.title} · ${activeProject.d_day}` : "추적 중인 프로젝트 없음"} onClick={() => onChangeView("projects")} />
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-lg font-black text-ink">Quick Capture</p>
            <p className="mt-1 text-sm text-slate-500">데스크톱과 모바일에서 빠르게 조각을 추가하는 공통 진입점입니다.</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white" type="button" onClick={() => onChangeView("inbox")}>
            <Plus size={16} />
            Open Inbox
          </button>
        </div>
        <form className="mt-4" onSubmit={submit}>
          <div className="grid gap-2 sm:grid-cols-5">
            {captureActions.map((action) => {
              const Icon = action.icon;
              const selected = selectedKind === action.kind;

              return (
                <button
                  key={action.kind}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-black transition ${
                    selected ? "border-ink bg-ink text-white" : "border-line bg-mist text-slate-600 hover:bg-slate-100"
                  }`}
                  type="button"
                  onClick={() => setSelectedKind(action.kind)}
                >
                  <Icon size={16} />
                  {action.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <input
              className="min-h-11 flex-1 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-pool"
              placeholder="빠르게 저장할 메모, 링크, 파일 설명을 입력하세요."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <button className="rounded-lg bg-pool px-5 py-3 text-sm font-black text-white disabled:bg-slate-300" type="submit" disabled={saving}>
              {saving ? "Saving" : "Capture"}
            </button>
          </div>
        </form>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-black text-ink">Local Pieces Inbox</p>
            <button className="text-xs font-black text-pool" type="button" onClick={() => onChangeView("inbox")}>
              View all
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {fragments.slice(0, 4).map((fragment) => (
              <div key={fragment.id} className="rounded-lg border border-line bg-mist px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-black text-ink">{fragment.title}</p>
                  <StatusPill tone={fragment.status === "Organized" ? "green" : fragment.status === "Needs Review" ? "amber" : "pool"}>
                    {fragment.status}
                  </StatusPill>
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                  {fragment.kind.toUpperCase()} · {fragment.project} · {fragment.source}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-pool">
              <Network size={18} />
              <p className="text-lg font-black text-ink">Graph Preview</p>
            </div>
            <button className="text-xs font-black text-pool" type="button" onClick={() => onChangeView("graph")}>
              Open graph
            </button>
          </div>
          <div className="mt-4 rounded-lg bg-[#1f1f1f] p-4">
            <svg className="h-48 w-full" viewBox="0 0 520 220" aria-label="Graph preview">
              <rect width="520" height="220" fill="#1f1f1f" />
              {graph.edges.slice(0, 5).map((edge, index) => {
                const x1 = 70 + index * 78;
                const y1 = index % 2 === 0 ? 70 : 145;
                const x2 = 155 + index * 68;
                const y2 = index % 2 === 0 ? 132 : 82;

                return <line key={`${edge.source}-${edge.target}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#666" strokeWidth="1" />;
              })}
              {graph.nodes.slice(0, 8).map((node, index) => {
                const x = 70 + (index % 4) * 120;
                const y = index < 4 ? 72 : 150;
                return (
                  <g key={node.id}>
                    <circle cx={x} cy={y} r={node.category === "concept" ? 11 : 8} fill="#cfcfcf" />
                    <text x={x} y={y + 25} fill="#d7d7d7" fontSize="11" textAnchor="middle">
                      {node.label.slice(0, 16)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-mist p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
    </div>
  );
}

function TodayItem({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button className="block w-full rounded-lg bg-mist px-3 py-3 text-left transition hover:bg-slate-100" type="button" onClick={onClick}>
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </button>
  );
}
