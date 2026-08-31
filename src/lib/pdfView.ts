// PDF 뷰어 순수 헬퍼 — 줌·페이지 클램프. UI와 분리해 vitest로 검증한다.

/** 줌 배율을 0.1~3.0 범위로 클램프. 하한 0.1 — 폭 넓은(16:9) 슬라이드 PDF도 폭 맞춤이 패널에 들어가도록. */
export function clampZoom(z: number): number {
  return Math.min(3.0, Math.max(0.1, z));
}

/** 페이지 번호를 1~total 범위로 클램프. total이 0(미로드)이면 1. */
export function clampPage(p: number, total: number): number {
  if (total < 1) return 1;
  return Math.min(total, Math.max(1, p));
}

/** 링크(`[[a.pdf#page=N]]`)가 지정한 page 를 실제 표시할 page 로 옮긴다.
 *  총 page 수를 넘으면 첫 page 를 보여주고 over 를 세운다 — 계약 §3.2 는 조용한 클램프를 금지한다.
 *  total 이 0 이면 아직 문서를 안 읽은 상태다. 여기서 판정하면 모든 링크가 1쪽으로 무너지므로 미룬다. */
export function resolveInitialPage(want: number, total: number): { page: number; over: boolean } {
  if (total < 1) return { page: Math.max(1, want), over: false };
  if (want > total) return { page: 1, over: true };
  return { page: Math.max(1, want), over: false };
}
