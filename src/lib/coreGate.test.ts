import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ArchiveNote } from "./types";

const classifyCoreSections = vi.fn();
vi.mock("../llm/coretopics", () => ({
  classifyCoreSections: (...a: unknown[]) => classifyCoreSections(...a),
}));

class FakeStorage {
  m = new Map<string, string>();
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
const g = globalThis as { localStorage?: Storage; window?: { localStorage: Storage } };
const fake = new FakeStorage() as unknown as Storage;
g.localStorage = fake;
g.window = { localStorage: fake };

const { checkCoreGate } = await import("./coreGate");
const { useFeynmanStore, sectionKey } = await import("../store/feynmanStore");

const MD = ["# 노트", "## 어텐션", "가중치를 만든다.", "## 참고 문헌", "Vaswani 2017."].join("\n");
const note = (markdown = MD): ArchiveNote =>
  ({ sourceId: "src-1", title: "Transformer", markdown, path: "n.md", subjectIds: [] }) as unknown as ArchiveNote;

const storage = new FakeStorage();
const understood = (key: string) =>
  useFeynmanStore.setState({
    statuses: {
      [sectionKey("src-1", key)]: { title: key, answered: true, understood: true, explanations: ["설명"], updatedAt: "t" },
    },
  });

beforeEach(() => {
  classifyCoreSections.mockReset();
  storage.clear();
  useFeynmanStore.setState({ statuses: {}, session: null });
});

describe("checkCoreGate", () => {
  it("핵심 주제를 아직 설명하지 않았으면 막고, 어느 주제가 막는지 알려준다", async () => {
    classifyCoreSections.mockResolvedValue({ core: [true, false], reasons: [], engine: "gemini" });
    const v = await checkCoreGate(note(), "k", { storage });
    expect(v).toMatchObject({ blocked: true, missing: ["어텐션"], engine: "gemini" });
  });

  it("답하고 '이해했다' 고 해야 열린다 — 답만 해서는 안 된다", async () => {
    classifyCoreSections.mockResolvedValue({ core: [true, false], reasons: [], engine: "gemini" });

    // 설명은 했지만 [아직 모르겠어요] 로 끝냈다
    useFeynmanStore.setState({
      statuses: {
        [sectionKey("src-1", "어텐션")]: { title: "어텐션", answered: true, understood: false, explanations: ["설명"], updatedAt: "t" },
      },
    });
    expect((await checkCoreGate(note(), "k", { storage })).blocked).toBe(true);

    understood("어텐션");
    expect((await checkCoreGate(note(), "k", { storage })).blocked).toBe(false);
  });

  it("핵심이 아닌 주제는 설명하지 않아도 막지 않는다", async () => {
    classifyCoreSections.mockResolvedValue({ core: [false, false], reasons: [], engine: "gemini" });
    expect((await checkCoreGate(note(), "k", { storage })).blocked).toBe(false);
  });

  it("같은 노트를 다시 물으면 캐시로 답한다 — 판정이 오늘내일 달라지지 않는다", async () => {
    classifyCoreSections.mockResolvedValue({ core: [true, false], reasons: [], engine: "gemini" });
    await checkCoreGate(note(), "k", { storage });
    const second = await checkCoreGate(note(), "k", { storage });

    expect(classifyCoreSections).toHaveBeenCalledTimes(1);
    expect(second.engine).toBe("cache");
    expect(second.blocked).toBe(true);
  });

  it("노트를 고치면 다시 판별한다", async () => {
    classifyCoreSections.mockResolvedValue({ core: [true, false], reasons: [], engine: "gemini" });
    await checkCoreGate(note(), "k", { storage });
    await checkCoreGate(note(MD + "\n한 줄 더."), "k", { storage });
    expect(classifyCoreSections).toHaveBeenCalledTimes(2);
  });

  it("판정을 못 받으면 걸지 않는다 — 사람을 잘못 막지 않는다", async () => {
    classifyCoreSections.mockResolvedValue({ core: [false, false], reasons: [], engine: "none" });
    const v = await checkCoreGate(note(), "", { storage });
    expect(v).toEqual({ blocked: false, missing: [], engine: "none" });
  });

  it("`##` 이 없는 노트는 나눌 주제가 없다 — LLM 을 부르지도 않는다", async () => {
    const v = await checkCoreGate(note("그냥 줄글 메모."), "k", { storage });
    expect(v.blocked).toBe(false);
    expect(classifyCoreSections).not.toHaveBeenCalled();
  });

  it("`###` 만 쓴 노트도 게이트가 본다 — `##` 만 보면 통째로 통과한다", async () => {
    classifyCoreSections.mockResolvedValue({ core: [true, false], reasons: [], engine: "gemini" });
    const md = ["# 노트", "### 어텐션", "가중치.", "### 참고", "링크."].join("\n");
    const v = await checkCoreGate(note(md), "k", { storage });
    expect(v).toMatchObject({ blocked: true, missing: ["어텐션"] });
  });

  it("손상된 캐시는 없는 것과 같다", async () => {
    storage.setItem("core-topics:src-1", "{쓰레기");
    classifyCoreSections.mockResolvedValue({ core: [true, false], reasons: [], engine: "gemini" });
    const v = await checkCoreGate(note(), "k", { storage });
    expect(v.blocked).toBe(true);
    expect(classifyCoreSections).toHaveBeenCalledTimes(1);
  });
});
