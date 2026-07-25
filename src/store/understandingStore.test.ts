import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UnderstandingMap } from "../lib/types";

vi.mock("../lib/ipc", () => ({ getUnderstanding: vi.fn(), setUnderstanding: vi.fn() }));
import * as ipc from "../lib/ipc";
import { useUnderstandingStore } from "./understandingStore";

const getU = vi.mocked(ipc.getUnderstanding);
const setU = vi.mocked(ipc.setUnderstanding);

const MAP: UnderstandingMap = { "concept-thread": { state: "clear", updatedAt: "2026-07-26T00:00:00Z" } };

beforeEach(() => {
  vi.clearAllMocks();
  useUnderstandingStore.setState({ bySpace: {} });
});

describe("understandingStore", () => {
  it("load — 사이드카를 공간별로 싣는다", async () => {
    getU.mockResolvedValue(MAP);
    await useUnderstandingStore.getState().load("운영체제");
    expect(useUnderstandingStore.getState().bySpace["운영체제"]).toEqual(MAP);
  });

  it("load 실패는 조용히 삼키고 기존 상태를 유지한다 — 안개 유지(fail-closed)", async () => {
    useUnderstandingStore.setState({ bySpace: { "운영체제": MAP } });
    getU.mockRejectedValue(new Error("io"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await useUnderstandingStore.getState().load("운영체제");
    expect(useUnderstandingStore.getState().bySpace["운영체제"]).toEqual(MAP);
    warn.mockRestore();
  });

  it("promote — clear 로 기록하고 반환된 맵으로 사본을 교체한다", async () => {
    setU.mockResolvedValue(MAP);
    await useUnderstandingStore.getState().promote("운영체제", "concept-thread");
    expect(setU).toHaveBeenCalledWith("운영체제", "concept-thread", "clear");
    expect(useUnderstandingStore.getState().bySpace["운영체제"]).toEqual(MAP);
  });

  it("promote 저장 실패도 조용히 — 상태 불변", async () => {
    setU.mockRejectedValue(new Error("io"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await useUnderstandingStore.getState().promote("운영체제", "concept-thread");
    expect(useUnderstandingStore.getState().bySpace["운영체제"]).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
