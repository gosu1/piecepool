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
