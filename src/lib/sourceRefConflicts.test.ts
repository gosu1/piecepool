import { describe, it, expect } from "vitest";
import { detectSourceRefConflicts } from "./sourceRefConflicts";
import type { SourceRef } from "./types";

// sourceRefs ↔ 본문 embed 충돌 감지 (수용기준 §2.3) — 감지만, 자동 수정 금지.

const ref = (file: string, opts?: Partial<SourceRef>): SourceRef => ({
  id: "r1",
  sourceId: "s1",
  file,
  embed: true,
  ...opts,
});

describe("detectSourceRefConflicts", () => {
  it("동기화 상태(양쪽 일치) → 충돌 없음", () => {
    expect(detectSourceRefConflicts([ref("a.pdf", { page: 3 })], "본문 ![[a.pdf#page=3]] 끝")).toEqual([]);
  });

  it("frontmatter에만 있는 embed → missing-embed", () => {
    const out = detectSourceRefConflicts([ref("a.pdf")], "embed 없는 본문");
    expect(out).toEqual([{ kind: "missing-embed", file: "a.pdf", page: undefined }]);
  });

  it("본문에만 있는 embed → unregistered-embed (refs 가 존재할 때만)", () => {
    const out = detectSourceRefConflicts([ref("a.pdf")], "![[a.pdf]] ![[b.png]]");
    expect(out).toEqual([{ kind: "unregistered-embed", file: "b.png", page: undefined }]);
  });

  it("refs 가 아예 없는 수동 페이지는 본문 embed 를 충돌로 보지 않는다", () => {
    expect(detectSourceRefConflicts([], "![[image.png]]")).toEqual([]);
  });

  it("page 가 다르면 다른 embed 로 취급", () => {
    const out = detectSourceRefConflicts([ref("a.pdf", { page: 2 })], "![[a.pdf#page=5]]");
    expect(out).toContainEqual({ kind: "missing-embed", file: "a.pdf", page: 2 });
    expect(out).toContainEqual({ kind: "unregistered-embed", file: "a.pdf", page: 5 });
  });

  it("embed:false(링크형 ref)는 본문 embed 를 요구하지 않는다", () => {
    expect(detectSourceRefConflicts([ref("a.pdf", { embed: false })], "본문")).toEqual([]);
  });
});
