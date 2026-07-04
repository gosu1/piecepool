// 플랫폼/런타임 감지 — ipc.ts(폴백 분기)와 TitlebarRow(신호등 인셋)가 공유.
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// macOS overlay 타이틀바(신호등 인라인) 여부 — 브라우저 dev 나 타 OS 에선 인셋 스페이서를 그리지 않는다.
export const macOverlayChrome = inTauri && typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
