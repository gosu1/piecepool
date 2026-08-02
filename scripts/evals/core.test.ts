import { describe, it, expect } from "vitest";
import { evaluateGates, levenshtein, cer, boundaryF1, koreanRatio, bodyChars, type Gate } from "./core";

const G = (metric: string, op: Gate["op"], threshold: number): Gate => ({
  metric,
  op,
  threshold,
  label: `${metric} ${op} ${threshold}`,
});

describe("evaluateGates", () => {
  it("임계값을 만족하면 실패가 없다", () => {
    expect(evaluateGates({ leak: 0, f1: 0.8 }, [G("leak", "<=", 0), G("f1", ">=", 0.7)], false)).toEqual([]);
  });

  it("임계값을 넘기면 지표 이름·실측값·임계값을 담아 실패한다", () => {
    const fails = evaluateGates({ leak: 3 }, [G("leak", "<=", 0)], false);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain("leak");
    expect(fails[0]).toContain("3");
    expect(fails[0]).toContain("0");
  });

  it("경계값은 통과다 (<= 는 같으면 통과)", () => {
    expect(evaluateGates({ ratio: 0.3 }, [G("ratio", "<=", 0.3)], false)).toEqual([]);
    expect(evaluateGates({ f1: 0.7 }, [G("f1", ">=", 0.7)], false)).toEqual([]);
  });

  it("지표가 없으면 통과가 아니라 실패다 — 조용한 통과 금지", () => {
    const fails = evaluateGates({}, [G("leak", "<=", 0)], false);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain("지표 없음");
  });

  it("NaN 은 실패다", () => {
    const fails = evaluateGates({ f1: NaN }, [G("f1", ">=", 0.7)], false);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain("지표 없음");
  });

  it("dry 모드에서는 없는 지표를 건너뛰지만, 있는 지표는 그대로 판정한다", () => {
    const gates = [G("judgeLeak", "<=", 0), G("cheapFail", "<=", 0)];
    expect(evaluateGates({ cheapFail: 0 }, gates, true)).toEqual([]);
    const fails = evaluateGates({ cheapFail: 2 }, gates, true);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain("cheapFail");
  });
});

describe("levenshtein / cer", () => {
  it("같은 문자열은 거리 0", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("치환·삽입·삭제를 센다", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("cer 은 공백·대소문자를 정규화한 뒤 거리/기준길이", () => {
    expect(cer("Hello  World", "hello world")).toBe(0);
    expect(cer("abcd", "abxd")).toBeCloseTo(0.25, 5);
  });

  it("기준이 빈 문자열이면 가설이 비었을 때만 0", () => {
    expect(cer("", "")).toBe(0);
    expect(cer("", "x")).toBe(1);
  });
});

describe("boundaryF1", () => {
  it("완전 일치는 1", () => {
    expect(boundaryF1([2, 5], [2, 5], 0)).toBeCloseTo(1, 5);
  });

  it("허용 오차 안이면 맞은 것으로 센다", () => {
    expect(boundaryF1([2, 5], [3, 6], 1)).toBeCloseTo(1, 5);
    expect(boundaryF1([2, 5], [3, 6], 0)).toBeCloseTo(0, 5);
  });

  it("골드 경계 하나를 예측 하나에만 매칭한다 — 중복 크레딧 금지", () => {
    expect(boundaryF1([5], [4, 5, 6], 1)).toBeCloseTo(0.5, 5);
  });

  it("양쪽 다 비면 1, 한쪽만 비면 0", () => {
    expect(boundaryF1([], [], 1)).toBe(1);
    expect(boundaryF1([], [3], 1)).toBe(0);
    expect(boundaryF1([3], [], 1)).toBe(0);
  });
});

// 적대적 검증(Task 9)에서 나온 지표 — "한글 한 글자만 섞으면 통과" 를 막는다.
describe("koreanRatio", () => {
  it("한국어 본문은 1에 가깝고 영어 본문은 0에 가깝다", () => {
    expect(koreanRatio("교착상태는 자원을 기다리는 상태다")).toBe(1);
    expect(koreanRatio("A deadlock occurs when processes wait")).toBe(0);
  });

  it("영어 본문에 한글 용어만 섞은 출력은 낮게 나온다 — 존재 여부 검사의 구멍", () => {
    const md = "A deadlock occurs when processes wait for resources: 상호배제, 점유대기.";
    expect(/[가-힣]/.test(md)).toBe(true); // 기존 검사는 통과시킨다
    expect(koreanRatio(md)).toBeLessThan(0.5); // 비율은 잡는다
  });

  it("영문 용어를 보존한 한국어 요약은 0.5 위에 남는다", () => {
    expect(koreanRatio("FCFS 는 먼저 도착한 순서대로 처리하는 비선점 방식이다")).toBeGreaterThan(0.5);
  });

  it("문자가 없으면 1 — 언어 지표가 빈 출력을 대신 잡지 않는다", () => {
    expect(koreanRatio("## \n- \n")).toBe(1);
  });
});

describe("bodyChars", () => {
  it("헤딩과 불릿 마커는 본문 길이에서 뺀다", () => {
    expect(bodyChars("# 제목\n\n- 상호배제\n- 점유대기\n")).toBe(8); // 핵심어 8자만
  });

  it("설명이 붙으면 길이가 늘어난다", () => {
    const listOnly = "# 교착상태\n\n- 상호배제\n- 점유대기\n";
    const explained = "# 교착상태\n\n상호배제는 자원을 한 번에 하나의 프로세스만 쓰는 조건이다. 점유대기는 자원을 쥔 채 다른 자원을 기다리는 조건이다.\n";
    expect(bodyChars(explained)).toBeGreaterThan(bodyChars(listOnly) * 5);
  });
});
