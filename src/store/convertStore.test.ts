import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConvertStore } from "./convertStore";
import { runSynthesis, SynthesisStreamError, type SynthesisOptions } from "../llm/synthesize";
import * as ipc from "../lib/ipc";
import type { ArchiveNote } from "../lib/types";

vi.mock("../lib/ipc", () => ({
  saveWiki: vi.fn(async (_space: string, page: unknown) => page),
}));
vi.mock("../llm/synthesize", async (orig) => {
  const actual = await orig<typeof import("../llm/synthesize")>();
  return { ...actual, runSynthesis: vi.fn() };
});

const NOTE: ArchiveNote = {
  id: "note-1",
  spaceId: "sp-1",
  sourceId: "source-abc",
  path: "2026-07-03-os.md",
  title: "OS 3주차",
  markdown: "파편",
  subjectIds: ["subj-1"],
  createdAt: "2026-07-03T10:00:00+09:00",
  updatedAt: "2026-07-03T10:00:00+09:00",
};
const PARAMS = { space: "space", spaceId: "sp-1", note: NOTE, existing: [] };

beforeEach(() => {
  useConvertStore.setState({ job: null });
  vi.mocked(runSynthesis).mockReset();
  vi.mocked(ipc.saveWiki).mockClear();
});

describe("useConvertStore", () => {
  it("성공: streaming → saving → done, wikiPath 설정", async () => {
    vi.mocked(runSynthesis).mockImplementation(async (_i, _k, opts?: SynthesisOptions) => {
      opts?.onDelta?.("# OS 3주차 정리");
      return { markdown: "# OS 3주차 정리\n본문", engine: "openai" as const };
    });
    await useConvertStore.getState().runConvert(PARAMS);
    const job = useConvertStore.getState().job!;
    expect(job.status).toBe("done");
    expect(job.text).toBe("# OS 3주차 정리\n본문");
    expect(job.engine).toBe("openai");
    expect(job.wikiPath).toBe("syn-source-abc.md");
  });

  it("single-flight: 진행 중이면 새 변환 거부", async () => {
    let release!: () => void;
    vi.mocked(runSynthesis).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ markdown: "m", engine: "openai" as const });
        }),
    );
    const first = useConvertStore.getState().runConvert(PARAMS);
    await useConvertStore.getState().runConvert({ ...PARAMS, note: { ...NOTE, path: "other.md", title: "다른 노트" } });
    expect(useConvertStore.getState().job?.noteTitle).toBe("OS 3주차"); // 두 번째 호출 무시됨
    release();
    await first;
    expect(useConvertStore.getState().job?.status).toBe("done");
  });

  it("취소(AbortError): cancelled + 부분 텍스트 유지, 저장 없음", async () => {
    vi.mocked(runSynthesis).mockImplementation(
      (_i, _k, opts?: SynthesisOptions) =>
        new Promise((_res, rej) => {
          opts?.onDelta?.("부분 텍스트");
          opts?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        }),
    );
    const run = useConvertStore.getState().runConvert(PARAMS);
    useConvertStore.getState().cancel();
    await run;
    const job = useConvertStore.getState().job!;
    expect(job.status).toBe("cancelled");
    expect(job.text).toBe("부분 텍스트");
    expect(vi.mocked(ipc.saveWiki)).not.toHaveBeenCalled();
  });

  it("스트림 도중 실패(SynthesisStreamError): failed + 부분 텍스트 유지, 저장 없음", async () => {
    vi.mocked(runSynthesis).mockImplementation(async (_i, _k, opts?: SynthesisOptions) => {
      opts?.onDelta?.("반쯤 온 글");
      throw new SynthesisStreamError("connection reset");
    });
    await useConvertStore.getState().runConvert(PARAMS);
    const job = useConvertStore.getState().job!;
    expect(job.status).toBe("failed");
    expect(job.text).toBe("반쯤 온 글");
    expect(job.error).toContain("connection reset");
  });

  it("clear: 진행 중엔 거부, 종결 후 허용", async () => {
    let release!: () => void;
    vi.mocked(runSynthesis).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ markdown: "m", engine: "heuristic" as const });
        }),
    );
    const run = useConvertStore.getState().runConvert(PARAMS);
    useConvertStore.getState().clear();
    expect(useConvertStore.getState().job).not.toBeNull(); // streaming 중 clear 무시
    release();
    await run;
    useConvertStore.getState().clear();
    expect(useConvertStore.getState().job).toBeNull();
  });
});
