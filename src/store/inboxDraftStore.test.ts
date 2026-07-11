import { describe, it, expect, vi, beforeEach } from "vitest";
import { useInboxDraftStore } from "./inboxDraftStore";
import { runPdfSummary, PdfSummaryStreamError, type PdfSummaryOptions } from "../llm/pdfsummary";

vi.mock("../llm/pdfsummary", async (orig) => {
  const actual = await orig<typeof import("../llm/pdfsummary")>();
  return { ...actual, runPdfSummary: vi.fn() };
});

const SP = "deep-learning";
const RUN = { space: SP, file: "paper.pdf", title: "Attention", text: "The Transformer..." };

beforeEach(() => {
  useInboxDraftStore.setState({ drafts: {}, job: null });
  vi.mocked(runPdfSummary).mockReset();
});

describe("draft 슬라이스", () => {
  it("setTitle/setBody 는 공간별로 저장한다", () => {
    const s = useInboxDraftStore.getState();
    s.setTitle(SP, "제목");
    s.setBody(SP, "본문");
    expect(useInboxDraftStore.getState().drafts[SP]).toEqual({ title: "제목", body: "본문" });
  });

  it("appendBody: 빈 본문이면 그대로, 있으면 \\n\\n 로 잇는다", () => {
    const s = useInboxDraftStore.getState();
    s.appendBody(SP, "![[paper.pdf]]");
    expect(useInboxDraftStore.getState().drafts[SP].body).toBe("![[paper.pdf]]");
    useInboxDraftStore.getState().appendBody(SP, "## 요약");
    expect(useInboxDraftStore.getState().drafts[SP].body).toBe("![[paper.pdf]]\n\n## 요약");
  });

  it("clearDraft 는 해당 공간 초안을 지운다", () => {
    const s = useInboxDraftStore.getState();
    s.setBody(SP, "본문");
    s.clearDraft(SP);
    expect(useInboxDraftStore.getState().drafts[SP]).toBeUndefined();
  });
});

describe("runSummary", () => {
  it("성공: streaming → done, markdown 을 기존 본문에 \\n\\n 로 병합", async () => {
    useInboxDraftStore.getState().setBody(SP, "![[paper.pdf]]"); // 업로드가 넣은 embed
    vi.mocked(runPdfSummary).mockImplementation(async (_i, _k, opts?: PdfSummaryOptions) => {
      opts?.onDelta?.("# 요약");
      return { markdown: "# 요약\n트랜스포머", truncated: false };
    });
    await useInboxDraftStore.getState().runSummary(RUN);
    const st = useInboxDraftStore.getState();
    expect(st.job?.status).toBe("done");
    expect(st.drafts[SP].body).toBe("![[paper.pdf]]\n\n# 요약\n트랜스포머");
  });

  it("취소(AbortError): cancelled + 부분 텍스트 병합", async () => {
    useInboxDraftStore.getState().setBody(SP, "![[paper.pdf]]");
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
    expect(st.drafts[SP].body).toBe("![[paper.pdf]]\n\n# 요약\n부분");
  });

  it("스트림 도중 실패(PdfSummaryStreamError): failed + 부분 병합", async () => {
    useInboxDraftStore.getState().setBody(SP, "![[paper.pdf]]");
    vi.mocked(runPdfSummary).mockImplementation(async (_i, _k, opts?: PdfSummaryOptions) => {
      opts?.onDelta?.("# 요약\n반쯤");
      throw new PdfSummaryStreamError("connection reset");
    });
    await useInboxDraftStore.getState().runSummary(RUN);
    const st = useInboxDraftStore.getState();
    expect(st.job?.status).toBe("failed");
    expect(st.drafts[SP].body).toBe("![[paper.pdf]]\n\n# 요약\n반쯤");
    expect(st.job?.error).toContain("connection reset");
  });

  it("첫 delta 이전 실패: 본문 불변, failed", async () => {
    useInboxDraftStore.getState().setBody(SP, "![[paper.pdf]]");
    vi.mocked(runPdfSummary).mockImplementation(async () => {
      throw new Error("[pdfsummary] auth: GEMINI 키 없음");
    });
    await useInboxDraftStore.getState().runSummary(RUN);
    const st = useInboxDraftStore.getState();
    expect(st.job?.status).toBe("failed");
    expect(st.drafts[SP].body).toBe("![[paper.pdf]]"); // 병합 안 됨
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

  it("clearDraft 는 그 공간의 진행 중 요약을 중단·제거한다 (부분 텍스트가 왔어도 되살아나지 않는다)", async () => {
    useInboxDraftStore.getState().setBody(SP, "![[paper.pdf]]");
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
    useInboxDraftStore.getState().clearDraft(SP); // 탭 버림 — abort 는 비동기, finish 가 뒤늦게 돈다
    await run;
    // 버린 초안이 부분 요약으로 되살아나면 안 된다 (레이스 회귀)
    expect(useInboxDraftStore.getState().drafts[SP]).toBeUndefined();
    expect(useInboxDraftStore.getState().job).toBeNull();
  });
});
