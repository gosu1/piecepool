"use client";

import { useMemo, useState } from "react";
import { Brain, CalendarClock, Check, ChevronDown, FileText, Hash, ListTodo, Sparkles } from "lucide-react";

const starterBlocks = [
  "운영체제 수업에서 CPU Scheduling 계산 문제가 중요하다고 했다.",
  "Round Robin은 time quantum에 따라 context switching overhead가 달라진다.",
  "시험 전에 FCFS, SJF, RR 예제를 하나씩 다시 풀어봐야 한다."
];

export function InboxEditor() {
  const [title, setTitle] = useState("운영체제 CPU Scheduling 메모");
  const [project, setProject] = useState("운영체제");
  const [content, setContent] = useState(starterBlocks.join("\n\n"));
  const [saved, setSaved] = useState(false);

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content]
  );

  const handleSave = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-h-[760px] rounded-lg border border-line bg-white shadow-card">
        <div className="border-b border-line px-5 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
              <span>Inbox</span>
              <span>/</span>
              <span>Text Note</span>
              <span className="rounded-full bg-pool/10 px-2 py-0.5 font-bold text-pool">Mock draft</span>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white shadow-card transition hover:bg-slate-800"
              type="button"
              onClick={handleSave}
            >
              {saved ? <Check size={16} /> : <Sparkles size={16} />}
              {saved ? "Inbox에 저장됨" : "Inbox에 저장"}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-lg bg-mist text-4xl shadow-card">
            🧠
          </div>

          <textarea
            className="min-h-24 w-full resize-none border-none bg-transparent text-4xl font-black leading-tight tracking-normal text-ink outline-none placeholder:text-slate-300 sm:text-5xl"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="제목 없음"
          />

          <div className="mt-6 grid gap-3 rounded-lg border border-line bg-mist p-4 text-sm sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 shadow-card">
              <span className="inline-flex items-center gap-2 font-bold text-slate-500">
                <FileText size={15} />
                Project
              </span>
              <select
                className="bg-transparent text-right font-bold text-ink outline-none"
                value={project}
                onChange={(event) => setProject(event.target.value)}
              >
                <option>운영체제</option>
                <option>딥러닝</option>
                <option>창업 아이디어</option>
              </select>
            </label>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 shadow-card">
              <span className="inline-flex items-center gap-2 font-bold text-slate-500">
                <Hash size={15} />
                Type
              </span>
              <span className="font-bold text-ink">텍스트 메모</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 shadow-card">
              <span className="inline-flex items-center gap-2 font-bold text-slate-500">
                <CalendarClock size={15} />
                Created
              </span>
              <span className="font-bold text-ink">오늘</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 shadow-card">
              <span className="inline-flex items-center gap-2 font-bold text-slate-500">
                <ListTodo size={15} />
                Words
              </span>
              <span className="font-bold text-ink">{wordCount}</span>
            </div>
          </div>

          <div className="mt-10">
            <textarea
              className="min-h-[360px] w-full resize-none border-none bg-transparent text-lg leading-9 text-slate-700 outline-none placeholder:text-slate-300"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="자료, 생각, 수업 필기, 링크 맥락을 자유롭게 적어보세요. / 를 눌러 블록을 추가하는 느낌의 MVP입니다."
            />
          </div>

          <div className="mt-6 rounded-lg border border-dashed border-line bg-mist px-4 py-3 text-sm text-slate-500">
            <span className="font-bold text-slate-700">/</span> 요약, 할 일, 예상문제, 개념 카드 같은 블록으로 확장될 예정입니다.
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-line bg-white p-5 shadow-card">
          <div className="flex items-center gap-2 text-pool">
            <Brain size={18} />
            <p className="text-xs font-black uppercase tracking-[0.16em]">AI Preview</p>
          </div>
          <h2 className="mt-4 text-lg font-black text-ink">이 글은 이렇게 정리됩니다</h2>
          <div className="mt-4 space-y-3">
            <PreviewRow label="분류" value={project} />
            <PreviewRow label="생성 Wiki" value="CPU Scheduling" />
            <PreviewRow label="연결 목표" value="운영체제 중간고사" />
            <PreviewRow label="추천 할 일" value="Round Robin 예제 복습" />
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-5 shadow-card">
          <button
            className="flex w-full items-center justify-between rounded-lg bg-mist px-3 py-2 text-left text-sm font-bold text-ink"
            type="button"
          >
            작성 가이드
            <ChevronDown size={16} />
          </button>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>수업에서 들은 말, 헷갈린 개념, 시험 힌트를 한 페이지에 적습니다.</li>
            <li>정리 형식을 고민하지 않고 먼저 Inbox에 넣는 흐름을 보여줍니다.</li>
            <li>저장 후 AI가 Wiki, Graph, 할 일로 재사용한다는 컨셉을 시각화합니다.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-mist p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
