import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type { UnderstandingMap } from "../lib/types";

// 이해 안개 상태 — <space>/config/understanding.json 사이드카의 메모리 사본.
// 상태 없음 = hazy(안개)가 기본값이라 로드 실패·파일 없음도 그대로 안개다(fail-closed).
// 승급(hazy→clear)은 커버리지 판정 clearOk(coverage.ts)가 참일 때만 — 낙관적 승급 금지.
// 설계: docs/superpowers/specs/2026-07-26-facet-coverage-design.md §4-4·§4-5.

interface UnderstandingStore {
  /** space slug → (conceptId → 항목) */
  bySpace: Record<string, UnderstandingMap>;
  load: (space: string) => Promise<void>;
  /** hazy → clear 승급. 저장 실패는 조용히 삼킨다 — 상태 불변(안개 유지)이 원칙이다. */
  promote: (space: string, conceptId: string) => Promise<void>;
}

export const useUnderstandingStore = create<UnderstandingStore>()((set) => ({
  bySpace: {},

  load: async (space) => {
    try {
      const m = await ipc.getUnderstanding(space);
      set((s) => ({ bySpace: { ...s.bySpace, [space]: m } }));
    } catch (e) {
      console.warn(`[understanding] 로드 실패 — 안개 유지: ${e}`);
    }
  },

  promote: async (space, conceptId) => {
    try {
      const m = await ipc.setUnderstanding(space, conceptId, "clear");
      set((s) => ({ bySpace: { ...s.bySpace, [space]: m } }));
    } catch (e) {
      console.warn(`[understanding] 승급 저장 실패 — 상태 불변: ${e}`);
    }
  },
}));
