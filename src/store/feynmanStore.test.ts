import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitFeynmanSection, joinFeynmanSection, bodyHash } from "../lib/feynmanSection";
import type { WikiPage } from "../lib/types";

vi.mock("../llm/feynman", () => ({ probeExplanation: vi.fn(), analogyHint: vi.fn() }));
// finish 는 디스크 최신본 기준이라 readWiki 도 탄다.
vi.mock("../lib/ipc", () => ({ saveWiki: vi.fn(), readWiki: vi.fn() }));
// 커버리지 파이프라인 — LLM 호출부만 mock, facetCacheKey(캐시 키 규약)는 실물을 쓴다.
// mock 안 하면 beforeEach 의 gemini-key 때문에 runCoverage 가 실제 네트워크로 나간다.
vi.mock("../llm/facets", async (importOriginal) => {
  const real = await importOriginal<typeof import("../llm/facets")>();
  return { ...real, extractFacets: vi.fn() };
});
vi.mock("../llm/coverage", () => ({ judgeCoverage: vi.fn(), clearOk: vi.fn() }));
const promoteMock = vi.hoisted(() => vi.fn());
vi.mock("./understandingStore", () => ({
  useUnderstandingStore: { getState: () => ({ promote: promoteMock }) },
}));
import { probeExplanation, analogyHint } from "../llm/feynman";
import { extractFacets, type Facet } from "../llm/facets";
import { judgeCoverage, clearOk, type CoverageResult } from "../llm/coverage";
import * as ipc from "../lib/ipc";

// Map 백엔드 fake localStorage — node vitest 환경엔 없다(settings.test.ts 와 동형).
// persist 미들웨어가 store 생성 시점에 window.localStorage 를 읽으므로 store import 보다 먼저 심는다.
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

// 주의: zustand persist 는 module-eval 시점에 window.localStorage 를 읽는다. vitest node 환경엔
// 없으므로 store 모듈을 정적 import 하면 터진다 — FakeStorage 를 심은 뒤 동적 import 해야 한다.
// (선례: 구 feynmanStore.test.ts. settings.test.ts 는 지연 조회라 정적이어도 됐다.)
const { useFeynmanStore, wikiKey } = await import("./feynmanStore");

const BODY = "# 스레드\n\n프로세스 안의 실행 단위.";
const page = (over: Partial<WikiPage> = {}): WikiPage =>
  ({
    id: "wiki-1",
    spaceId: "sp-1",
    conceptId: "concept-thread",
    title: "스레드",
    path: "thread.md",
    subjectIds: [],
    sourceIds: ["src-1"],
    sourceRefs: [],
    markdown: BODY,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...over,
  }) as WikiPage;

beforeEach(() => {
  vi.clearAllMocks();
  useFeynmanStore.setState({ session: null, dismissed: {} });
  localStorage.setItem("gemini-key", "test-key");
  vi.mocked(ipc.saveWiki).mockImplementation(async (_s, p) => p as WikiPage);
  vi.mocked(ipc.readWiki).mockImplementation(async () => page());
  // 기본: 스텁 위키(빈 facet) — 커버리지 경로가 조용히 꺼진 채 기존 시나리오가 돈다.
  vi.mocked(extractFacets).mockResolvedValue([]);
});

describe("start / explain", () => {
  it("probe 입력에 위키 본문을 주되 파인만 기록은 뺀다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "스택은요?", targetGap: "why" });
    const withRecord = page({
      markdown: joinFeynmanSection(BODY, [
        { at: "2026-07-01T00:00:00.000Z", verdict: "understood", bodyHash: "x", turns: [{ role: "user", text: "옛 설명" }] },
      ]),
    });
    useFeynmanStore.getState().start("sp", withRecord);
    await useFeynmanStore.getState().explain("스레드는…");
    const noteArg = vi.mocked(probeExplanation).mock.calls[0][1];
    expect(noteArg).toBe(BODY);
    expect(noteArg).not.toContain("옛 설명");
    expect(noteArg).not.toContain("이해함");
  });

  it("LLM 실패 시 사용자 설명이 history 에 남는다", async () => {
    vi.mocked(probeExplanation).mockRejectedValue(new Error("죽음"));
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("내 설명");
    const s = useFeynmanStore.getState().session!;
    expect(s.history).toEqual([{ role: "user", text: "내 설명" }]);
    expect(s.error).toBeTruthy();
    expect(s.probing).toBe(false);
  });

  it("stale 응답 — 세션이 닫혔으면 대화를 되살리지 않는다", async () => {
    let resolve!: (v: { probe: string; targetGap: string }) => void;
    vi.mocked(probeExplanation).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    useFeynmanStore.getState().start("sp", page());
    const p = useFeynmanStore.getState().explain("설명");
    useFeynmanStore.getState().dismiss();
    resolve({ probe: "늦은 되물음", targetGap: "why" });
    await p;
    expect(useFeynmanStore.getState().session).toBeNull();
  });

  it("stale 응답 — 다른 페이지로 갈아탄 세션을 오염시키지 않는다", async () => {
    let resolve!: (v: { probe: string; targetGap: string }) => void;
    vi.mocked(probeExplanation).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    useFeynmanStore.getState().start("sp", page());
    const p = useFeynmanStore.getState().explain("설명");
    useFeynmanStore.getState().start("sp", page({ path: "other.md", title: "다른 개념" }));
    resolve({ probe: "늦은 되물음", targetGap: "why" });
    await p;
    expect(useFeynmanStore.getState().session!.history).toEqual([]);
  });
});

describe("explain — 커버리지 판정(이해 안개 거울)", () => {
  const FACETS: Facet[] = [
    { id: "f1", text: "스레드는 프로세스 안의 실행 단위다.", kind: "definition" },
    { id: "f2", text: "같은 프로세스의 스레드는 코드·데이터·힙을 공유한다.", kind: "mechanism" },
  ];
  const judged = (): CoverageResult => ({
    judgments: [
      { id: "f1", status: "covered", evidence: "실행 단위" },
      { id: "f2", status: "missing", evidence: null },
    ],
    pasteSuspected: false,
  });
  const okProbe = () => vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });

  // 캐시(facetCache)가 모듈 전역이라 테스트마다 위키 본문을 다르게 쓴다.

  it("판정 결과와 facet 목록이 세션에 실린다 — clearOk 아니면 승급 없음", async () => {
    okProbe();
    vi.mocked(extractFacets).mockResolvedValue(FACETS);
    vi.mocked(judgeCoverage).mockResolvedValue(judged());
    vi.mocked(clearOk).mockReturnValue(false);
    useFeynmanStore.getState().start("sp", page({ markdown: "# 커버리지 본문 A" }));
    await useFeynmanStore.getState().explain("스레드는 실행 단위다");
    const s = useFeynmanStore.getState().session!;
    expect(s.coverage).toEqual(judged());
    expect(s.facets).toEqual(FACETS);
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("clearOk=true 면 hazy→clear 승급을 부른다(space, conceptId)", async () => {
    okProbe();
    vi.mocked(extractFacets).mockResolvedValue(FACETS);
    vi.mocked(judgeCoverage).mockResolvedValue(judged());
    vi.mocked(clearOk).mockReturnValue(true);
    useFeynmanStore.getState().start("sp", page({ markdown: "# 커버리지 본문 B" }));
    await useFeynmanStore.getState().explain("스레드는 실행 단위고 자원을 공유한다");
    expect(promoteMock).toHaveBeenCalledWith("sp", "concept-thread");
  });

  it("facet 빈 배열(스텁 위키)이면 판정하지 않는다", async () => {
    okProbe();
    vi.mocked(extractFacets).mockResolvedValue([]);
    useFeynmanStore.getState().start("sp", page({ markdown: "# 커버리지 본문 C" }));
    await useFeynmanStore.getState().explain("설명");
    expect(judgeCoverage).not.toHaveBeenCalled();
    expect(useFeynmanStore.getState().session!.coverage).toBeUndefined();
  });

  it("판정 실패는 조용히 삼킨다 — 세션 error 불변, 승급 없음(fail-closed)", async () => {
    okProbe();
    vi.mocked(extractFacets).mockResolvedValue(FACETS);
    vi.mocked(judgeCoverage).mockRejectedValue(new Error("HTTP 503"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useFeynmanStore.getState().start("sp", page({ markdown: "# 커버리지 본문 D" }));
    await useFeynmanStore.getState().explain("설명이다");
    const s = useFeynmanStore.getState().session!;
    expect(s.coverage).toBeUndefined();
    expect(s.error).toBeUndefined(); // probe 는 성공 — 커버리지 실패가 파인만 흐름을 오염시키지 않는다
    expect(promoteMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("키가 없으면 커버리지 파이프라인 자체를 태우지 않는다", async () => {
    okProbe();
    localStorage.removeItem("gemini-key");
    useFeynmanStore.getState().start("sp", page({ markdown: "# 커버리지 본문 E" }));
    await useFeynmanStore.getState().explain("설명");
    expect(extractFacets).not.toHaveBeenCalled();
  });

  it("facet 은 위키 버전당 1회 — 같은 본문 재설명은 캐시를 쓴다", async () => {
    okProbe();
    vi.mocked(extractFacets).mockResolvedValue(FACETS);
    vi.mocked(judgeCoverage).mockResolvedValue(judged());
    vi.mocked(clearOk).mockReturnValue(false);
    useFeynmanStore.getState().start("sp", page({ markdown: "# 커버리지 본문 F" }));
    await useFeynmanStore.getState().explain("첫 설명");
    await useFeynmanStore.getState().explain("이어지는 다른 설명");
    expect(extractFacets).toHaveBeenCalledTimes(1);
    expect(judgeCoverage).toHaveBeenCalledTimes(2);
  });
});

describe("finish — 기록을 위키 본문에 저장한다", () => {
  it("세션이 본문 최하단에 append 되고 최신이 위로 온다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "스택은요?", targetGap: "why" });
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("스레드는 실행 단위");
    await useFeynmanStore.getState().finish(true);

    const saved = vi.mocked(ipc.saveWiki).mock.calls[0][1];
    const { body, sessions } = splitFeynmanSection(saved.markdown);
    expect(body).toBe(BODY);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].verdict).toBe("understood");
    // 답 없이 매달린 마지막 되물음은 안 남는다 — 기록은 내 답변으로 끝나야 복기가 된다.
    expect(sessions[0].turns).toEqual([{ role: "user", text: "스레드는 실행 단위" }]);
  });

  it("기록은 내 답변으로 끝난다 — 답 없이 매달린 되물음을 뗀다", async () => {
    // 흐름이 나→되묻기→나→되묻기… 라 판정 버튼은 항상 되물음 직후에 눌린다.
    // 그대로 저장하면 기록이 물음표로 끝나 "그래서 뭐라고 답했더라" 가 된다.
    vi.mocked(probeExplanation)
      .mockResolvedValueOnce({ probe: "스택도 공유되나요?", targetGap: "why" })
      .mockResolvedValueOnce({ probe: "그럼 힙은요?", targetGap: "why" });
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("스레드는 실행 단위");
    await useFeynmanStore.getState().explain("스택은 따로예요");
    await useFeynmanStore.getState().finish(true);

    const { sessions } = splitFeynmanSection(vi.mocked(ipc.saveWiki).mock.calls[0][1].markdown);
    expect(sessions[0].turns).toEqual([
      { role: "user", text: "스레드는 실행 단위" },
      { role: "probe", text: "스택도 공유되나요?" },
      { role: "user", text: "스택은 따로예요" },
    ]);
    expect(sessions[0].turns[sessions[0].turns.length - 1].role).toBe("user");
  });

  it("되물음이 실패해 이미 내 답변으로 끝나면 그대로 둔다", async () => {
    vi.mocked(probeExplanation).mockRejectedValue(new Error("죽음"));
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("내 설명");
    await useFeynmanStore.getState().finish(true);

    const { sessions } = splitFeynmanSection(vi.mocked(ipc.saveWiki).mock.calls[0][1].markdown);
    expect(sessions[0].turns).toEqual([{ role: "user", text: "내 설명" }]);
  });

  it("기록 직후에는 '문서 바뀜' 배지가 뜨지 않는다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("설명");
    await useFeynmanStore.getState().finish(true);

    const saved = vi.mocked(ipc.saveWiki).mock.calls[0][1];
    const { sessions } = splitFeynmanSection(saved.markdown);
    // 배지 판정식과 동일한 비교. 이게 깨지면 배지가 상시 점등한다.
    expect(sessions[0].bodyHash).toBe(bodyHash(saved.markdown));
  });

  it("probing 중에는 판정하지 않는다", async () => {
    vi.mocked(probeExplanation).mockReturnValue(new Promise(() => {}) as never);
    useFeynmanStore.getState().start("sp", page());
    void useFeynmanStore.getState().explain("설명");
    await useFeynmanStore.getState().finish(true);
    expect(ipc.saveWiki).not.toHaveBeenCalled();
  });

  it("저장 실패 시 세션을 날리지 않는다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    vi.mocked(ipc.saveWiki).mockRejectedValue(new Error("디스크 죽음"));
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("설명");
    await useFeynmanStore.getState().finish(true);
    const s = useFeynmanStore.getState().session;
    expect(s).not.toBeNull();
    expect(s!.error).toBeTruthy();
    expect(s!.history).toHaveLength(2);
    expect(s!.saving).toBe(false); // 다시 시도할 수 있어야 한다
  });

  it("후행 개행 있는 본문에서도 배지가 안 뜬다", async () => {
    // 병합·편집을 거친 .md 의 정상 형태. split 이 조건부로만 다듬으면 여기서 해시가 어긋난다.
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    const nl = page({ markdown: `${BODY}\n` });
    vi.mocked(ipc.readWiki).mockResolvedValue(nl);
    useFeynmanStore.getState().start("sp", nl);
    await useFeynmanStore.getState().explain("설명");
    await useFeynmanStore.getState().finish(true);

    const saved = vi.mocked(ipc.saveWiki).mock.calls[0][1];
    expect(splitFeynmanSection(saved.markdown).sessions[0].bodyHash).toBe(bodyHash(saved.markdown));
  });

  it("읽을 수 없는 블록(unparsed)이 저장을 건너 살아남는다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    const broken = page({ markdown: `${BODY}\n\n## 파인만 기록\n\n### 깨진 헤더\n\n> 잃으면 안 되는 말\n` });
    vi.mocked(ipc.readWiki).mockResolvedValue(broken);
    useFeynmanStore.getState().start("sp", broken);
    await useFeynmanStore.getState().explain("설명");
    await useFeynmanStore.getState().finish(true);

    expect(vi.mocked(ipc.saveWiki).mock.calls[0][1].markdown).toContain("잃으면 안 되는 말");
  });

  // 스토어는 디스크만 안다. 이 반환값이 없으면 호출부가 wikiBySlug 를 못 갱신하고,
  // 판정 직후 접힌 카드가 같은 앱 세션에서 영영 안 나타난다(e2e 가 실제로 잡은 버그).
  it("finish 가 저장된 페이지를 돌려준다 — 호출부가 메모리 사본을 갱신할 수 있게", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("설명");
    const saved = await useFeynmanStore.getState().finish(true);
    expect(saved).not.toBeNull();
    expect(splitFeynmanSection(saved!.markdown).sessions).toHaveLength(1);
  });

  it("저장 실패면 null 을 돌려준다 — 호출부가 stale 페이지로 덮지 않게", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    vi.mocked(ipc.saveWiki).mockRejectedValue(new Error("디스크 죽음"));
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("설명");
    expect(await useFeynmanStore.getState().finish(true)).toBeNull();
  });

  it("판정 버튼 더블클릭이 저장을 두 번 태우지 않는다", async () => {
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().explain("설명");
    await Promise.all([useFeynmanStore.getState().finish(true), useFeynmanStore.getState().finish(true)]);
    expect(vi.mocked(ipc.saveWiki).mock.calls).toHaveLength(1);
  });
});

describe("dismiss — [닫기]", () => {
  it("세션을 닫고 이 페이지를 dismissed 에 기록한다", () => {
    useFeynmanStore.getState().start("sp", page());
    useFeynmanStore.getState().dismiss();
    expect(useFeynmanStore.getState().session).toBeNull();
    expect(useFeynmanStore.getState().dismissed[wikiKey("sp", "thread.md")]).toBeTruthy();
  });
});

describe("requestHint — [아직 모르겠어요] 1단계", () => {
  const HINT = { analogy: "스레드를 작업반에 비유해보세요", questions: ["작업반은 왜 여러 명일까요?"] };

  it("기록을 걷어낸 본문을 맥락으로 힌트를 받아 세션에 싣는다", async () => {
    vi.mocked(analogyHint).mockResolvedValue(HINT);
    const withRecord = page({
      markdown: joinFeynmanSection(BODY, [
        { at: "2026-07-01T00:00:00.000Z", verdict: "understood", bodyHash: "x", turns: [{ role: "user", text: "옛 설명" }] },
      ]),
    });
    useFeynmanStore.getState().start("sp", withRecord);
    await useFeynmanStore.getState().requestHint();
    expect(vi.mocked(analogyHint)).toHaveBeenCalledWith("스레드", BODY, "test-key");
    const s = useFeynmanStore.getState().session!;
    expect(s.hint).toEqual(HINT);
    expect(s.hinting).toBe(false);
  });

  it("힌트가 이미 있으면 다시 부르지 않는다", async () => {
    vi.mocked(analogyHint).mockResolvedValue(HINT);
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().requestHint();
    await useFeynmanStore.getState().requestHint();
    expect(vi.mocked(analogyHint)).toHaveBeenCalledTimes(1);
  });

  it("실패하면 hintError 만 남는다 — 재요청으로 회복한다", async () => {
    vi.mocked(analogyHint).mockRejectedValueOnce(new Error("HTTP 503"));
    useFeynmanStore.getState().start("sp", page());
    await useFeynmanStore.getState().requestHint();
    let s = useFeynmanStore.getState().session!;
    expect(s.hint).toBeUndefined();
    expect(s.hintError).toContain("503");
    expect(s.hinting).toBe(false);

    vi.mocked(analogyHint).mockResolvedValueOnce(HINT);
    await useFeynmanStore.getState().requestHint();
    s = useFeynmanStore.getState().session!;
    expect(s.hint).toEqual(HINT);
    expect(s.hintError).toBeUndefined();
  });

  it("stale 힌트 — 닫힌 세션을 되살리지 않는다", async () => {
    let release!: (v: typeof HINT) => void;
    vi.mocked(analogyHint).mockReturnValue(new Promise((r) => (release = r)) as never);
    useFeynmanStore.getState().start("sp", page());
    const p = useFeynmanStore.getState().requestHint();
    useFeynmanStore.getState().dismiss();
    release(HINT);
    await p;
    expect(useFeynmanStore.getState().session).toBeNull();
  });

  it("stale 힌트 — 다른 페이지로 갈아탄 세션에 붙지 않는다", async () => {
    let release!: (v: typeof HINT) => void;
    vi.mocked(analogyHint).mockReturnValue(new Promise((r) => (release = r)) as never);
    useFeynmanStore.getState().start("sp", page());
    const p = useFeynmanStore.getState().requestHint();
    useFeynmanStore.getState().start("sp", page({ path: "other.md", title: "다른 개념" }));
    release(HINT);
    await p;
    expect(useFeynmanStore.getState().session!.hint).toBeUndefined();
  });

  it("힌트가 오는 사이 쓴 설명을 지우지 않는다", async () => {
    let release!: (v: typeof HINT) => void;
    vi.mocked(analogyHint).mockReturnValue(new Promise((r) => (release = r)) as never);
    vi.mocked(probeExplanation).mockResolvedValue({ probe: "왜요?", targetGap: "why" });
    useFeynmanStore.getState().start("sp", page());
    const p = useFeynmanStore.getState().requestHint();
    await useFeynmanStore.getState().explain("힌트 기다리며 쓴 설명");
    release(HINT);
    await p;
    const s = useFeynmanStore.getState().session!;
    expect(s.history).toEqual([
      { role: "user", text: "힌트 기다리며 쓴 설명" },
      { role: "probe", text: "왜요?" },
    ]);
    expect(s.hint).toEqual(HINT);
  });

  it("설명 없이 [그래도 모르겠어요] — turns 빈 not_yet 기록이 남는다", async () => {
    useFeynmanStore.getState().start("sp", page());
    const saved = await useFeynmanStore.getState().finish(false);
    const { sessions } = splitFeynmanSection(saved!.markdown);
    expect(sessions[0].verdict).toBe("not_yet");
    expect(sessions[0].turns).toEqual([]);
  });
});

// 위키·공간 삭제 시 고아 세션 정리 — 세션은 전역 싱글턴이고 자동 열기가 세션 존재 시
// bail out 하므로, 안 걷어내면 신규 개념 파인만 자동 열기가 앱 종료까지 전부 막힌다.
describe("clearSessionFor — 삭제된 위키·공간의 고아 세션 정리", () => {
  it("space+path 일치(위키 삭제) → 세션 정리", () => {
    useFeynmanStore.getState().start("sp", page());
    useFeynmanStore.getState().clearSessionFor("sp", "thread.md");
    expect(useFeynmanStore.getState().session).toBeNull();
  });

  it("path 생략(공간 삭제) → 그 공간의 세션을 통째로 정리", () => {
    useFeynmanStore.getState().start("sp", page());
    useFeynmanStore.getState().clearSessionFor("sp");
    expect(useFeynmanStore.getState().session).toBeNull();
  });

  it("다른 위키·다른 공간 삭제는 진행 중 세션을 건드리지 않는다", () => {
    useFeynmanStore.getState().start("sp", page());
    useFeynmanStore.getState().clearSessionFor("sp", "other.md");
    useFeynmanStore.getState().clearSessionFor("other-space");
    expect(useFeynmanStore.getState().session).not.toBeNull();
  });

  it("dismiss 와 달리 dismissed 에 기록하지 않는다 — 같은 경로가 재생성되면 자동 열기가 살아있어야 한다", () => {
    useFeynmanStore.getState().start("sp", page());
    useFeynmanStore.getState().clearSessionFor("sp", "thread.md");
    expect(useFeynmanStore.getState().dismissed[wikiKey("sp", "thread.md")]).toBeUndefined();
  });
});

// 공간 rename 은 slug 까지 바꾼다(rename_space) — 옛 slug 를 안 이으면 세션 저장이 없는
// 공간을 향하고, dismissed 가 풀려 자동 열기가 한 번 더 뜬다.
describe("remapSpace — 공간 slug 변경 리매핑", () => {
  it("세션 space 와 dismissed 키를 새 slug 로 잇는다", () => {
    useFeynmanStore.getState().start("old", page());
    useFeynmanStore.getState().dismiss(); // dismissed["old::thread.md"]
    useFeynmanStore.getState().start("old", page({ path: "other.md", title: "다른 개념" }));
    useFeynmanStore.getState().remapSpace("old", "new");
    const st = useFeynmanStore.getState();
    expect(st.session!.space).toBe("new");
    expect(st.dismissed[wikiKey("new", "thread.md")]).toBeTruthy();
    expect(st.dismissed[wikiKey("old", "thread.md")]).toBeUndefined();
  });

  it("다른 공간의 세션·dismissed 는 그대로다", () => {
    useFeynmanStore.getState().start("other", page());
    useFeynmanStore.getState().dismiss();
    useFeynmanStore.getState().start("other", page({ path: "b.md" }));
    useFeynmanStore.getState().remapSpace("old", "new");
    const st = useFeynmanStore.getState();
    expect(st.session!.space).toBe("other");
    expect(st.dismissed[wikiKey("other", "thread.md")]).toBeTruthy();
  });
});
