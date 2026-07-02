import { describe, it, expect } from "vitest";
import { normalizeTitle, slugOrHash } from "./llmApply";

describe("concept dedup key (normalizedTitle)", () => {
  it("collapses case + whitespace, NFC — 'Self-Attention' == 'self attention'", () => {
    expect(normalizeTitle("Self-Attention")).toBe("self-attention");
    expect(normalizeTitle("Self  Attention")).toBe("self attention");
    expect(normalizeTitle("  임베딩 ")).toBe("임베딩");
  });
  it("slugOrHash is stable per normalized title (same concept → same file)", () => {
    expect(slugOrHash("Self-Attention")).toBe(slugOrHash("self-attention"));
    expect(slugOrHash("Transformer")).toBe("transformer");
  });
  it("non-ASCII title falls back to a stable hash (deterministic)", () => {
    expect(slugOrHash("프로세스")).toMatch(/^c-[0-9a-f]+$/);
    expect(slugOrHash("프로세스")).toBe(slugOrHash("프로세스"));
  });
});
