"use client";

import type { GraphNode } from "@/lib/mockData";

export type GraphFilter = "all" | GraphNode["category"];

const filters: { label: string; value: GraphFilter }[] = [
  { label: "All", value: "all" },
  { label: "Projects", value: "project" },
  { label: "Concepts", value: "concept" },
  { label: "Sources", value: "source" },
  { label: "Tasks", value: "task" }
];

type GraphFiltersProps = {
  activeFilter: GraphFilter;
  onChange: (filter: GraphFilter) => void;
};

export function GraphFilters({ activeFilter, onChange }: GraphFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <button
          key={filter.value}
          className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
            activeFilter === filter.value
              ? "border-ink bg-ink text-white shadow-card"
              : "border-line bg-white text-slate-600 hover:border-slate-300 hover:text-ink"
          }`}
          type="button"
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
