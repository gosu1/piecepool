import { describe, it, expect } from "vitest";
import { classify, typeEdgeSensible, type NodeType } from "./classify";

// Ground truth 코퍼스 — nodetype-classifier-design 워크플로우(judge panel 3+1)가 합성한 라벨.
// clarity=clear는 정확 일치 필수, ambiguous는 전체 정확도 집계에만 반영.
type Item = { text: string; expected: NodeType; clarity: "clear" | "ambiguous" };
const CORPUS: Item[] = [
  { text: "스택은 LIFO 구조로, 마지막에 삽입된 원소가 먼저 제거되는 자료구조다.", expected: "concept", clarity: "clear" },
  { text: "해시 테이블이란 키를 해시 함수로 매핑해 값을 저장하는 자료구조를 말한다.", expected: "concept", clarity: "clear" },
  { text: "Recursion is a technique where a function calls itself.", expected: "concept", clarity: "clear" },
  { text: "동적 계획법은 큰 문제를 작은 하위 문제로 나눠 푸는 방법이다.", expected: "concept", clarity: "ambiguous" },
  { text: "RAM은 휘발성 메모리로, 전원이 꺼지면 데이터가 사라진다.", expected: "concept", clarity: "ambiguous" },
  { text: "L1 캐시의 접근 지연은 약 1ns이고 메인 메모리는 약 100ns다.", expected: "fact", clarity: "clear" },
  { text: "퀵소트의 평균 시간복잡도는 O(n log n)이다.", expected: "fact", clarity: "clear" },
  { text: "GPT-3 has 175 billion parameters trained on 300 billion tokens.", expected: "fact", clarity: "clear" },
  { text: "리눅스 커널 6.1은 2022년 12월에 출시되었다.", expected: "fact", clarity: "clear" },
  { text: "따라서 대규모 정렬에는 퀵소트보다 병합정렬이 더 안정적이라고 볼 수 있다.", expected: "claim", clarity: "clear" },
  { text: "딥러닝 모델은 데이터가 많을수록 성능이 좋아지므로 항상 데이터를 늘려야 한다.", expected: "claim", clarity: "clear" },
  { text: "The OS should preempt long-running processes to ensure fairness.", expected: "claim", clarity: "clear" },
  { text: "이진 탐색 트리는 정렬된 데이터에서 강력하다.", expected: "claim", clarity: "ambiguous" },
  { text: "예를 들어 이진 탐색 트리는 삽입 순서에 따라 한쪽으로 치우칠 수 있다.", expected: "example", clarity: "clear" },
  { text: "For instance, a page fault occurs when a process accesses a page not currently in RAM.", expected: "example", clarity: "clear" },
  { text: "For instance, a hash table degrades to O(n) when all keys collide.", expected: "example", clarity: "clear" },
  { text: "먼저 pivot을 선택하고, 그다음 pivot보다 작은 값을 왼쪽으로 옮긴다.", expected: "method", clarity: "clear" },
  { text: "To train the model, first normalize the inputs, then run backpropagation for each batch.", expected: "method", clarity: "clear" },
  { text: "정규화하려면 우선 평균을 빼고 표준편차로 나눈다.", expected: "method", clarity: "clear" },
  { text: "왜 교착상태(deadlock)는 네 가지 조건이 동시에 성립할 때만 발생하는가?", expected: "question", clarity: "clear" },
  { text: "Is it always better to use a B-tree instead of a hash index for range queries?", expected: "question", clarity: "clear" },
  { text: "How does backpropagation compute gradients without recomputing each layer?", expected: "question", clarity: "clear" },
  { text: "이 알고리즘이 정말 최적인지 아직 확실하지 않다.", expected: "question", clarity: "ambiguous" },
  { text: "무엇이 좋은 임베딩을 만드는지는 아직 열린 문제다.", expected: "question", clarity: "ambiguous" },
];

describe("classify — clear 코퍼스는 정확 일치", () => {
  for (const item of CORPUS.filter((i) => i.clarity === "clear")) {
    it(`${item.expected}: ${item.text.slice(0, 32)}…`, () => {
      expect(classify(item.text)).toBe(item.expected);
    });
  }
});

describe("classify — 전체 정확도", () => {
  it("전체(ambiguous 포함) 정확도 ≥ 0.9", () => {
    const hit = CORPUS.filter((i) => classify(i.text) === i.expected).length;
    const acc = hit / CORPUS.length;
    // 진단용: 오분류 출력
    if (acc < 1) {
      for (const i of CORPUS) {
        const got = classify(i.text);
        if (got !== i.expected) console.warn(`  miss[${i.clarity}] exp=${i.expected} got=${got} :: ${i.text}`);
      }
    }
    expect(acc).toBeGreaterThanOrEqual(0.9);
  });

  it("6개 타입 각각 clear 정답을 최소 1개 맞힌다(리치 커버리지)", () => {
    const types: NodeType[] = ["concept", "fact", "claim", "example", "method", "question"];
    for (const t of types) {
      const clears = CORPUS.filter((i) => i.clarity === "clear" && i.expected === t);
      expect(clears.length).toBeGreaterThan(0);
      expect(clears.some((i) => classify(i.text) === t)).toBe(true);
    }
  });
});

describe("typeEdgeSensible — §B 관계 타입 제약", () => {
  it("§B 명시 엣지는 sensible", () => {
    expect(typeEdgeSensible("claim", "fact")).toBe(true);
    expect(typeEdgeSensible("concept", "concept")).toBe(true);
    expect(typeEdgeSensible("example", "concept")).toBe(true);
    expect(typeEdgeSensible("example", "claim")).toBe(true);
  });
  it("question 출발 엣지는 어색(false), 미정의는 null", () => {
    expect(typeEdgeSensible("question", "concept")).toBe(false);
    expect(typeEdgeSensible("fact", "method")).toBeNull();
  });
});
