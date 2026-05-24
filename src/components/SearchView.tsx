import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Fragment, Project, StudyTask, WikiConcept } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

export function SearchView({
  fragments,
  concepts,
  projects,
  tasks
}: {
  fragments: Fragment[];
  concepts: WikiConcept[];
  projects: Project[];
  tasks: StudyTask[];
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalized) return [];

    return [
      ...fragments
        .filter((item) => `${item.title} ${item.summary} ${item.project}`.toLowerCase().includes(normalized))
        .map((item) => ({ id: item.id, type: "Piece", title: item.title, body: item.summary })),
      ...concepts
        .filter((item) => `${item.title} ${item.summary} ${item.tags.join(" ")}`.toLowerCase().includes(normalized))
        .map((item) => ({ id: item.id, type: "Wiki", title: item.title, body: item.summary })),
      ...projects
        .filter((item) => `${item.title} ${item.kind} ${item.next_action}`.toLowerCase().includes(normalized))
        .map((item) => ({ id: item.id, type: "Project", title: item.title, body: item.next_action })),
      ...tasks
        .filter((item) => `${item.title} ${item.project} ${item.reason}`.toLowerCase().includes(normalized))
        .map((item) => ({ id: item.id, type: "Today", title: item.title, body: item.reason }))
    ];
  }, [concepts, fragments, normalized, projects, tasks]);

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-mist px-4 py-3">
          <Search size={18} className="text-slate-400" />
          <input
            className="min-h-9 flex-1 bg-transparent text-base font-semibold text-ink outline-none placeholder:text-slate-400"
            placeholder="Search local pieces, wiki, projects, today..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p className="mt-3 text-sm text-slate-500">검색은 현재 로컬 Workspace 데이터 안에서만 수행됩니다.</p>
      </Panel>

      <div className="grid gap-3">
        {!normalized ? (
          <Panel className="grid min-h-52 place-items-center text-center">
            <div>
              <p className="text-lg font-black text-ink">로컬 검색</p>
              <p className="mt-2 text-sm text-slate-500">모바일에서는 자료 확인과 빠른 탐색을 위해 Search를 우선 노출합니다.</p>
            </div>
          </Panel>
        ) : null}
        {normalized && results.length === 0 ? (
          <Panel className="grid min-h-52 place-items-center text-center">
            <div>
              <p className="text-lg font-black text-ink">검색 결과가 없습니다</p>
              <p className="mt-2 text-sm text-slate-500">다른 키워드로 로컬 Workspace를 다시 검색하세요.</p>
            </div>
          </Panel>
        ) : null}
        {results.map((result) => (
          <Panel key={`${result.type}-${result.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="pool">{result.type}</StatusPill>
              <h3 className="text-base font-black text-ink">{result.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{result.body}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
