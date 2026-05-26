import type { PointerEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Minus, Plus, X } from "lucide-react";
import type { GraphData, GraphNode } from "../types";
import { Panel } from "./Shell";
import { StatusPill } from "./StatusPill";

type Point = { x: number; y: number };
type DragState =
  | { type: "node"; id: string; offset: Point }
  | { type: "pan"; start: Point; origin: Point }
  | null;

const canvas = { width: 1200, height: 760 };

const seedPositions: Record<string, Point> = {
  "fragment-os-pdf": { x: 280, y: 250 },
  "fragment-round-robin-note": { x: 315, y: 520 },
  "wiki-cpu": { x: 590, y: 385 },
  "project-os-midterm": { x: 900, y: 275 },
  "task-cpu-review": { x: 930, y: 530 }
};

function buildPositions(graph: GraphData): Record<string, Point> {
  const center = { x: canvas.width / 2, y: canvas.height / 2 };
  const radius = Math.min(canvas.width, canvas.height) * 0.33;

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
  const positionsRef = useRef<Record<string, Point>>(buildPositions(graph));
  const velocitiesRef = useRef<Record<string, Point>>({});
  const dragRef = useRef<DragState>(null);
  const animationRef = useRef<number | null>(null);

  const [positions, setPositions] = useState<Record<string, Point>>(() => positionsRef.current);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<DragState>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
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
    if (!selectedNode) return new Set<string>();

    const ids = new Set([selectedNode.id]);
    graph.edges.forEach((edge) => {
      if (edge.source === selectedNode.id) ids.add(edge.target);
      if (edge.target === selectedNode.id) ids.add(edge.source);
    });
    return ids;
  }, [graph.edges, selectedNode]);

  useEffect(() => {
    const nextPositions = { ...buildPositions(graph), ...positionsRef.current };
    graph.nodes.forEach((node) => {
      if (!velocitiesRef.current[node.id]) velocitiesRef.current[node.id] = { x: 0, y: 0 };
    });
    positionsRef.current = nextPositions;
    setPositions(nextPositions);
    setSelectedNodeId((current) => (graph.nodes.some((node) => node.id === current) ? current : ""));
  }, [graph]);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    const tick = () => {
      const nextPositions = positionsRef.current;
      const velocities = velocitiesRef.current;
      const forces: Record<string, Point> = {};
      const center = { x: canvas.width / 2, y: canvas.height / 2 };

      graph.nodes.forEach((node) => {
        forces[node.id] = { x: (center.x - nextPositions[node.id].x) * 0.0018, y: (center.y - nextPositions[node.id].y) * 0.0018 };
      });

      for (let i = 0; i < graph.nodes.length; i += 1) {
        for (let j = i + 1; j < graph.nodes.length; j += 1) {
          const a = graph.nodes[i];
          const b = graph.nodes[j];
          const pa = nextPositions[a.id];
          const pb = nextPositions[b.id];
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const distanceSquared = Math.max(120, dx * dx + dy * dy);
          const distance = Math.sqrt(distanceSquared);
          const force = 5200 / distanceSquared;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          forces[a.id].x -= fx;
          forces[a.id].y -= fy;
          forces[b.id].x += fx;
          forces[b.id].y += fy;
        }
      }

      graph.edges.forEach((edge) => {
        const source = nextPositions[edge.source];
        const target = nextPositions[edge.target];
        if (!source || !target) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const desired = 185;
        const strength = 0.012;
        const force = (distance - desired) * strength;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        forces[edge.source].x += fx;
        forces[edge.source].y += fy;
        forces[edge.target].x -= fx;
        forces[edge.target].y -= fy;
      });

      const now = performance.now() / 1000;
      graph.nodes.forEach((node, index) => {
        if (dragRef.current?.type === "node" && dragRef.current.id === node.id) return;

        const velocity = velocities[node.id] ?? { x: 0, y: 0 };
        const position = nextPositions[node.id];
        const organic = {
          x: Math.sin(now * 0.75 + index * 1.7) * 0.025,
          y: Math.cos(now * 0.6 + index * 1.3) * 0.025
        };

        velocity.x = (velocity.x + forces[node.id].x + organic.x) * 0.88;
        velocity.y = (velocity.y + forces[node.id].y + organic.y) * 0.88;
        position.x = clamp(position.x + velocity.x, 60, canvas.width - 60);
        position.y = clamp(position.y + velocity.y, 60, canvas.height - 60);
      });

      positionsRef.current = { ...nextPositions };
      setPositions(positionsRef.current);
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
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
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = graphPoint(event);
    const position = positionsRef.current[nodeId] ?? { x: 0, y: 0 };
    setSelectedNodeId(nodeId);
    velocitiesRef.current[nodeId] = { x: 0, y: 0 };
    setDrag({ type: "node", id: nodeId, offset: { x: point.x - position.x, y: point.y - position.y } });
  };

  const startPan = (event: PointerEvent<SVGSVGElement>) => {
    setDrag({ type: "pan", start: svgPoint(event), origin: { x: transform.x, y: transform.y } });
  };

  const moveGraph = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;

    if (drag.type === "node") {
      const point = graphPoint(event);
      const nextPosition = {
        x: clamp(point.x - drag.offset.x, 40, canvas.width - 40),
        y: clamp(point.y - drag.offset.y, 40, canvas.height - 40)
      };
      positionsRef.current = { ...positionsRef.current, [drag.id]: nextPosition };
      velocitiesRef.current[drag.id] = { x: 0, y: 0 };
      setPositions(positionsRef.current);
      return;
    }

    const point = svgPoint(event);
    setTransform((current) => ({
      ...current,
      x: drag.origin.x + point.x - drag.start.x,
      y: drag.origin.y + point.y - drag.start.y
    }));
  };

  const endDrag = () => {
    setDrag(null);
  };

  const zoomAt = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const point = svgPoint(event);
    const before = graphPoint(event);
    const nextScale = clamp(transform.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.45, 2.6);

    setTransform({
      scale: nextScale,
      x: point.x - before.x * nextScale,
      y: point.y - before.y * nextScale
    });
  };

  const zoomBy = (factor: number) => {
    setTransform((current) => ({ ...current, scale: clamp(current.scale * factor, 0.45, 2.6) }));
  };

  const resetView = () => {
    const resetPositions = buildPositions(graph);
    positionsRef.current = resetPositions;
    velocitiesRef.current = {};
    setPositions(resetPositions);
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  if (graph.nodes.length === 0) {
    return (
      <Panel className="grid min-h-[620px] place-items-center text-center">
        <div>
          <h3 className="text-xl font-black text-ink">아직 표시할 노드가 없습니다</h3>
          <p className="mt-2 text-sm text-slate-500">자료를 추가하면 연결 여부와 관계없이 이곳에 노드가 표시됩니다.</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden bg-[#1f1f1f] p-0">
      <div className="relative">
        <div className="absolute left-4 top-4 z-10 rounded-lg bg-black/25 px-3 py-2 text-xs font-semibold text-zinc-300 backdrop-blur">
          Drag nodes · Wheel to zoom · Click node for detail
        </div>
        <div className="absolute right-4 top-4 z-20 flex gap-2">
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

        {selectedNode ? (
          <GraphDetail node={selectedNode} graph={graph} onClose={() => setSelectedNodeId("")} />
        ) : null}

        <svg
          ref={svgRef}
          className="h-[calc(100vh-9.5rem)] min-h-[640px] w-full touch-none cursor-grab active:cursor-grabbing"
          viewBox={`0 0 ${canvas.width} ${canvas.height}`}
          aria-label="PiecePool graph"
          onPointerDown={startPan}
          onPointerMove={moveGraph}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          onWheel={zoomAt}
        >
          <rect width={canvas.width} height={canvas.height} fill="#1f1f1f" />
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {graph.edges.map((edge) => {
              const source = positions[edge.source];
              const target = positions[edge.target];
              const active = selectedNode ? connectedIds.has(edge.source) && connectedIds.has(edge.target) : true;

              if (!source || !target) return null;

              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={active ? "#8f8f8f" : "#4d4d4d"}
                  strokeWidth={active ? 1.3 : 0.7}
                  opacity={active ? 0.7 : 0.22}
                />
              );
            })}
            {graph.nodes.map((node) => {
              const position = positions[node.id] ?? { x: canvas.width / 2, y: canvas.height / 2 };
              const active = selectedNode ? connectedIds.has(node.id) : true;
              const selected = node.id === selectedNode?.id;
              const degree = degrees.get(node.id) ?? 0;
              const radius = selected ? 18 : clamp(8 + degree * 2.6, 9, 17);

              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => startNodeDrag(event, node.id)}
                  className="cursor-pointer"
                >
                  <circle cx={position.x} cy={position.y} r={radius + 18} fill="rgba(255,255,255,0.07)" opacity={selected ? 1 : active ? 0.75 : 0.08} />
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={radius}
                    fill={selected ? "#f2f2f2" : "#bdbdbd"}
                    opacity={active ? 1 : 0.25}
                    stroke={selected ? "#fff" : "#d8d8d8"}
                    strokeWidth={selected ? 2.4 : 1}
                  />
                  <text
                    x={position.x}
                    y={position.y + radius + 22}
                    fill={selected ? "#ffffff" : active ? "#d2d2d2" : "#777"}
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
  );
}

function GraphDetail({ node, graph, onClose }: { node: GraphNode; graph: GraphData; onClose: () => void }) {
  const connected = graph.edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => graph.nodes.find((candidate) => candidate.id === (edge.source === node.id ? edge.target : edge.source)))
    .filter((candidate): candidate is GraphNode => Boolean(candidate));

  return (
    <div className="absolute bottom-4 right-4 top-16 z-20 w-[min(22rem,calc(100%-2rem))] overflow-auto rounded-lg border border-white/10 bg-zinc-950/90 p-5 text-white shadow-soft backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Node Detail</p>
          <h3 className="mt-3 text-xl font-black text-white">{node.label}</h3>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-zinc-300 hover:bg-white/15" type="button" onClick={onClose} aria-label="닫기">
          <X size={16} />
        </button>
      </div>

      <div className="mt-3">
        <StatusPill tone="slate">{node.category}</StatusPill>
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-300">{node.summary}</p>

      <div className="mt-6">
        <p className="text-sm font-black text-white">연결된 노드</p>
        <div className="mt-3 space-y-2">
          {connected.length === 0 ? (
            <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-400">아직 직접 연결된 노드가 없습니다.</p>
          ) : null}
          {connected.map((item) => (
            <p key={item.id} className="rounded-lg bg-white/[0.07] px-3 py-2 text-sm font-semibold text-zinc-300">
              {item.label}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
