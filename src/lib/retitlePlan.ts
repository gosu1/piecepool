import { normalizeTitle } from "./llmApply";
import type { RetitleSuggestion } from "../llm/retitle";

// 제목 정리 제안 → 실행 계획. rename 은 병합이 아니다 — 대상 제목이 이미 다른 페이지에
// 있으면(normalizedTitle 기준, llm-output-schema.md 의 dedup 과 같은 키) conflict 로 막고
// 사용자에게 수동 병합을 맡긴다. 같은 배치 안에서 두 제안이 한 제목을 노리는 경우도 뒤가 conflict.

export interface RetitlePlanRow {
  file: string; // WikiPage.path
  from: string;
  to: string;
  /** 적용 불가 — 대상 제목이 이미 있다(다른 페이지 또는 앞선 제안이 선점) */
  conflict: boolean;
}

export function planRetitles(wikis: { path: string; title: string }[], suggestions: RetitleSuggestion[]): RetitlePlanRow[] {
  const byTitle = new Map<string, { path: string; title: string }>();
  const existing = new Map<string, string>(); // normalizeTitle → path
  for (const w of wikis) {
    if (!byTitle.has(w.title)) byTitle.set(w.title, w);
    if (!existing.has(normalizeTitle(w.title))) existing.set(normalizeTitle(w.title), w.path);
  }

  const taken = new Set<string>();
  const rows: RetitlePlanRow[] = [];
  for (const s of suggestions) {
    const page = byTitle.get(s.from);
    if (!page) continue; // LLM 이 지어낸 from — 버린다
    const norm = normalizeTitle(s.to);
    // 케이스만 고치는 self-rename("attention"→"Attention")은 겹침이 아니다 — 같은 페이지다.
    const conflict = (existing.has(norm) && existing.get(norm) !== page.path) || taken.has(norm);
    if (!conflict) taken.add(norm);
    rows.push({ file: page.path, from: s.from, to: s.to, conflict });
  }
  return rows;
}
