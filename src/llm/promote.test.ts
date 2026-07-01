import { describe, it, expect } from "vitest";
import { promote, type CandidateNode, type PromoteEdge } from "./promote";

const n = (id: string, state?: CandidateNode["state"], stagingSinceRound?: number): CandidateNode => ({
  id,
  state,
  stagingSinceRound,
});

describe("promote — 연결성 게이트 (README §E)", () => {
  it("연결된 노드(degree≥1)는 active로 승격", () => {
    const nodes = [n("A"), n("B")];
    const edges: PromoteEdge[] = [{ source: "A", target: "B" }];
    const r = promote(nodes, edges, { round: 0 });
    expect(r.nodes.map((x) => x.state)).toEqual(["active", "active"]);
    expect(r.stats.active).toBe(2);
  });

  it("신규 고립 노드는 폐기하지 않고 staging 보류", () => {
    const r = promote([n("solo")], [], { round: 0 });
    expect(r.nodes[0].state).toBe("staging");
    expect(r.nodes[0].stagingSinceRound).toBe(0);
    expect(r.transitions[0]).toMatchObject({ from: "new", to: "staging" });
  });

  it("self-loop은 연결로 세지 않는다(degree 0 → staging)", () => {
    const r = promote([n("x")], [{ source: "x", target: "x" }], { round: 0 });
    expect(r.nodes[0].degree).toBe(0);
    expect(r.nodes[0].state).toBe("staging");
  });

  it("과연결 허브는 조치 없이 active 유지", () => {
    const nodes = [n("HUB"), n("a"), n("b"), n("c"), n("d")];
    const edges: PromoteEdge[] = ["a", "b", "c", "d"].map((t) => ({ source: "HUB", target: t }));
    const r = promote(nodes, edges, { round: 0 });
    const hub = r.nodes.find((x) => x.id === "HUB")!;
    expect(hub.state).toBe("active");
    expect(hub.degree).toBe(4); // 격하·분할·플래그 없음
  });

  it("active는 현 라운드 고립이어도 격하 안 함(단조 승격)", () => {
    const r = promote([n("done", "active")], [], { round: 5 });
    expect(r.nodes[0].state).toBe("active");
    expect(r.transitions).toHaveLength(0); // 상태 변화 없음
  });

  it("archived 노드가 재연결되면 active로 복구", () => {
    const nodes = [n("old", "archived", 0), n("new")];
    const edges: PromoteEdge[] = [{ source: "old", target: "new" }];
    const r = promote(nodes, edges, { round: 9 });
    const old = r.nodes.find((x) => x.id === "old")!;
    expect(old.state).toBe("active");
    expect(r.transitions.find((t) => t.id === "old")).toMatchObject({ from: "archived", to: "active" });
  });
});

describe("promote — TTL 상태 머신", () => {
  it("고립이 TTL 라운드 지속되면 staging → archived", () => {
    const ttlRounds = 3;
    let node = n("orphan"); // round 0 신규

    // round 0: 신규 고립 → staging(since 0)
    let r = promote([node], [], { round: 0, ttlRounds });
    expect(r.nodes[0].state).toBe("staging");
    node = { id: "orphan", state: r.nodes[0].state, stagingSinceRound: r.nodes[0].stagingSinceRound };

    // round 1,2: 여전히 고립, TTL 내 → staging 유지
    for (const round of [1, 2]) {
      r = promote([node], [], { round, ttlRounds });
      expect(r.nodes[0].state).toBe("staging");
      node = { id: "orphan", state: r.nodes[0].state, stagingSinceRound: r.nodes[0].stagingSinceRound };
    }

    // round 3: 3 - 0 ≥ 3 → archived
    r = promote([node], [], { round: 3, ttlRounds });
    expect(r.nodes[0].state).toBe("archived");
    expect(r.transitions[0]).toMatchObject({ from: "staging", to: "archived" });
  });

  it("TTL 직전 라운드에 연결되면 active로 구제", () => {
    const ttlRounds = 3;
    // round 2까지 staging(since 0)이던 노드가 round 2에 연결됨
    const staged = n("late", "staging", 0);
    const r = promote([staged, n("peer")], [{ source: "late", target: "peer" }], { round: 2, ttlRounds });
    expect(r.nodes.find((x) => x.id === "late")!.state).toBe("active");
  });
});
