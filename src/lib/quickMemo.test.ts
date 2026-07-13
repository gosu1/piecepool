import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getMemoPos,
  setMemoPos,
  clampPos,
  getMemoSize,
  setMemoSize,
  clampSize,
} from "./quickMemo";

// Map 백엔드 fake localStorage — node vitest 환경엔 없으므로 주입 (settings.test.ts 와 동형).
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key() {
    return null;
  }
  get length() {
    return this.m.size;
  }
}

const g = globalThis as { localStorage?: Storage };
beforeEach(() => {
  g.localStorage = new FakeStorage() as unknown as Storage;
});
afterEach(() => {
  delete g.localStorage;
});

// 메모 원문은 여기 없다 — 노트 초안(InboxDraft.memo)에 산다(inboxDraftStore.test.ts).
// 이 파일에 남는 것은 창의 위치·크기, 즉 "창을 어디에 두고 싶은가" 라는 전역 취향뿐이다.
describe("quickMemo — 창 위치", () => {
  it("왕복한다(정수로 반올림)", () => {
    setMemoPos({ x: 120.4, y: 96.6 });
    expect(getMemoPos()).toEqual({ x: 120, y: 97 });
  });

  it("저장된 적 없으면 null", () => {
    expect(getMemoPos()).toBeNull();
  });

  it("손상된 값이면 null — 크래시하지 않는다", () => {
    localStorage.setItem("quickmemo-pos", "{ 깨진 json");
    expect(getMemoPos()).toBeNull();
    localStorage.setItem("quickmemo-pos", '{"x":"왼쪽"}');
    expect(getMemoPos()).toBeNull();
  });
});

describe("quickMemo — 창 크기", () => {
  it("왕복한다", () => {
    setMemoSize({ w: 420.7, h: 500.2 });
    expect(getMemoSize()).toEqual({ w: 421, h: 500 });
  });

  it("저장된 적 없으면 null (호출부가 기본 크기를 쓴다)", () => {
    expect(getMemoSize()).toBeNull();
  });

  it("손상된 값이면 null", () => {
    localStorage.setItem("quickmemo-size", "{ 깨진");
    expect(getMemoSize()).toBeNull();
  });
});

describe("clampSize — 최소 크기 아래로 줄거나 화면보다 커지지 않는다", () => {
  it("최소(240×200) 아래로 못 줄인다", () => {
    expect(clampSize({ w: 10, h: 10 }, 1200, 800)).toEqual({ w: 240, h: 200 });
  });

  it("남은 화면 공간보다 커지지 않는다", () => {
    expect(clampSize({ w: 9999, h: 9999 }, 600, 450)).toEqual({ w: 600, h: 450 });
  });

  it("가용 공간이 최소 크기보다 좁아도 최소 크기는 지킨다", () => {
    expect(clampSize({ w: 300, h: 300 }, 100, 80)).toEqual({ w: 240, h: 200 });
  });
});

describe("clampPos — 해상도가 바뀌어도 창이 화면 밖으로 나가지 않는다", () => {
  it("오른쪽·아래로 넘치면 되돌린다", () => {
    expect(clampPos({ x: 5000, y: 5000 }, 340, 400, 1200, 800)).toEqual({ x: 860, y: 400 });
  });

  it("음수 좌표는 0으로", () => {
    expect(clampPos({ x: -50, y: -10 }, 340, 400, 1200, 800)).toEqual({ x: 0, y: 0 });
  });

  it("화면이 창보다 작아도 음수를 만들지 않는다", () => {
    expect(clampPos({ x: 10, y: 10 }, 340, 400, 200, 300)).toEqual({ x: 0, y: 0 });
  });
});
