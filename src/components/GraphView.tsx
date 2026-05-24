import type { PointerEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Minus, Plus } from "lucide-react";
import type { GraphData, GraphNode } from "../types";
import { Panel } from "./Shell";

type Point = { x: number; y: number };
type DragState =
  | { type: "node"; id: string; offset: Point }
  | { type: "pan"; start: Point; origin: Point }
  | null;

const canvas = { width: 900, height: 620 };

const seedPositions: Record<string, Point> = {
  "fragment-os-pdf": { x: 170, y: 190 },
  "fragment-round-robin-note": { x: 240, y: 390 },
  "wiki-cpu": { x: 430, y: 280 },
  "project-os-midterm": { x: 650, y: 220 },
  "task-cpu-review": { x: 670, y: 430 }
};

function buildPositions(graph: GraphData): Record<string, Point> {
  const center = { x: 450, y: 310 };
  const radius = 220;

  return graph.nodes.reduce<Record<string, Point>>((positions, node, index) => {
    if (seedPositions[node.id]) {
      positions[node.id] = seedPositions[node.id];
      return positions;
    }

    const angle = (index / Math.max(1, graph.nodes.length)) * Math.PI * 2;
    positions[node.id] = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    };
    return positions;
  }, {});
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function GraphView({ graph }: { graph: GraphData }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [positions, setPositions] = useState<Record<string, Point>>(() => buildPositions(graph));
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<DragState>(null);
  const [selectedNodeId, setSelectedNodeId] = useState(graph.nodes[0]?.id ?? "");
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0];
  const degrees = useMemo(() => {
    const degreeMap = new Map<string, number>();
    graph.nodes.forEach((node) => degreeMap.set(node.id, 0));
    graph.edges.forEach((edge) => {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
    });
    return degreeMap;
  }, [graph.edges, graph.nodes]);
  const connectedIds = useMemo(() => {
    const ids = new Set([selectedNode?.id ?? ""]);
    graph.edges.forEach((edge) => {
      if (edge.source === selectedNode?.id) ids.add(edge.target);
      if (edge.target === selectedNode?.id) ids.add(edge.source);
    });
    return ids;
  }, [graph.edges, selectedNode]);

  useEffect(() => {
    setPositions((current) => ({ ...buildPositions(graph), ...current }));
    setSelectedNodeId((current) => (graph.nodes.some((node) => node.id === current) ? current : graph.nodes[0]?.id ?? ""));
  }, [graph]);

  const svgPoint = (event: PointerEvent<SVGSVGElement> | PointerEvent<SVGGElement> | WheelEvent<SVGSVGElement>): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const graphPoint = (event: PointerEvent<SVGSVGElement> | PointerEvent<SVGGElement> | WheelEvent<SVGSVGElement>): Point => {
    const point = svgPoint(event);
    return {
      x: (point.x - transform.x) / transform.scale,
      y: (point.y - transform.y) / transform.scale
    };
  };

  const startNodeDrag = (event: PointerEvent<SVGGElement>, nodeId: string) => {
    event.stopPropagation();
    const point = graphPoint(event);
    const position = positions[nodeId] ?? { x: 0, y: 0 };
    setSelectedNodeId(nodeId);
    setDrag({ type: "node", id: nodeId, offset: { x: point.x - position.x, y: point.y - position.y } });
  };

  const startPan = (event: PointerEvent<SVGSVGElement>) => {
    setDrag({ type: "pan", start: svgPoint(event), origin: { x: transform.x, y: transform.y } });
  };

  const moveGraph = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;

    if (drag.type === "node") {
      const point = graphPoint(event);
      setPositions((current) => ({
        ...current,
        [drag.id]: {
          x: point.x - drag.offset.x,
          y: point.y - drag.offset.y
        }
      }));
      return;
    }

    const point = svgPoint(event);
    setTransform((current) => ({
      ...current,
      x: drag.origin.x + point.x - drag.start.x,
      y: drag.origin.y + point.y - drag.start.y
    }));
  };

  const zoomAt = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const point = svgPoint(event);
    const before = graphPoint(event);
    const nextScale = clamp(transform.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.55, 2.4);

    setTransform({
      scale: nextScale,
      x: point.x - before.x * nextScale,
      y: point.y - before.y * nextScale
    });
  };

  const zoomBy = (factor: number) => {
    setTransform((current) => ({ ...current, scale: clamp(current.scale * factor, 0.55, 2.4) }));
  };

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
    setPositions(buildPositions(graph));
  };

  if (graph.nodes.length === 0 || graph.edges.length === 0) {
    return (
      <Panel className="grid min-h-[520px] place-items-center text-center">
        <div>
          <h3 className="text-xl font-black text-ink">아직 연결된 조각이 없습니다</h3>
          <p className="mt-2 text-sm text-slate-500">자료를 추가하고 연결을 승인하면 이곳에 그래프가 표시됩니다.</p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel className="overflow-hidden bg-[#1e1e1e] p-0">
        <div className="relative">
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white backdrop-blur hover:bg-white/20" type="button" onClick={() => zoomBy(1.15)} aria-label="확대">
              <Plus size={16} />
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white backdrop-blur hover:bg-white/20" type="button" onClick={() => zoomBy(0.85)} aria-label="축소">
              <Minus size={16} />
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white backdrop-blur hover:bg-white/20" type="button" onClick={resetView} aria-label="초기화">
              <LocateFixed size={16} />
            </button>
          </div>
          <svg
            ref={svgRef}
            className="h-[620px] w-full touch-none cursor-grab active:cursor-grabbing"
            viewBox={`0 0 ${canvas.width} ${canvas.height}`}
            aria-label="PiecePool graph"
            onPointerDown={startPan}
            onPointerMove={moveGraph}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => setDrag(null)}
            onWheel={zoomAt}
          >
            <rect width={canvas.width} height={canvas.height} fill="#1f1f1f" />
            <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
              {graph.edges.map((edge) => {
                const source = positions[edge.source];
                const target = positions[edge.target];
                const active = connectedIds.has(edge.source) && connectedIds.has(edge.target);

                if (!source || !target) return null;

                return (
                  <line
                    key={`${edge.source}-${edge.target}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={active ? "#b9b9b9" : "#555"}
                    strokeWidth={active ? 1.5 : 0.8}
                    opacity={active ? 0.78 : 0.34}
                  />
                );
              })}
              {graph.nodes.map((node) => {
                const position = positions[node.id] ?? { x: 400, y: 280 };
                const active = connectedIds.has(node.id);
                const selected = node.id === selectedNode?.id;
                const degree = degrees.get(node.id) ?? 0;
                const radius = selected ? 17 : clamp(8 + degree * 2.4, 9, 16);

                return (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(event) => startNodeDrag(event, node.id)}
                    className="cursor-pointer"
                  >
                    <circle cx={position.x} cy={position.y} r={radius + 13} fill="rgba(255,255,255,0.08)" opacity={active ? 1 : 0.22} />
                    <circle
                      cx={position.x}
                      cy={position.y}
                      r={radius}
                      fill={selected ? "#f0f0f0" : "#bdbdbd"}
                      opacity={active ? 1 : 0.36}
                      stroke={selected ? "#fff" : "#d6d6d6"}
                      strokeWidth={selected ? 2 : 1}
                    />
                    <text
                      x={position.x}
                      y={position.y + radius + 20}
                      fill={selected ? "#f4f4f4" : "#cfcfcf"}
                      fontSize="14"
                      textAnchor="middle"
                      className="select-none"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </Panel>
      <GraphDetail node={selectedNode} graph={graph} />
    </div>
  );
}

function GraphDetail({ node, graph }: { node?: GraphNode; graph: GraphData }) {
  if (!node) return null;

  const connected = graph.edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => graph.nodes.find((candidate) => candidate.id === (edge.source === node.id ? edge.target : edge.source)))
    .filter((candidate): candidate is GraphNode => Boolean(candidate));

  return (
    <Panel>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-pool">Node Detail</p>
      <h3 className="mt-3 text-xl font-black text-ink">{node.label}</h3>
      <p className="mt-2 text-sm capitalize text-slate-500">{node.category}</p>
      <p className="mt-4 text-sm leading-6 text-slate-600">{node.summary}</p>
      <div className="mt-5">
        <p className="text-sm font-black text-ink">연결된 조각</p>
        <div className="mt-3 space-y-2">
          {connected.map((item) => (
            <p key={item.id} className="rounded-lg bg-mist px-3 py-2 text-sm font-semibold text-slate-600">
              {item.label}
            </p>
          ))}
        </div>
      </div>
    </Panel>
  );
}
