import type { FormEvent } from "react";
import { useState } from "react";
import { Copy, FileAudio, FileImage, FileText, Link2, Mic2, NotebookText, Plus, Sparkles, Trash2 } from "lucide-react";
import type { CreateFragmentPayload, Fragment, FragmentKind } from "../types";
import { MarkdownComposer } from "./MarkdownComposer";
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

const recordingSummaryPrompt = `아래 녹음 내용을 PiecePool에 저장하기 좋은 지식 조각 형태로 정리해줘.

정리 형식:
1. 한 줄 요약
2. 핵심 주제 3~5개
3. 중요한 내용 bullet point
4. 결정된 사항
5. 해야 할 일 / 액션 아이템
6. 나중에 다시 확인할 질문
7. 관련 키워드 또는 태그 후보

조건:
- 불필요한 말버릇과 반복은 제거해줘.
- 원문의 의미는 바꾸지 말아줘.
- 추측한 내용은 “추측”이라고 표시해줘.
- 나중에 Notion이나 PiecePool에 붙여넣기 좋게 Markdown 형식으로 정리해줘.`;

function makeRecordingSummaryTitle(summary: string) {
  const firstUsefulLine = summary
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^\d+\.\s*/, "").trim())
    .find((line) => line.length > 0);

  if (!firstUsefulLine) return "녹음 요약본";

  return firstUsefulLine.length > 48 ? `${firstUsefulLine.slice(0, 48)}...` : firstUsefulLine;
}

export function InboxView({
  fragments,
  projectOptions,
  onCreateFragment,
  onDeleteFragment
}: {
  fragments: Fragment[];
  projectOptions: string[];
  onCreateFragment: (payload: CreateFragmentPayload) => Promise<void>;
  onDeleteFragment: (fragmentId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateFragmentPayload>(emptyForm);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordingSummary, setRecordingSummary] = useState("");
  const [recordingProject, setRecordingProject] = useState(projectOptions[0] ?? "미분류");
  const [recordingSaving, setRecordingSaving] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [promptMessage, setPromptMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

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

  const copyRecordingPrompt = async () => {
    setPromptMessage(null);

    try {
      await navigator.clipboard.writeText(recordingSummaryPrompt);
      setPromptMessage({ tone: "success", text: "프롬프트를 복사했습니다." });
    } catch {
      setPromptMessage({ tone: "error", text: "복사하지 못했습니다. 프롬프트를 직접 선택해 복사하세요." });
    }
  };

  const saveRecordingSummary = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedSummary = recordingSummary.trim();

    if (!trimmedSummary) {
      setRecordingMessage({ tone: "error", text: "붙여넣은 요약 내용이 있어야 저장할 수 있습니다." });
      return;
    }

    setRecordingSaving(true);
    setRecordingMessage(null);

    try {
      await onCreateFragment({
        title: makeRecordingSummaryTitle(trimmedSummary),
        kind: "text",
        source: "recording-summary",
        project: recordingProject.trim() || "미분류",
        summary: trimmedSummary
      });
      setRecordingSummary("");
      setRecordingMessage({ tone: "success", text: "녹음 요약본을 Inbox에 저장했습니다." });
    } catch {
      setRecordingMessage({ tone: "error", text: "저장하지 못했습니다. 잠시 뒤 다시 시도하세요." });
    } finally {
      setRecordingSaving(false);
    }
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
            Add Piece
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
            <div className="mt-3">
              <MarkdownComposer
                value={form.summary}
                onChange={(summary) => setForm((current) => ({ ...current, summary }))}
                placeholder="본문 일부, 요약, 체크리스트, 코드 블록을 작성하세요."
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
              <span className="rounded-full bg-mist px-2.5 py-1"># 제목</span>
              <span className="rounded-full bg-mist px-2.5 py-1">- 목록</span>
              <span className="rounded-full bg-mist px-2.5 py-1">- [ ] 체크</span>
              <span className="rounded-full bg-mist px-2.5 py-1">``` 코드</span>
            </div>
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
                  list="project-options"
                  className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool"
                  value={form.project}
                  onChange={(event) => setForm((current) => ({ ...current, project: event.target.value }))}
                />
                <datalist id="project-options">
                  {projectOptions.map((project) => (
                    <option key={project} value={project} />
                  ))}
                </datalist>
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

      <Panel>
        <form onSubmit={saveRecordingSummary}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-pool">
                <Mic2 size={17} />
                <p className="text-xs font-black uppercase tracking-[0.16em]">Import Recording Summary</p>
              </div>
              <h2 className="mt-2 text-lg font-black text-ink">녹음 요약본 가져오기</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                외부 녹음 요약 도구에서 사용할 수 있는 프롬프트를 복사한 뒤, 생성된 요약 결과를 여기에 붙여넣어 Inbox에
                저장하세요. PiecePool은 Alt, Notion 등 외부 서비스와 공식적으로 제휴하거나 연동된 서비스가 아닙니다.
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-black text-ink transition hover:bg-mist"
              type="button"
              onClick={copyRecordingPrompt}
            >
              <Copy size={16} />
              프롬프트 복사
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-mist p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-black text-ink">추천 프롬프트</p>
              {promptMessage ? (
                <p className={`text-xs font-bold ${promptMessage.tone === "success" ? "text-emerald-700" : "text-red-600"}`}>
                  {promptMessage.text}
                </p>
              ) : null}
            </div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 text-sm leading-6 text-slate-700 ring-1 ring-line">
              {recordingSummaryPrompt}
            </pre>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Generated summary</span>
              <textarea
                className="mt-2 min-h-56 w-full resize-y rounded-lg border border-line bg-white px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pool"
                placeholder="외부 도구에서 만든 Markdown 요약본을 여기에 붙여넣으세요."
                value={recordingSummary}
                onChange={(event) => {
                  setRecordingSummary(event.target.value);
                  if (recordingMessage?.tone === "error") setRecordingMessage(null);
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Project</span>
              <input
                list="recording-project-options"
                className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-pool"
                value={recordingProject}
                onChange={(event) => setRecordingProject(event.target.value)}
              />
              <datalist id="recording-project-options">
                {projectOptions.map((project) => (
                  <option key={project} value={project} />
                ))}
              </datalist>
              <div className="mt-3 rounded-lg bg-mist p-3 text-xs font-semibold leading-5 text-slate-500">
                저장 시 type은 Text, source는 recording-summary로 기록됩니다.
              </div>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              {recordingMessage ? (
                <p className={`text-sm font-bold ${recordingMessage.tone === "success" ? "text-emerald-700" : "text-red-600"}`}>
                  {recordingMessage.text}
                </p>
              ) : null}
            </div>
            <button
              className="rounded-lg bg-pool px-4 py-2 text-sm font-black text-white shadow-card disabled:cursor-not-allowed disabled:bg-slate-300"
              type="submit"
              disabled={!recordingSummary.trim() || recordingSaving}
            >
              {recordingSaving ? "저장 중" : "Inbox에 저장"}
            </button>
          </div>
        </form>
      </Panel>

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
                    <StatusPill tone={fragment.status === "Organized" ? "green" : fragment.status === "Needs Review" ? "amber" : "pool"}>
                      {fragment.status}
                    </StatusPill>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{fragment.summary}</p>
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
