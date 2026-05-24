"use client";

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { GraphDetailPanel } from "@/components/GraphDetailPanel";
import { graphEdges, graphNodes, type GraphEdge, type GraphNode } from "@/lib/mockData";
import { Maximize2, Minus, MousePointer2, Plus } from "lucide-react";

type NodePosition = {
  x: number;
  y: number;
};

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
} | null;

type PanState = {
  startX: number;
  startY: number;
  viewportX: number;
  viewportY: number;
} | null;

const initialNodePositions: Record<string, NodePosition> = {
  "source-os-pdf": { x: 210, y: 212 },
  "source-deadlock-photo": { x: 258, y: 390 },
  "source-dl-recording": { x: 470, y: 170 },
  "source-transformer-link": { x: 746, y: 438 },
  "concept-cpu": { x: 430, y: 322 },
  "concept-deadlock": { x: 536, y: 436 },
  "concept-attention": { x: 666, y: 300 },
  "project-os-midterm": { x: 572, y: 302 },
  "project-dl-presentation": { x: 828, y: 274 },
  "task-cpu-review": { x: 352, y: 548 },
  "task-deadlock-explain": { x: 706, y: 596 },
  "task-attention-quiz": { x: 948, y: 480 }
};

const nodeStyle = {
  source: {
    label: "Source",
    fill: "#B9B9B9",
    stroke: "#D4D4D4",
    glow: "rgba(255, 255, 255, 0.08)",
    radius: 7
  },
  concept: {
    label: "Concept",
    fill: "#CFCFCF",
    stroke: "#F1F1F1",
    glow: "rgba(255, 255, 255, 0.12)",
    radius: 10
  },
  project: {
    label: "Project",
    fill: "#D8D8D8",
    stroke: "#FFFFFF",
    glow: "rgba(255, 255, 255, 0.16)",
    radius: 13
  },
  task: {
    label: "Task",
    fill: "#AFAFAF",
    stroke: "#DCDCDC",
    glow: "rgba(255, 255, 255, 0.08)",
    radius: 7
  }
};

type GraphViewProps = {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
};

export function GraphView({ nodes = graphNodes, edges = graphEdges }: GraphViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0]?.id ?? "");
  const [positions, setPositions] = useState(() => buildInitialPositions(nodes));

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const hasGraphData = nodes.length > 0 && edges.length > 0;

  const connectedEdges = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    return edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id);
  }, [edges, selectedNode]);

  const connectedNodes = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    return connectedEdges
      .map((edge) => nodes.find((node) => node.id === (edge.source === selectedNode.id ? edge.target : edge.source)))
      .filter((node): node is GraphNode => Boolean(node));
  }, [connectedEdges, nodes, selectedNode]);

  const selectedConnectionIds = new Set([
    selectedNode?.id ?? "",
    ...connectedNodes.map((node) => node.id)
  ]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="rounded-lg border border-line bg-white p-5 shadow-card">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-lg font-black text-ink">Piece Graph</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              하나의 piece가 하나의 노드가 되고, piece 사이의 관계가 선으로 연결됩니다.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2 text-xs font-bold text-slate-500">
            <MousePointer2 size={14} />
            Drag to pan · Wheel to zoom · Drag node to move
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] shadow-inner">
          <div className="relative h-[760px] min-w-[720px]">
            {hasGraphData ? (
              <>
                <GraphControls />
                <div className="absolute left-5 top-5 z-10 flex flex-wrap gap-2">
                  <GraphLegend label="Source" color={nodeStyle.source.fill} />
                  <GraphLegend label="Concept" color={nodeStyle.concept.fill} />
                  <GraphLegend label="Project" color={nodeStyle.project.fill} />
                  <GraphLegend label="Task" color={nodeStyle.task.fill} />
                </div>
                <ObsidianGraphCanvas
                  edges={edges}
                  nodes={nodes}
                  onSelectNode={setSelectedNodeId}
                  positions={positions}
                  selectedConnectionIds={selectedConnectionIds}
                  selectedNodeId={selectedNode?.id ?? ""}
                  setPositions={setPositions}
                />
              </>
            ) : (
              <GraphEmptyState />
            )}
          </div>
        </div>
      </section>

      {selectedNode && hasGraphData ? (
        <GraphDetailPanel node={selectedNode} connectedNodes={connectedNodes} connectedEdges={connectedEdges} />
      ) : null}
    </div>
  );
}

type GraphCanvasProps = {
  edges: GraphEdge[];
  nodes: GraphNode[];
  onSelectNode: (nodeId: string) => void;
  positions: Record<string, NodePosition>;
  selectedConnectionIds: Set<string>;
  selectedNodeId: string;
  setPositions: Dispatch<SetStateAction<Record<string, NodePosition>>>;
};

function ObsidianGraphCanvas({
  edges,
  nodes,
  onSelectNode,
  positions,
  selectedConnectionIds,
  selectedNodeId,
  setPositions
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [panState, setPanState] = useState<PanState>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });

  const getSvgPointFromClient = (clientX: number, clientY: number) => {
    const svg = svgRef.current;

    if (!svg) {
      return { x: 0, y: 0 };
    }

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());

    return {
      x: transformed.x,
      y: transformed.y
    };
  };

  const getGraphPointFromClient = (clientX: number, clientY: number) => {
    const point = getSvgPointFromClient(clientX, clientY);

    return {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale
    };
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    const nextScale = clamp(viewport.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.45, 2.4);
    const graphPoint = {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale
    };

    setViewport({
      scale: nextScale,
      x: point.x - graphPoint.x * nextScale,
      y: point.y - graphPoint.y * nextScale
    });
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    const point = getSvgPointFromClient(event.clientX, event.clientY);

    event.currentTarget.setPointerCapture(event.pointerId);
    setPanState({
      startX: point.x,
      startY: point.y,
      viewportX: viewport.x,
      viewportY: viewport.y
    });
  };

  const handleNodePointerDown = (event: React.PointerEvent<SVGGElement>, nodeId: string) => {
    const position = positions[nodeId];
    const point = getGraphPointFromClient(event.clientX, event.clientY);

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectNode(nodeId);
    setDragState({
      nodeId,
      offsetX: point.x - position.x,
      offsetY: point.y - position.y
    });
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragState) {
      const point = getGraphPointFromClient(event.clientX, event.clientY);

      setPositions((currentPositions) => ({
        ...currentPositions,
        [dragState.nodeId]: {
          x: clamp(point.x - dragState.offsetX, 40, 1080),
          y: clamp(point.y - dragState.offsetY, 40, 720)
        }
      }));

      return;
    }

    if (panState) {
      const point = getSvgPointFromClient(event.clientX, event.clientY);

      setViewport((currentViewport) => ({
        ...currentViewport,
        x: panState.viewportX + point.x - panState.startX,
        y: panState.viewportY + point.y - panState.startY
      }));
    }
  };

  const stopInteraction = () => {
    setDragState(null);
    setPanState(null);
  };

  const zoomBy = (factor: number) => {
    setViewport((currentViewport) => ({
      ...currentViewport,
      scale: clamp(currentViewport.scale * factor, 0.45, 2.4)
    }));
  };

  const resetView = () => {
    setViewport({ x: 0, y: 0, scale: 1 });
  };

  return (
    <>
      <div className="absolute right-5 top-5 z-10 flex overflow-hidden rounded-lg border border-white/10 bg-black/30 backdrop-blur">
        <button className="grid h-9 w-9 place-items-center text-zinc-200 hover:bg-white/10" type="button" onClick={() => zoomBy(1.15)} aria-label="Zoom in">
          <Plus size={15} />
        </button>
        <button className="grid h-9 w-9 place-items-center border-l border-white/10 text-zinc-200 hover:bg-white/10" type="button" onClick={() => zoomBy(0.85)} aria-label="Zoom out">
          <Minus size={15} />
        </button>
        <button className="grid h-9 w-9 place-items-center border-l border-white/10 text-zinc-200 hover:bg-white/10" type="button" onClick={resetView} aria-label="Reset graph view">
          <Maximize2 size={15} />
        </button>
      </div>

      <svg
        ref={svgRef}
        className={`absolute inset-0 h-full w-full touch-none ${dragState ? "cursor-grabbing" : panState ? "cursor-grabbing" : "cursor-grab"}`}
        viewBox="0 0 1120 760"
        role="img"
        aria-label="PiecePool Graph View"
        onPointerMove={handlePointerMove}
        onPointerUp={stopInteraction}
        onPointerCancel={stopInteraction}
        onPointerLeave={stopInteraction}
        onWheel={handleWheel}
      >
        <defs>
          <radialGradient id="graph-bg" cx="52%" cy="46%" r="70%">
            <stop offset="0%" stopColor="#252525" />
            <stop offset="62%" stopColor="#202020" />
            <stop offset="100%" stopColor="#1B1B1B" />
          </radialGradient>
        </defs>
        <rect fill="url(#graph-bg)" height="760" width="1120" onPointerDown={handleBackgroundPointerDown} />

        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
          {edges.map((edge) => {
            const sourceNode = nodes.find((node) => node.id === edge.source);
            const targetNode = nodes.find((node) => node.id === edge.target);
            const sourcePosition = positions[edge.source];
            const targetPosition = positions[edge.target];

            if (!sourceNode || !targetNode || !sourcePosition || !targetPosition) {
              return null;
            }

            const isConnected = selectedConnectionIds.has(sourceNode.id) && selectedConnectionIds.has(targetNode.id);
            const stroke = isConnected ? "#9A9A9A" : "#5F5F5F";
            const opacity = selectedNodeId && !isConnected ? 0.22 : 0.48;

            return (
              <g key={`${edge.source}-${edge.target}`} opacity={opacity}>
                <line
                  stroke={stroke}
                  strokeLinecap="round"
                  strokeWidth={isConnected ? 1.35 : 0.8}
                  x1={sourcePosition.x}
                  x2={targetPosition.x}
                  y1={sourcePosition.y}
                  y2={targetPosition.y}
                />
                {edge.label && isConnected ? (
                  <text
                    fill="#A8A8A8"
                    fontSize="10"
                    fontWeight="500"
                    textAnchor="middle"
                    x={(sourcePosition.x + targetPosition.x) / 2}
                    y={(sourcePosition.y + targetPosition.y) / 2 - 8}
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {nodes.map((node) => {
            const position = positions[node.id];
            const style = nodeStyle[node.category];
            const isSelected = node.id === selectedNodeId;
            const isConnected = selectedConnectionIds.has(node.id);
            const opacity = selectedConnectionIds.size > 1 && !isConnected ? 0.24 : 1;
            const connectionCount = edges.filter((edge) => edge.source === node.id || edge.target === node.id).length;
            const radius = (isSelected ? style.radius + 4 : style.radius) + Math.min(connectionCount, 4);

            return (
              <g
                key={node.id}
                className={dragState?.nodeId === node.id ? "cursor-grabbing" : "cursor-grab"}
                opacity={opacity}
                onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onSelectNode(node.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <circle cx={position.x} cy={position.y} fill={style.glow} r={radius + 12} />
                <circle
                  cx={position.x}
                  cy={position.y}
                  fill={style.fill}
                  r={radius}
                  stroke={isSelected ? "#FFFFFF" : style.stroke}
                  strokeWidth={isSelected ? 2 : 0.9}
                />
                <text
                  fill={isSelected ? "#F4F4F4" : "#C8C8C8"}
                  fontSize={node.category === "project" || node.category === "concept" ? "15" : "14"}
                  fontWeight={isSelected ? "600" : "400"}
                  textAnchor="middle"
                  x={position.x}
                  y={position.y + radius + 20}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </>
  );
}

function GraphControls() {
  return null;
}

function GraphLegend({ label, color }: { label: string; color: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-zinc-300 backdrop-blur">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function GraphEmptyState() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300">
          <MousePointer2 size={22} />
        </div>
        <h3 className="mt-5 text-lg font-black text-zinc-100">아직 연결된 piece가 없습니다</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Inbox에 자료를 추가하거나 piece 사이의 관계가 생기면 이곳에 노드와 연결선이 표시됩니다.
        </p>
      </div>
    </div>
  );
}

function buildInitialPositions(nodes: GraphNode[]) {
  if (nodes.length === 0) {
    return {};
  }

  return nodes.reduce<Record<string, NodePosition>>((positions, node, index) => {
    positions[node.id] =
      initialNodePositions[node.id] ??
      {
        x: 560 + Math.cos(index) * 240,
        y: 380 + Math.sin(index) * 180
      };

    return positions;
  }, {});
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
