import { describe, it, expect } from "vitest";
import { buildMergeBody, runWikiMerge } from "./mergeWiki";
import { TASK_MODELS } from "./gemini";
import type { LlmConcept } from "./provider";

const EXISTING = "# 교착 상태\n\n1주차: 둘 이상의 프로세스가 서로를 기다리며 멈춘 상태.\n\n## 내 메모\n시험에 나온다고 하심";

const NEW: LlmConcept = {
  title: "교착 상태",
  summary: "네 가지 필요조건이 동시에 성립할 때 발생한다",
  explanation: "상호배제, 점유대기, 비선점, 순환대기.",
  examples: ["두 스레드가 mutex A, B 를 반대 순서로 잡는 경우"],
  sourceRefs: [],
  sourceEmbeds: ["![[lec3.pdf#page=4]]"],
};

const SOURCE = { sourceId: "source-week3", archivePath: "archive/2026-07-15-os.md", title: "OS 3주차" };

describe("buildMergeBody — 기존 본문 + 새 내용을 한 편으로 통합하는 요청", () => {
  it("기존 본문과 새 개념을 모두 프롬프트에 싣는다", () => {
    const b = buildMergeBody(EXISTING, NEW, SOURCE);
    expect(b.model).toBe(TASK_MODELS.wikiMerge); // 모델명 하드코딩 금지 — 단종 시 거짓 실패
    const user = b.messages[1].content;
    expect(user).toContain("1주차: 둘 이상의 프로세스"); // 기존 본문
    expect(user).toContain("네 가지 필요조건"); // 새 요약
    expect(user).toContain("상호배제, 점유대기"); // 새 설명
    expect(user).toContain("mutex A, B"); // 새 예시
    expect(user).toContain("![[lec3.pdf#page=4]]"); // 새 근거 임베드
    expect(user).toContain("OS 3주차"); // 출처 노트 맥락
  });

  it("system 이 사실 보존·링크 보존·사용자 편집 보호를 강제한다", () => {
    const sys = buildMergeBody(EXISTING, NEW, SOURCE).messages[0].content;
    expect(sys).toContain("삭제하지 않는다"); // 기존 사실 보존
    expect(sys).toContain("[[위키링크]]"); // 링크/임베드 원형 유지
    expect(sys).toContain("사용자가 직접 쓴"); // 사용자 편집 구역 보호
    expect(sys).toContain("# 교착 상태"); // 첫 줄 제목 유지 지시
    expect(sys).toContain("원문 표기를 그대로"); // 언어 directive(ko)
  });

  it("lang='en' — 언어 directive 가 영어로 바뀐다", () => {
    const sys = buildMergeBody(EXISTING, NEW, SOURCE, undefined, "en").messages[0].content;
    expect(sys).toContain("Write all prose in English");
  });
});

describe("runWikiMerge", () => {
  it("Gemini 응답 본문을 그대로 반환", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "# 교착 상태\n\n통합된 본문" } }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const md = await runWikiMerge(EXISTING, NEW, SOURCE, "sk-test", { fetchFn });
    expect(md).toBe("# 교착 상태\n\n통합된 본문");
  });

  it("키가 없으면 던진다 — 호출부가 폴백을 결정한다", async () => {
    await expect(runWikiMerge(EXISTING, NEW, SOURCE, "")).rejects.toThrow(/auth/);
  });

  it("빈 응답이면 던진다 — 빈 본문으로 기존 위키를 덮지 않는다", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "  " } }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(runWikiMerge(EXISTING, NEW, SOURCE, "sk-test", { fetchFn })).rejects.toThrow(/빈 응답/);
  });
});
