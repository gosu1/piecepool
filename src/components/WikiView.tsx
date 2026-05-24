import { BookOpen, Files } from "lucide-react";
import type { Fragment, WikiConcept } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

export function WikiView({ concepts, fragments }: { concepts: WikiConcept[]; fragments: Fragment[] }) {
  const fragmentMap = new Map(fragments.map((fragment) => [fragment.id, fragment.title]));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {concepts.map((concept) => (
        <Panel key={concept.id}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-pool">
                <BookOpen size={18} />
                <p className="text-xs font-black uppercase tracking-[0.16em]">지식 페이지</p>
              </div>
              <h3 className="mt-3 text-xl font-black text-ink">{concept.title}</h3>
            </div>
            <StatusPill tone={concept.understanding < 65 ? "amber" : "pool"}>이해도 {concept.understanding}%</StatusPill>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-600">{concept.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {concept.tags.map((tag) => (
              <StatusPill key={tag}>{tag}</StatusPill>
            ))}
          </div>

          <div className="mt-5 rounded-lg bg-mist p-4">
            <div className="flex items-center gap-2 text-sm font-black text-ink">
              <Files size={16} />
              관련 조각 {concept.related_fragments.length}개
            </div>
            <div className="mt-3 space-y-2">
              {concept.related_fragments.map((fragmentId) => (
                <p key={fragmentId} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-card">
                  {fragmentMap.get(fragmentId) ?? fragmentId}
                </p>
              ))}
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
