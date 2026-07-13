// Quick Memo 창 상태 — localStorage 기반(settings.ts 와 동형, 이 기기에만 저장).
// SSOT: docs/superpowers/specs/2026-07-13-quickmemo-per-note-design.md
//
// 여기 남는 것은 창의 위치·크기뿐이다. 그것은 메모의 *내용*이 아니라 *창을 어디에 두고 싶은가* 라는
// 취향이라 전역이다 — 노트마다 창이 다른 자리에서 튀어나오면 더 나쁘다.
// 메모 원문은 노트에 종속된다(InboxDraft.memo) — 노트가 죽으면 메모도 죽는다.
// 정리본은 아무 데도 저장하지 않는다 — 원문에서 다시 만들 수 있는 파생물이고, 저장하면
// "원문과 정리본이 어긋난 상태"를 관리해야 한다.

const POS_KEY = "quickmemo-pos";
const SIZE_KEY = "quickmemo-size";

export interface MemoPos {
  x: number;
  y: number;
}

export interface MemoSize {
  w: number;
  h: number;
}

export const MEMO_DEFAULT_SIZE: MemoSize = { w: 340, h: 400 };
const MIN_W = 240;
const MIN_H = 200;

function ls(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function getMemoPos(): MemoPos | null {
  const raw = ls()?.getItem(POS_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<MemoPos>;
    if (typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
  } catch {
    /* 손상된 값 무시 — 기본 위치로 */
  }
  return null;
}

export function setMemoPos(pos: MemoPos): void {
  ls()?.setItem(POS_KEY, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }));
}

/** 창이 화면 밖으로 나가지 않게 가둔다(해상도가 바뀌어 저장된 위치가 무효해질 수 있다). */
export function clampPos(pos: MemoPos, w: number, h: number, vw: number, vh: number): MemoPos {
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(vw - w, 0)),
    y: Math.min(Math.max(pos.y, 0), Math.max(vh - h, 0)),
  };
}

export function getMemoSize(): MemoSize | null {
  const raw = ls()?.getItem(SIZE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<MemoSize>;
    if (typeof s.w === "number" && typeof s.h === "number") return { w: s.w, h: s.h };
  } catch {
    /* 손상된 값 무시 — 기본 크기로 */
  }
  return null;
}

export function setMemoSize(size: MemoSize): void {
  ls()?.setItem(SIZE_KEY, JSON.stringify({ w: Math.round(size.w), h: Math.round(size.h) }));
}

/** 최소 크기 아래로 줄거나 화면보다 커지지 않게 가둔다. */
export function clampSize(size: MemoSize, vw: number, vh: number): MemoSize {
  return {
    w: Math.min(Math.max(size.w, MIN_W), Math.max(vw, MIN_W)),
    h: Math.min(Math.max(size.h, MIN_H), Math.max(vh, MIN_H)),
  };
}
