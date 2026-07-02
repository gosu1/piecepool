// Promotion TTL 튜닝 시뮬레이터 — staging TTL(ttlRounds)을 실데이터/시나리오로 조정하는 미리보기.
// 실행(tsx, devDep):
//   npm run promote                                  # 기본 시나리오, ttls 2,3,5 비교
//   npm run promote -- --scenario path/to/rounds.json --ttls 2,3,5 --detail 3
//   npm run promote -- --rounds 12 --nodes 4 --seed 7 --ttls 2,3,4,6   # seeded 합성
//
// 라운드 간 노드 상태를 이월하고 그래프를 누적하며 promote()를 반복 호출.
// TTL별 최종 분포 + archivals(보관 전환) + lateRescues(뒤늦게 연결돼 구제된 staging)
// + revivals(archived→active 복구 = 그 TTL이 너무 짧았다는 직접 신호)를 표로 보여준다.
// 코어 게이트: src/llm/promote.ts. SSOT 설계: docs/30-llm/README.md §E.

import { readFileSync } from "node:fs";
import { promote, type CandidateNode, type NodeState, type PromoteEdge } from "../src/llm/promote";

type Round = { nodes: string[]; edges: [string, string][] };
type Scenario = { rounds: Round[] };
type Carried = { state: NodeState; stagingSinceRound?: number };

interface SimResult {
  perRound: Array<{ round: number; stats: Record<NodeState, number>; notable: string[] }>;
  final: Record<NodeState, number>;
  archivals: number; // staging → archived
  lateRescues: number; // staging → active (뒤늦은 연결로 구제)
  revivals: number; // archived → active (복구 = TTL 너무 짧음 신호)
}

// 시나리오를 주어진 ttl로 라운드별 재생. 상태는 이월, 엣지는 누적.
function simulate(scenario: Scenario, ttlRounds: number): SimResult {
  const carried = new Map<string, Carried>();
  const known = new Set<string>();
  const cumulativeEdges: PromoteEdge[] = [];
  const perRound: SimResult["perRound"] = [];
  let archivals = 0;
  let lateRescues = 0;
  let revivals = 0;

  scenario.rounds.forEach((rd, round) => {
    for (const id of rd.nodes) known.add(id);
    for (const [source, target] of rd.edges) cumulativeEdges.push({ source, target });

    const nodes: CandidateNode[] = [...known].map((id) => ({
      id,
      state: carried.get(id)?.state,
      stagingSinceRound: carried.get(id)?.stagingSinceRound,
    }));
    const r = promote(nodes, cumulativeEdges, { round, ttlRounds });

    const notable: string[] = [];
    for (const t of r.transitions) {
      if (t.from === "staging" && t.to === "archived") archivals++;
      if (t.from === "staging" && t.to === "active") lateRescues++;
      if (t.from === "archived" && t.to === "active") revivals++;
      if (t.to === "archived" || (t.from === "archived" && t.to === "active"))
        notable.push(`${t.id}: ${t.from}→${t.to}`);
    }
    for (const nn of r.nodes) carried.set(nn.id, { state: nn.state, stagingSinceRound: nn.stagingSinceRound });
    perRound.push({ round, stats: r.stats, notable });
  });

  const final = perRound.length ? perRound[perRound.length - 1].stats : { staging: 0, active: 0, archived: 0 };
  return { perRound, final, archivals, lateRescues, revivals };
}

function main(): void {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const ttls = (get("--ttls") ?? "2,3,5")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1);

  const scenario = loadScenario(get);
  console.log(`\n=== Promotion TTL Sim ===`);
  console.log(`라운드 ${scenario.rounds.length}개 | 노드 ${new Set(scenario.rounds.flatMap((r) => r.nodes)).size}개 | ttls ${ttls.join(", ")}`);

  // 상세: 지정 ttl(기본 첫 값) 라운드별 전개.
  const detailTtl = Number(get("--detail") ?? ttls[0]);
  const detail = simulate(scenario, detailTtl);
  console.log(`\n── 라운드 전개 (ttl=${detailTtl}) ──`);
  for (const r of detail.perRound) {
    const note = r.notable.length ? `   ← ${r.notable.join(", ")}` : "";
    console.log(`  r${r.round}: active ${r.stats.active} · staging ${r.stats.staging} · archived ${r.stats.archived}${note}`);
  }

  // 비교표: ttl별 최종 분포 + 신호.
  console.log(`\n── TTL 비교 ──`);
  const cell = (v: string | number, w = 10) => String(v).padEnd(w);
  console.log(cell("ttl") + cell("active") + cell("staging") + cell("archived") + cell("archivals") + cell("lateResc") + cell("revivals"));
  for (const ttl of ttls) {
    const s = simulate(scenario, ttl);
    console.log(
      cell(ttl) + cell(s.final.active) + cell(s.final.staging) + cell(s.final.archived) + cell(s.archivals) + cell(s.lateRescues) + cell(s.revivals),
    );
  }
  console.log(
    `\n해석: revivals>0 → 그 ttl은 짧다(구제될 노드를 먼저 archive 후 복구). ` +
      `staging 잔류↑ → ttl이 길어 noise 축적. lateRescues=뒤늦게 연결돼 살아난 조각.`,
  );
  console.log("");
}

function loadScenario(get: (f: string) => string | undefined): Scenario {
  const file = get("--scenario");
  if (file) return JSON.parse(readFileSync(file, "utf-8")) as Scenario;
  const rounds = get("--rounds");
  if (rounds) return synth(Number(rounds), Number(get("--nodes") ?? "4"), Number(get("--seed") ?? "1"));
  return DEFAULT_SCENARIO;
}

// 기본 시나리오 — TTL tradeoff를 결정적으로 보여준다.
//  C: r0 고립 → r2에 연결(staging 2라운드 후 구제).  D: r1 고립 → r4에 연결.
//  → ttl=2면 D는 r3에 archived 됐다 r4에 revival(복구), ttl≥3이면 staging→active로 구제(revival 0).
const DEFAULT_SCENARIO: Scenario = {
  rounds: [
    { nodes: ["A", "B", "C"], edges: [["A", "B"]] },
    { nodes: ["D"], edges: [] },
    { nodes: ["E"], edges: [["C", "E"]] },
    { nodes: [], edges: [] },
    { nodes: [], edges: [["D", "A"]] },
  ],
};

// seeded 합성 시나리오 — 볼륨 튜닝용. 신규 노드 일부는 기존에 연결(active), 일부는 고립(staging);
// 매 라운드 일부 고립 노드를 뒤늦게 연결(late) → TTL tradeoff가 드러나게.
function synth(rounds: number, nodesPerRound: number, seed: number): Scenario {
  const rand = mulberry32(seed);
  const out: Round[] = [];
  const linked = new Set<string>(); // 연결 이력 있는 노드
  const all: string[] = [];
  let counter = 0;

  for (let r = 0; r < rounds; r++) {
    const nodes: string[] = [];
    const edges: [string, string][] = [];
    for (let i = 0; i < nodesPerRound; i++) {
      const id = `n${counter++}`;
      nodes.push(id);
      all.push(id);
      if (all.length > 1 && rand() < 0.6) {
        const peer = all[Math.floor(rand() * (all.length - 1))];
        edges.push([id, peer]);
        linked.add(id);
        linked.add(peer);
      }
    }
    // late reconnect: 고립 노드 하나를 뒤늦게 연결.
    const isolated = all.filter((id) => !linked.has(id));
    if (isolated.length && rand() < 0.5) {
      const late = isolated[Math.floor(rand() * isolated.length)];
      const peer = all[Math.floor(rand() * all.length)];
      if (peer !== late) {
        edges.push([late, peer]);
        linked.add(late);
        linked.add(peer);
      }
    }
    out.push({ nodes, edges });
  }
  return { rounds: out };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

main();
