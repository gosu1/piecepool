import Link from "next/link";
import { wikiConcepts } from "@/lib/mockData";
import { BookOpen, Files, Gauge, Network } from "lucide-react";

export function WikiPanel() {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-ink">AI Wiki</p>
          <p className="mt-1 text-sm text-slate-500">자료를 개념 카드로 재구성한 학습 지식층</p>
        </div>
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-mist px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-pool hover:bg-white hover:text-pool"
          href="/graph"
        >
          <Network size={14} />
          Graph에서 보기
        </Link>
      </div>

      <div className="mt-5 grid gap-3">
        {wikiConcepts.map((concept) => (
          <article key={concept.id} className="rounded-lg border border-line bg-mist p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-ink">{concept.title}</h3>
                <p className="mt-1 text-xs font-semibold text-pool">{concept.project}</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-card">
                중요도 {concept.importance}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-600">{concept.summary}</p>

            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Gauge size={14} />
                이해도 {concept.mastery}%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Files size={14} />
                관련 자료 {concept.sources}개
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white">
              <div className="h-2 rounded-full bg-pool" style={{ width: `${concept.mastery}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
