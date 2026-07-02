import { describe, expect, it } from "vitest";
import {
  RELATION_GROUPS,
  RELATION_LABEL,
  computeDepth,
  confidenceLabel,
  groupOf,
  relationSentence,
  strengthLabel,
} from "./relationMeta";
import type { RelationType } from "./generated/RelationType";

const ALL: RelationType[] = [
  "extracted_from",
  "explained_by",
  "prerequisite",
  "part_of",
  "used_in",
  "causes",
  "solves",
  "contrasts",
  "confused_with",
  "related_to",
  "tested_in",
  "review_needed",
];

describe("relationMeta 분류·라벨", () => {
  it("12타입 전부 그룹·라벨 매핑 (중복 없음)", () => {
    for (const t of ALL) {
      expect(RELATION_LABEL[t], t).toBeTruthy();
      expect(groupOf(t).members).toContain(t);
    }
    expect(RELATION_GROUPS.flatMap((g) => g.members)).toHaveLength(12);
  });

  it("대칭 그룹(연관)·복습은 화살표 없음, 계층·인과는 실선+화살표", () => {
    expect(groupOf("related_to")).toMatchObject({ id: "assoc", arrow: false, dash: "dashed" });
    expect(groupOf("review_needed")).toMatchObject({ id: "review", arrow: false });
    expect(groupOf("part_of")).toMatchObject({ id: "hier", arrow: true, dash: "solid" });
    expect(groupOf("causes")).toMatchObject({ id: "flow", arrow: true, dash: "solid" });
  });
});

describe("relationSentence 방향", () => {
  it("prerequisite 는 선수 개념(target)이 문장 앞", () => {
    const s = relationSentence("prerequisite", "페이징", "가상 메모리");
    expect(s.startsWith("가상 메모리")).toBe(true);
    expect(s).toContain("먼저 알아야");
  });

  it("part_of 는 부분(source)이 주어", () => {
    expect(relationSentence("part_of", "스레드", "프로세스")).toBe("스레드은(는) 프로세스의 한 부분이에요");
  });

  it("causes 는 source 가 원인", () => {
    const s = relationSentence("causes", "동기화 실수", "교착상태");
    expect(s.startsWith("동기화 실수")).toBe(true);
    expect(s).toContain("일으켜요");
  });

  it("review_needed 는 self-loop 여부로 문장 분기", () => {
    expect(relationSentence("review_needed", "A", "A")).toContain("복습이 필요");
    expect(relationSentence("review_needed", "A", "B")).toContain("묶어 복습");
  });
});

describe("strength/confidence 자연어 (계약 §4.1/§4.2 구간)", () => {
  it("strength 4구간", () => {
    expect(strengthLabel(0.85)).toBe("핵심 연결");
    expect(strengthLabel(0.5)).toBe("뚜렷한 연결");
    expect(strengthLabel(0.3)).toBe("약한 연결");
    expect(strengthLabel(0.1)).toBe("매우 약한 연결");
  });

  it("confidence 3구간", () => {
    expect(confidenceLabel(0.9)).toBe("근거 확실");
    expect(confidenceLabel(0.6)).toBe("맥락상 추론");
    expect(confidenceLabel(0.2)).toBe("약한 추측");
  });
});

describe("computeDepth 계층 유도", () => {
  const e = (source: string, target: string, rel = "part_of") => ({ source, target, rel });

  it("체인: target 이 위(0), 아래로 갈수록 깊어짐", () => {
    const d = computeDepth([e("b", "a"), e("c", "b")]);
    expect(d.get("a")).toBe(0);
    expect(d.get("b")).toBe(1);
    expect(d.get("c")).toBe(2);
  });

  it("longest-path: 직행과 우회 중 긴 경로 기준", () => {
    // c→a 직행 + c→b→a 우회 → c 는 2층
    const d = computeDepth([e("c", "a"), e("b", "a"), e("c", "b")]);
    expect(d.get("c")).toBe(2);
  });

  it("prerequisite 도 계층 형성 (선수 개념이 위)", () => {
    const d = computeDepth([e("동기화", "스레드", "prerequisite")]);
    expect(d.get("스레드")).toBe(0);
    expect(d.get("동기화")).toBe(1);
  });

  it("사이클은 back-edge 하나만 끊고 나머지로 층 유지", () => {
    const d = computeDepth([e("b", "a"), e("a", "b")]);
    expect(d.size).toBe(2);
    expect(Math.abs(d.get("a")! - d.get("b")!)).toBe(1);
  });

  it("self-loop·비계층 타입 무시 → 고아는 맵에 없음", () => {
    const d = computeDepth([e("a", "a"), e("x", "y", "related_to"), e("p", "q", "causes")]);
    expect(d.size).toBe(0);
  });
});
