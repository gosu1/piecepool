import { describe, it, expect, vi, beforeEach } from "vitest";
import { useInboxDraftStore, partialize } from "./inboxDraftStore";
import { runPdfSummary, PdfSummaryStreamError, type PdfSummaryOptions } from "../llm/pdfsummary";

vi.mock("../llm/pdfsummary", async (orig) => {
  const actual = await orig<typeof import("../llm/pdfsummary")>();
  return { ...actual, runPdfSummary: vi.fn() };
});

// 노트 = 탭 하나. key 는 노트 탭 id(draftKey). 여기선 임의의 고정 key 로 검증.
const KEY = "inbox:deep-learning:t1";
const RUN = { noteKey: KEY, file: "paper.pdf", title: "Attention", text: "The Transformer..." };

beforeEach(() => {
  useInboxDraftStore.setState({ drafts: {}, job: null, pdfJobs: {} });
  vi.mocked(runPdfSummary).mockReset();
});

describe("draft 슬라이스", () => {
  it("targetSpace — 새 초안은 빈 문자열(호출부가 탭의 space 로 폴백)", () => {
    const s = useInboxDraftStore.getState();
    s.write("inbox:os:t1", { title: "제목" });
    expect(useInboxDraftStore.getState().drafts["inbox:os:t1"].targetSpace).toBe("");
  });

  it("targetSpace — write 로 바꾸면 보존된다", () => {
    const s = useInboxDraftStore.getState();
    s.write("inbox:os:t2", { targetSpace: "statistics" });
    expect(useInboxDraftStore.getState().drafts["inbox:os:t2"].targetSpace).toBe("statistics");
  });

  // 퀵메모가 전역 하나였을 땐, 다른 과목 노트로 옮겨 메모장을 켜면 남의 파편이 그대로 떠 있었다.
  // 메모는 "지금 이 노트를 쓰기 위한 작업대"다 — 노트에 종속돼야 한다.
  it("퀵메모는 노트 탭마다 따로다 — 다른 탭엔 남의 메모가 새지 않는다", () => {
    const s = useInboxDraftStore.getState();
    s.write("inbox:deep-learning:t1", { memo: "어텐션 걍 가중평균임", memoOpen: true });
    const other = useInboxDraftStore.getState().drafts["inbox:economics:t9"];
    expect(other).toBeUndefined(); // 아직 안 열어본 노트엔 초안 자체가 없다
    s.write("inbox:economics:t9", { title: "한계비용" });
    expect(useInboxDraftStore.getState().drafts["inbox:economics:t9"]).toMatchObject({ memo: "", memoOpen: false });
    expect(useInboxDraftStore.getState().drafts["inbox:deep-learning:t1"].memo).toBe("어텐션 걍 가중평균임");
  });

  it("탭을 닫으면 그 노트의 퀵메모도 사라진다", () => {
    const s = useInboxDraftStore.getState();
    s.write(KEY, { memo: "파편", memoOpen: true });
    s.clear(KEY);
    expect(useInboxDraftStore.getState().drafts[KEY]).toBeUndefined();
  });

  it("setTitle/setBody 는 노트 탭별로 저장한다", () => {
    const s = useInboxDraftStore.getState();
    s.setTitle(KEY, "제목");
    s.setBody(KEY, "본문");
    expect(useInboxDraftStore.getState().drafts[KEY]).toMatchObject({ title: "제목", body: "본문" });
  });

  it("appendBody: 빈 본문이면 그대로, 있으면 \\n\\n 로 잇는다", () => {
    const s = useInboxDraftStore.getState();
    s.appendBody(KEY, "![[paper.pdf]]");
    expect(useInboxDraftStore.getState().drafts[KEY].body).toBe("![[paper.pdf]]");
    useInboxDraftStore.getState().appendBody(KEY, "## 요약");
    expect(useInboxDraftStore.getState().drafts[KEY].body).toBe("![[paper.pdf]]\n\n## 요약");
  });

  it("clear 는 해당 노트 탭 초안을 지운다", () => {
    const s = useInboxDraftStore.getState();
    s.setBody(KEY, "본문");
    s.clear(KEY);
    expect(useInboxDraftStore.getState().drafts[KEY]).toBeUndefined();
  });
});

// uploads = 이 초안이 실제로 올린 원본. 이동·삭제 대상의 진실(본문 파싱 아님).
describe("uploads", () => {
  it("새 초안은 빈 배열 — 손으로 친 임베드는 업로드가 아니다", () => {
    useInboxDraftStore.getState().setBody(KEY, "![[남의파일.pdf]]");
    expect(useInboxDraftStore.getState().drafts[KEY].uploads).toEqual([]);
  });

  it("업로드가 누적된다(스토어의 현재 목록에 이어 붙임)", () => {
    const add = (f: string) => {
      const cur = useInboxDraftStore.getState().drafts[KEY]?.uploads ?? [];
      useInboxDraftStore.getState().write(KEY, { uploads: [...cur, f] });
    };
    add("paper.pdf");
    add("shot.png");
    expect(useInboxDraftStore.getState().drafts[KEY].uploads).toEqual(["paper.pdf", "shot.png"]);
  });
});

// 원본 처리 잠금 — 탭 전환 언마운트를 넘겨 살아남아야 하므로 스토어 소유. 단 persist 는 되면 안 된다.
describe("pdfJobs (원본 처리 잠금)", () => {
  it("노트 key 별로 증감하고, 0 초과일 때만 busy", () => {
    const s = useInboxDraftStore.getState();
    const busy = (k: string) => (useInboxDraftStore.getState().pdfJobs[k] ?? 0) > 0;
    s.beginPdfJob(KEY);
    s.beginPdfJob(KEY); // 동시 업로드 2건
    expect(useInboxDraftStore.getState().pdfJobs[KEY]).toBe(2);
    expect(busy("inbox:other:t9")).toBe(false); // 다른 노트는 잠기지 않는다
    s.endPdfJob(KEY);
    expect(busy(KEY)).toBe(true); // 하나 끝나도 아직 잠김
    s.endPdfJob(KEY);
    expect(busy(KEY)).toBe(false);
    expect(useInboxDraftStore.getState().pdfJobs[KEY]).toBeUndefined();
  });

  it("탭을 닫으면 그 노트의 잠금도 사라진다(뒤늦은 release 가 음수로 남지 않는다)", () => {
    const s = useInboxDraftStore.getState();
    s.beginPdfJob(KEY);
    s.clear(KEY);
    expect(useInboxDraftStore.getState().pdfJobs[KEY]).toBeUndefined();
    useInboxDraftStore.getState().endPdfJob(KEY); // 진행 중이던 업로드가 뒤늦게 finally 로 release
    expect(useInboxDraftStore.getState().pdfJobs[KEY]).toBeUndefined();
  });

  it("persist 되지 않는다 — 업로드 중 크래시한 잠금이 재시작 후 노트를 잠그면 안 된다", () => {
    useInboxDraftStore.getState().beginPdfJob(KEY);
    const saved = partialize(useInboxDraftStore.getState());
    expect(Object.keys(saved)).toEqual(["drafts"]); // localStorage 로 나가는 건 drafts 뿐
    expect(saved).not.toHaveProperty("pdfJobs");
  });
});

describe("runSummary", () => {
  it("성공: streaming → done, markdown 을 기존 본문에 \\n\\n 로 병합", async () => {
    useInboxDraftStore.getState().setBody(KEY, "![[paper.pdf]]"); // 업로드가 넣은 embed
    vi.mocked(runPdfSummary).mockImplementation(async (_i, _k, opts?: PdfSummaryOptions) => {
      opts?.onDelta?.("# 요약");
      return { markdown: "# 요약\n트랜스포머", truncated: false };
    });
    await useInboxDraftStore.getState().runSummary(RUN);
    const st = useInboxDraftStore.getState();
    expect(st.job?.status).toBe("done");
    expect(st.drafts[KEY].body).toBe("![[paper.pdf]]\n\n# 요약\n트랜스포머");
  });

  it("취소(AbortError): cancelled + 부분 텍스트 병합", async () => {
    useInboxDraftStore.getState().setBody(KEY, "![[paper.pdf]]");
    vi.mocked(runPdfSummary).mockImplementation(
      (_i, _k, opts?: PdfSummaryOptions) =>
        new Promise((_res, rej) => {
          opts?.onDelta?.("# 요약\n부분");
          opts?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        }),
    );
    const run = useInboxDraftStore.getState().runSummary(RUN);
    useInboxDraftStore.getState().cancelSummary();
    await run;
    const st = useInboxDraftStore.getState();
    expect(st.job?.status).toBe("cancelled");
    expect(st.drafts[KEY].body).toBe("![[paper.pdf]]\n\n# 요약\n부분");
  });

  it("스트림 도중 실패(PdfSummaryStreamError): failed + 부분 병합", async () => {
    useInboxDraftStore.getState().setBody(KEY, "![[paper.pdf]]");
    vi.mocked(runPdfSummary).mockImplementation(async (_i, _k, opts?: PdfSummaryOptions) => {
      opts?.onDelta?.("# 요약\n반쯤");
      throw new PdfSummaryStreamError("connection reset");
    });
    await useInboxDraftStore.getState().runSummary(RUN);
    const st = useInboxDraftStore.getState();
    expect(st.job?.status).toBe("failed");
    expect(st.drafts[KEY].body).toBe("![[paper.pdf]]\n\n# 요약\n반쯤");
    expect(st.job?.error).toContain("connection reset");
  });

  it("첫 delta 이전 실패: 본문 불변, failed", async () => {
    useInboxDraftStore.getState().setBody(KEY, "![[paper.pdf]]");
    vi.mocked(runPdfSummary).mockImplementation(async () => {
      throw new Error("[pdfsummary] auth: GEMINI 키 없음");
    });
    await useInboxDraftStore.getState().runSummary(RUN);
    const st = useInboxDraftStore.getState();
    expect(st.job?.status).toBe("failed");
    expect(st.drafts[KEY].body).toBe("![[paper.pdf]]"); // 병합 안 됨
  });

  it("single-flight: 진행 중이면 두 번째 요약 무시", async () => {
    let release!: () => void;
    vi.mocked(runPdfSummary).mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ markdown: "# 요약", truncated: false }))),
    );
    const first = useInboxDraftStore.getState().runSummary(RUN);
    await useInboxDraftStore.getState().runSummary({ ...RUN, file: "other.pdf" });
    expect(useInboxDraftStore.getState().job?.file).toBe("paper.pdf");
    release();
    await first;
    expect(useInboxDraftStore.getState().job?.status).toBe("done");
  });

  it("clear 는 그 노트의 진행 중 요약을 중단·제거한다 (부분 텍스트가 왔어도 되살아나지 않는다)", async () => {
    useInboxDraftStore.getState().setBody(KEY, "![[paper.pdf]]");
    vi.mocked(runPdfSummary).mockImplementation(
      (_i, _k, opts?: PdfSummaryOptions) =>
        new Promise((_res, rej) => {
          opts?.onDelta?.("# 요약\n스트리밍 도중 온 부분"); // 부분 텍스트가 이미 도착
          opts?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        }),
    );
    const run = useInboxDraftStore.getState().runSummary(RUN);
    useInboxDraftStore.getState().clear(KEY); // 탭 닫기 — abort 는 비동기, finish 가 뒤늦게 돈다
    await run;
    // 버린 초안이 부분 요약으로 되살아나면 안 된다 (레이스 회귀)
    expect(useInboxDraftStore.getState().drafts[KEY]).toBeUndefined();
    expect(useInboxDraftStore.getState().job).toBeNull();
  });
});
