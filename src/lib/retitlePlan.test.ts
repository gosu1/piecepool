import { describe, it, expect } from "vitest";
import { planRetitles } from "./retitlePlan";

const WIKIS = [
  { path: "attention.md", title: "어텐션" },
  { path: "multi-head.md", title: "멀티 헤드 어텐션" },
  { path: "transformer.md", title: "Transformer" },
];

describe("planRetitles", () => {
  it("from 이 일치하는 페이지의 file 로 계획을 만들고, 모르는 from 은 버린다", () => {
    const rows = planRetitles(WIKIS, [
      { from: "어텐션", to: "Attention" },
      { from: "없는 제목", to: "X" },
    ]);
    expect(rows).toEqual([{ file: "attention.md", from: "어텐션", to: "Attention", conflict: false }]);
  });

  it("대상 제목이 이미 다른 페이지에 있으면 conflict — rename 은 병합이 아니다", () => {
    const rows = planRetitles(WIKIS, [{ from: "어텐션", to: "transformer" }]); // 케이스 달라도 잡는다
    expect(rows[0].conflict).toBe(true);
  });

  it("케이스만 고치는 self-rename 은 conflict 가 아니다", () => {
    const rows = planRetitles([{ path: "a.md", title: "attention" }], [{ from: "attention", to: "Attention" }]);
    expect(rows).toEqual([{ file: "a.md", from: "attention", to: "Attention", conflict: false }]);
  });

  it("배치 안에서 두 제안이 한 제목을 노리면 뒤가 conflict", () => {
    const rows = planRetitles(WIKIS, [
      { from: "어텐션", to: "Attention" },
      { from: "멀티 헤드 어텐션", to: "attention" }, // 앞 제안이 선점한 이름
    ]);
    expect(rows[0].conflict).toBe(false);
    expect(rows[1].conflict).toBe(true);
  });
});
