import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SectionTopic } from "../lib/noteSections";

const probeExplanation = vi.fn();
vi.mock("../llm/feynman", () => ({
  probeExplanation: (...a: unknown[]) => probeExplanation(...a),
}));

// Map 백엔드 fake localStorage — node vitest 환경엔 없다(settings.test.ts 와 동형).
// persist 미들웨어가 import 시점에 읽으므로 스토어보다 먼저 심는다.
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
const g = globalThis as { localStorage?: Storage; window?: { localStorage: Storage } };
const fake = new FakeStorage() as unknown as Storage;
g.localStorage = fake;
g.window = { localStorage: fake }; // zustand persist 기본 storage 는 window.localStorage 를 본다

const { useFeynmanStore, getSectionStatus, sectionKey } = await import("./feynmanStore");

const topic = (title: string, text = `## ${title}\n본문`, key = title.toLowerCase()): SectionTopic => ({
  level: 2,
  title,
  slug: title.toLowerCase(),
  key,
  from: 0,
  to: text.length,
  text,
});

const NOTE = "src-note-1";
const reset = () => useFeynmanStore.setState({ session: null, statuses: {} });

beforeEach(() => {
  probeExplanation.mockReset();
  localStorage.clear();
  localStorage.setItem("gemini-key", "k");
  reset();
});

describe("feynmanStore", () => {
  it("설명을 보내면 섹션 본문으로 되묻는다 (노트 전체가 아니라)", async () => {
    probeExplanation.mockResolvedValue({ probe: "왜 그렇죠?", targetGap: "why" });
    const t = topic("attention", "## attention\n가중치를 만든다");
    useFeynmanStore.getState().start(NOTE, "sp", [t]);

    await useFeynmanStore.getState().explain("유사도로 가중치를 줘요");

    expect(probeExplanation).toHaveBeenCalledWith("attention", t.text, expect.anything(), "k");
    expect(useFeynmanStore.getState().session!.history).toEqual([
      { role: "user", text: "유사도로 가중치를 줘요" },
      { role: "probe", text: "왜 그렇죠?" },
    ]);
  });

  it("되물음이 실패해도 사용자의 설명은 보존한다 — 재타이핑 없이 재시도", async () => {
    probeExplanation.mockRejectedValueOnce(new Error("HTTP 503"));
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a")]);
    await useFeynmanStore.getState().explain("내 설명");

    const s = useFeynmanStore.getState().session!;
    expect(s.history).toEqual([{ role: "user", text: "내 설명" }]);
    expect(s.error).toContain("503");
    expect(s.probing).toBe(false);

    probeExplanation.mockResolvedValueOnce({ probe: "질문", targetGap: "term" });
    await useFeynmanStore.getState().retryProbe();
    expect(useFeynmanStore.getState().session!.history).toHaveLength(2);
  });

  it("패널을 닫은 뒤 늦게 온 응답은 세션을 되살리지 않는다", async () => {
    let release!: (v: { probe: string; targetGap: string }) => void;
    probeExplanation.mockReturnValueOnce(new Promise((r) => (release = r)));
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a")]);

    const inflight = useFeynmanStore.getState().explain("a 설명");
    useFeynmanStore.getState().cancel(); // 사용자가 되묻는 중에 패널을 닫았다
    release({ probe: "늦은 되물음", targetGap: "why" });
    await inflight;

    expect(useFeynmanStore.getState().session).toBeNull(); // 유령 대화가 되살아나지 않는다
  });

  it("다른 노트에서 새로 시작하면 앞 노트의 늦은 응답이 끼어들지 않는다", async () => {
    let release!: (v: { probe: string; targetGap: string }) => void;
    probeExplanation.mockReturnValueOnce(new Promise((r) => (release = r)));
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a")]);
    const inflight = useFeynmanStore.getState().explain("a 설명");

    useFeynmanStore.getState().start("다른-노트", "sp", [topic("z")]);
    release({ probe: "늦은 되물음", targetGap: "why" });
    await inflight;

    const s = useFeynmanStore.getState().session!;
    expect(s.noteId).toBe("다른-노트");
    expect(s.history).toEqual([]);
  });

  it("판정하면 기록하고 다음 주제로, 마지막이면 세션이 끝난다", () => {
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a"), topic("b")]);
    useFeynmanStore.setState((s) => ({ session: { ...s.session!, history: [{ role: "user", text: "설명" }] } }));

    const r = useFeynmanStore.getState().finishTopic(true);
    expect(r).toEqual({ topic: expect.objectContaining({ title: "a" }), explanations: ["설명"] });
    expect(getSectionStatus(NOTE, "a")).toMatchObject({ answered: true, understood: true });
    expect(useFeynmanStore.getState().session).toMatchObject({ idx: 1, history: [] });

    useFeynmanStore.getState().finishTopic(false);
    expect(getSectionStatus(NOTE, "b")).toMatchObject({ answered: false, understood: false });
    expect(useFeynmanStore.getState().session).toBeNull();
  });

  it("설명 없이 [이해했어요] 를 눌러도 answered 는 사실대로 false 다", () => {
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a")]);
    useFeynmanStore.getState().finishTopic(true);
    expect(getSectionStatus(NOTE, "a")).toMatchObject({ answered: false, understood: true });
  });

  it("건너뛰면 아무것도 기록하지 않는다", () => {
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a"), topic("b")]);
    useFeynmanStore.getState().skipTopic();
    expect(useFeynmanStore.getState().statuses).toEqual({});
  });

  it("상태가 없으면 '아직 안 함' — 게이트는 fail-closed 로 읽는다", () => {
    expect(getSectionStatus("모르는-노트", "모르는-주제")).toEqual({
      answered: false,
      understood: false,
      updatedAt: "",
    });
  });

  it("판정 결과만 영속한다 — 진행 중 대화는 복원하지 않는다", () => {
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a")]);
    useFeynmanStore.getState().finishTopic(true);

    const raw = JSON.parse(localStorage.getItem("pp-feynman-sections")!);
    expect(raw.state.statuses[sectionKey(NOTE, "a")]).toMatchObject({ understood: true });
    expect(raw.state.session).toBeUndefined();
  });

  it("닫았다 같은 노트에서 다시 열면, 닫힌 세션의 늦은 응답이 새 대화를 오염시키지 않는다", async () => {
    let release!: (v: { probe: string; targetGap: string }) => void;
    probeExplanation.mockReturnValueOnce(new Promise((r) => (release = r)));
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a")]);
    const inflight = useFeynmanStore.getState().explain("옛 세션의 설명");

    useFeynmanStore.getState().cancel();
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a")]); // 같은 노트·같은 주제·같은 idx
    release({ probe: "옛 세션의 되물음", targetGap: "why" });
    await inflight;

    // noteId+idx 만 대조했다면 여기서 유령 되물음이 새 대화에 끼어든다.
    expect(useFeynmanStore.getState().session!.history).toEqual([]);
  });

  it("손상된 statuses 로도 게이트가 죽지 않는다 — 읽을 수 없으면 '아직 안 함'", () => {
    useFeynmanStore.setState({ statuses: { [sectionKey(NOTE, "a")]: "쓰레기" } as never });
    expect(getSectionStatus(NOTE, "a")).toEqual({ answered: false, understood: false, updatedAt: "" });
    useFeynmanStore.setState({ statuses: null as never });
    expect(getSectionStatus(NOTE, "a")).toEqual({ answered: false, understood: false, updatedAt: "" });
  });

  it("되묻는 중에는 판정·전환을 막는다 (늦은 응답이 판정을 뒤엎지 못하게)", async () => {
    probeExplanation.mockReturnValue(new Promise(() => {})); // 영원히 대기
    useFeynmanStore.getState().start(NOTE, "sp", [topic("a")]);
    void useFeynmanStore.getState().explain("설명");

    expect(useFeynmanStore.getState().session!.probing).toBe(true);
    expect(useFeynmanStore.getState().finishTopic(true)).toBeNull();
    expect(useFeynmanStore.getState().statuses).toEqual({});
  });
});
