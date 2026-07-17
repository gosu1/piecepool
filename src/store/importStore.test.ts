import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ArchiveNote } from "../lib/types";

vi.mock("../lib/ipc", () => ({ createNote: vi.fn(), saveNote: vi.fn() }));
vi.mock("../llm/generate", () => ({ runWikiGeneration: vi.fn() }));
vi.mock("../llm/mergeWiki", () => ({ runWikiMerge: vi.fn() }));
vi.mock("../lib/factCheck", () => ({
  maybeFactCheck: vi.fn(async (result: unknown) => ({ result, checked: 0 })),
}));
vi.mock("../lib/settings", () => ({ chunkOpts: () => ({}) }));
// buildInput 이 쓰는 embedSourceFiles/toExistingConcepts/normalizeTitle 은 실물, 저장(applyLlmResult)만 대체.
vi.mock("../lib/llmApply", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/llmApply")>()),
  applyLlmResult: vi.fn(),
}));

import * as ipc from "../lib/ipc";
import { runWikiGeneration } from "../llm/generate";
import { applyLlmResult } from "../lib/llmApply";

// Map 백엔드 fake localStorage — node vitest 환경엔 없다. store 가 모듈 로드 시점에
// localStorage 를 읽으므로 심은 뒤 동적 import 한다(feynmanStore.test.ts 선례).
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
g.localStorage = new FakeStorage() as unknown as Storage;

const { useImportStore } = await import("./importStore");

const NOTE: ArchiveNote = {
  id: "note-1",
  spaceId: "sp-1",
  sourceId: "src-1",
  path: "2026-07-17-t.md",
  title: "T",
  markdown: "본문",
  subjectIds: [],
  createdAt: "2026-07-17T10:00:00+09:00",
  updatedAt: "2026-07-17T10:00:00+09:00",
};

const PARAMS = {
  space: "space",
  spaceId: "sp-1",
  title: "T",
  markdown: "본문",
  subjectIds: [],
  withLlm: true,
  existing: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useImportStore.setState({ job: null });
  vi.mocked(ipc.createNote).mockResolvedValue(NOTE);
  vi.mocked(runWikiGeneration).mockResolvedValue({
    result: { concepts: [], relations: [] },
    engine: "gemini",
  });
});

describe("runImport — writing 단계 실패", () => {
  // 회귀: try 안 `return writeAndComplete(...)` 가 await 없이는 거부가 catch 를 우회해
  // job 이 "writing" 으로 영구 고착됐다(importBusy 게이트가 이후 저장 전부 무시, 실패 알림 없음).
  it("저장 실패가 failed 상태 + errorMessage 로 끝난다 — writing 고착 금지", async () => {
    vi.mocked(applyLlmResult).mockRejectedValue(new Error("save_wiki 실패"));
    const res = await useImportStore.getState().runImport(PARAMS);
    expect(res.status).toBe("failed");
    expect(res.errorMessage).toContain("save_wiki 실패");
    expect(useImportStore.getState().job?.status).toBe("failed");
  });

  it("저장 성공은 completed 로 끝난다 (정상 경로 무변화)", async () => {
    vi.mocked(applyLlmResult).mockResolvedValue({ pages: [], relationCount: 0, merged: 0 });
    const res = await useImportStore.getState().runImport(PARAMS);
    expect(res.status).toBe("completed");
    expect(useImportStore.getState().job?.status).toBe("completed");
  });
});
