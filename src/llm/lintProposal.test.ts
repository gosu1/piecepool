import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ipc from "../lib/ipc";
import {
  applyProposal,
  buildLintBody,
  collectCandidates,
  proposeLint,
  validateProposals,
  type LintCandidate,
} from "./lintProposal";

const WIKI = [
  "# 제1종 오류",
  "",
  "귀무가설이 참인데도 기각하는 오류.",
  "",
  "## 정의",
  "",
  "유의수준 α 가 이 오류를 낼 확률이다.",
  "",
  "## 근거",
  "",
  "![[통계정리.pdf]]",
  "",
  "## 파인만 기록",
  "",
  "- 2026-08-24 설명함",
  "",
].join("\n");

vi.mock("../lib/ipc", () => ({
  listSpaces: vi.fn(async () => [
    { id: "s1", name: "통계학", slug: "통계학", rootPath: "", createdAt: "", updatedAt: "" },
  ]),
  listWiki: vi.fn(async () => [{ path: "type-i-error.md", title: "제1종 오류", markdown: WIKI }]),
  readWiki: vi.fn(async () => ({ id: "w1", title: "제1종 오류", path: "type-i-error.md", markdown: WIKI })),
  saveWiki: vi.fn(async (_space: string, page: unknown) => page),
}));

const CANDIDATES: LintCandidate[] = [
  { space: "통계학", file: "type-i-error.md", title: "제1종 오류", sections: ["정의"] },
];

const item = (over: Record<string, unknown> = {}) => ({
  space: "통계학",
  file: "type-i-error.md",
  section: "정의",
  block: "위양성(false positive)이라고도 부른다.",
  reason: "대화에서 확인한 다른 이름",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("collectCandidates", () => {
  it("글을 넣을 수 있는 소제목만 모은다 — 근거·파인만 기록은 뺀다", async () => {
    const out = await collectCandidates();
    expect(out).toHaveLength(1);
    expect(out[0].sections).toEqual(["정의"]);
  });

  it("이번 대화에서 읽은 위키가 있으면 그것만 본다", async () => {
    expect(await collectCandidates(["통계학/type-i-error.md"])).toHaveLength(1);
    expect(await collectCandidates(["다른폴더/없는파일.md"])).toHaveLength(0);
  });
});

describe("validateProposals", () => {
  it("있는 소제목이면 그 아래 넣는다", () => {
    const out = validateProposals({ items: [item()] }, CANDIDATES);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("under");
    expect(out[0].title).toBe("제1종 오류");
  });

  it("없는 소제목이면 새로 만드는 것으로 표시한다", () => {
    const out = validateProposals({ items: [item({ section: "헷갈리는 개념" })] }, CANDIDATES);
    expect(out[0].kind).toBe("new-section");
  });

  it("지어낸 파일은 버린다", () => {
    const raw = { items: [item({ file: "없는파일.md" }), item({ space: "없는폴더" }), item()] };
    const out = validateProposals(raw, CANDIDATES);
    expect(out).toHaveLength(1);
  });

  it("살아남은 제안은 전부 진짜 있는 파일을 가리킨다", () => {
    const raw = {
      items: [item(), item({ file: "가짜.md" }), item({ section: "새 소제목", block: "다른 글" })],
    };
    const paths = new Set(CANDIDATES.map((c) => `${c.space}/${c.file}`));
    for (const p of validateProposals(raw, CANDIDATES)) {
      expect(paths.has(`${p.space}/${p.file}`)).toBe(true);
      // kind 가 실제 소제목 유무와 맞아야 저장 단계에서 안 터진다
      const has = CANDIDATES[0].sections.includes(p.section);
      expect(p.kind).toBe(has ? "under" : "new-section");
    }
  });

  it("파인만 기록과 근거는 대상이 아니다", () => {
    const raw = { items: [item({ section: "파인만 기록" }), item({ section: "근거" })] };
    expect(validateProposals(raw, CANDIDATES)).toHaveLength(0);
  });

  it("빈 글이나 빈 소제목은 버린다", () => {
    const raw = { items: [item({ block: "   " }), item({ section: "" })] };
    expect(validateProposals(raw, CANDIDATES)).toHaveLength(0);
  });

  it("같은 자리에 같은 글은 한 번만", () => {
    expect(validateProposals({ items: [item(), item()] }, CANDIDATES)).toHaveLength(1);
  });

  it("응답이 깨져 있으면 빈 배열", () => {
    expect(validateProposals(null, CANDIDATES)).toEqual([]);
    expect(validateProposals({ items: "글자" }, CANDIDATES)).toEqual([]);
    expect(validateProposals({}, CANDIDATES)).toEqual([]);
  });
});

describe("buildLintBody", () => {
  it("대화와 위키 목록을 함께 넘기고 쿼리바 모델을 쓴다", () => {
    const body = JSON.parse(
      buildLintBody([{ role: "user", text: "제1종 오류가 위양성이야?" }], CANDIDATES),
    );
    expect(body.model).toBe("gemini-3.1-flash-lite");
    expect(body.messages[1].content).toContain("제1종 오류가 위양성이야?");
    expect(body.messages[1].content).toContain("통계학/type-i-error.md");
    expect(body.messages[1].content).toContain("소제목: 정의");
    expect(body.response_format.json_schema.name).toBe("LintProposals");
  });
});

describe("proposeLint", () => {
  const reply = (items: unknown) =>
    vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items }) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

  it("응답을 걸러서 돌려준다", async () => {
    const out = await proposeLint([{ role: "user", text: "물음" }], [], "key", {
      fetchFn: reply([item(), item({ file: "가짜.md" })]) as unknown as typeof fetch,
      backoffMs: 0,
    });
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe("type-i-error.md");
  });

  it("키가 없으면 호출조차 하지 않는다", async () => {
    await expect(proposeLint([], [], "  ")).rejects.toThrow(/API key/);
  });

  it("후보가 없으면 AI 를 부르지 않는다", async () => {
    const fetchFn = reply([]);
    const out = await proposeLint([], [], "key", {
      candidates: [],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(out).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("applyProposal", () => {
  it("소제목 아래 넣어 저장한다 — 원문은 그대로 남는다", async () => {
    await applyProposal({
      space: "통계학",
      file: "type-i-error.md",
      title: "제1종 오류",
      section: "정의",
      block: "위양성이라고도 부른다.",
      reason: "",
      kind: "under",
    });
    const saved = vi.mocked(ipc.saveWiki).mock.calls[0][1] as { markdown: string };
    expect(saved.markdown).toContain("위양성이라고도 부른다.");
    // 넣은 글자 수만큼만 늘었다 = 원문을 한 글자도 안 건드렸다
    expect(saved.markdown.length).toBe(WIKI.length + "\n위양성이라고도 부른다.".length);
    expect(saved.markdown).toContain("## 파인만 기록");
  });

  it("새 소제목은 파인만 기록 앞에 만든다", async () => {
    await applyProposal({
      space: "통계학",
      file: "type-i-error.md",
      title: "제1종 오류",
      section: "헷갈리는 개념",
      block: "제2종 오류와 반대다.",
      reason: "",
      kind: "new-section",
    });
    const saved = vi.mocked(ipc.saveWiki).mock.calls[0][1] as { markdown: string };
    expect(saved.markdown.indexOf("## 헷갈리는 개념")).toBeLessThan(saved.markdown.indexOf("## 파인만 기록"));
  });

  it("넣을 자리가 없으면 던진다 — 저장하지 않는다", async () => {
    await expect(
      applyProposal({
        space: "통계학",
        file: "type-i-error.md",
        title: "제1종 오류",
        section: "없는 소제목",
        block: "글",
        reason: "",
        kind: "under",
      }),
    ).rejects.toThrow(/소제목/);
    expect(ipc.saveWiki).not.toHaveBeenCalled();
  });
});
