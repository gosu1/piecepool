"use client";

import type { GraphEdge, GraphNode } from "@/lib/mockData";
import { ArrowRight, Network } from "lucide-react";

const typeLabel = {
  project: "프로젝트/목표",
  concept: "AI Wiki 개념",
  source: "업로드 자료",
  task: "오늘 할 일"
};

type GraphDetailPanelProps = {
  node: GraphNode;
  connectedNodes: GraphNode[];
  connectedEdges: GraphEdge[];
};

export function GraphDetailPanel({ node, connectedNodes, connectedEdges }: GraphDetailPanelProps) {
  const connectionSentence = buildConnectionSentence(node, connectedNodes);

  return (
    <aside className="rounded-lg border border-line bg-white p-5 shadow-card">
      <div className="flex items-center gap-2 text-pool">
        <Network size={18} />
        <p className="text-xs font-black uppercase tracking-[0.16em]">Node Detail</p>
      </div>

      <h2 className="mt-4 text-xl font-black leading-7 text-ink">{node.label}</h2>
      <span className="mt-3 inline-flex rounded-full bg-mist px-3 py-1 text-xs font-bold text-slate-600">
        Piece · {typeLabel[node.category]}
      </span>

      <p className="mt-4 text-sm leading-6 text-slate-600">{node.description}</p>
      {node.contentPreview ? (
        <div className="mt-4 rounded-lg border border-line bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">본문 일부</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{node.contentPreview}</p>
        </div>
      ) : null}

      <div className="mt-5 rounded-lg border border-line bg-mist p-4">
        <p className="text-sm font-bold text-ink">AI가 정리한 연결 의미</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{connectionSentence}</p>
      </div>

      <div className="mt-5">
        <p className="text-sm font-bold text-ink">연결된 노드</p>
        <div className="mt-3 space-y-2">
          {connectedNodes.map((connectedNode) => {
            const edge = connectedEdges.find(
              (candidate) =>
                (candidate.source === node.id && candidate.target === connectedNode.id) ||
                (candidate.target === node.id && candidate.source === connectedNode.id)
            );

            return (
              <div key={connectedNode.id} className="rounded-lg border border-line bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-ink">{connectedNode.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{typeLabel[connectedNode.category]}</p>
                  </div>
                  <ArrowRight className="shrink-0 text-slate-300" size={15} />
                </div>
                {edge?.label ? <p className="mt-2 text-xs font-semibold text-pool">{edge.label}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function buildConnectionSentence(node: GraphNode, connectedNodes: GraphNode[]) {
  const concepts = connectedNodes.filter((connectedNode) => connectedNode.category === "concept");
  const projects = connectedNodes.filter((connectedNode) => connectedNode.category === "project");
  const tasks = connectedNodes.filter((connectedNode) => connectedNode.category === "task");
  const sources = connectedNodes.filter((connectedNode) => connectedNode.category === "source");

  if (node.category === "source" && concepts[0]) {
    return `${node.label}는 ${concepts[0].label} 개념과 연결되어 있으며, PiecePool이 자료를 다시 사용할 수 있는 Wiki 단위로 재구성한 예시입니다.`;
  }

  if (node.category === "concept") {
    const projectText = projects[0] ? `${projects[0].label} 목표` : "프로젝트 목표";
    const taskText = tasks[0] ? `${tasks[0].label} 태스크` : "오늘 할 일";
    return `${node.label} 개념은 ${projectText}와 ${taskText} 사이를 이어 자료가 실제 학습 행동으로 이어지게 합니다.`;
  }

  if (node.category === "project" && concepts.length > 0) {
    return `${node.label}는 ${concepts.map((concept) => concept.label).join(", ")} 개념을 핵심 범위로 묶어 우선순위를 보여줍니다.`;
  }

  if (node.category === "task" && concepts[0]) {
    return `${node.label}는 ${concepts[0].label} 개념의 이해도와 목표 일정을 바탕으로 만든 mock 추천 할 일입니다.`;
  }

  if (sources.length > 0) {
    return `${node.label}는 ${sources.map((source) => source.label).join(", ")} 자료에서 이어진 학습 흐름 안에 있습니다.`;
  }

  return `${node.label}는 PiecePool 그래프 안에서 자료, 개념, 목표, 할 일을 연결하는 mock 노드입니다.`;
}
