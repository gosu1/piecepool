import { describe, it, expect } from "vitest";
import { parseCalloutMarker, remarkCallout, type MdNode } from "./callout";

describe("parseCalloutMarker", () => {
  it("[!easy] + 제목", () => {
    expect(parseCalloutMarker("[!easy] 쉬운 설명")).toEqual({ type: "easy", title: "쉬운 설명" });
  });
  it("제목 없으면 타입 기본 라벨", () => {
    expect(parseCalloutMarker("[!easy]")).toEqual({ type: "easy", title: "쉬운 설명" });
    expect(parseCalloutMarker("[!note]")).toEqual({ type: "note", title: "노트" });
  });
  it("[!note] + 제목", () => {
    expect(parseCalloutMarker("[!note] 메모")).toEqual({ type: "note", title: "메모" });
  });
  it("모르는 타입/일반 텍스트 → null", () => {
    expect(parseCalloutMarker("[!warning] 위험")).toBeNull();
    expect(parseCalloutMarker("그냥 인용문")).toBeNull();
  });
});

// ── remarkCallout — 손으로 만든 mdast 로 변환 검증 ──
const text = (value: string): MdNode => ({ type: "text", value });
const para = (...children: MdNode[]): MdNode => ({ type: "paragraph", children });
const quote = (...children: MdNode[]): MdNode => ({ type: "blockquote", children });
const root = (...children: MdNode[]): MdNode => ({ type: "root", children });

describe("remarkCallout", () => {
  it("[!easy] → details + summary, 마커 줄 제거", () => {
    const q = quote(para(text("[!easy] 쉬운 설명\n우편배달부 비유로 설명한다.")));
    remarkCallout()(root(q));
    expect(q.data?.hName).toBe("details");
    expect((q.data?.hProperties as { className: string[] }).className).toContain("pp-callout-easy");
    const [summary, body] = q.children!;
    expect(summary.data?.hName).toBe("summary");
    expect(summary.children![0].value).toBe("쉬운 설명");
    expect(body.children![0].value).toBe("우편배달부 비유로 설명한다.");
  });
  it("[!note] → div (접기 아님)", () => {
    const q = quote(para(text("[!note] 메모\n내용")));
    remarkCallout()(root(q));
    expect(q.data?.hName).toBe("div");
    expect((q.data?.hProperties as { className: string[] }).className).toContain("pp-callout-note");
    expect(q.children![0].children![0].value).toBe("메모");
  });
  it("마커 없는 인용문은 그대로", () => {
    const q = quote(para(text("일반 인용문")));
    remarkCallout()(root(q));
    expect(q.data).toBeUndefined();
    expect(q.children![0].children![0].value).toBe("일반 인용문");
  });
  it("마커 단독 첫 문단 + 본문 문단 → 빈 문단 제거", () => {
    const q = quote(para(text("[!easy]")), para(text("본문 문단")));
    remarkCallout()(root(q));
    const kids = q.children!;
    expect(kids).toHaveLength(2); // summary + 본문
    expect(kids[0].data?.hName).toBe("summary");
    expect(kids[1].children![0].value).toBe("본문 문단");
  });
  it("중첩 컨테이너 안쪽도 걷는다", () => {
    const q = quote(para(text("[!easy] 쉬운 설명\n내용")));
    remarkCallout()(root({ type: "list", children: [{ type: "listItem", children: [q] }] }));
    expect(q.data?.hName).toBe("details");
  });
});
