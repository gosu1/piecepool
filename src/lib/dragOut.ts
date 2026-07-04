import { startDrag } from "@crabnebula/tauri-plugin-drag";

// 트리 노드를 앱 밖(다른 앱/LLM 프롬프트, Finder)으로 끌어 실제 파일을 드롭한다.
// macOS WKWebView 는 HTML5 파일 드래그-아웃을 지원하지 않아 네이티브 OS 드래그 세션을 쓴다.
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// 드래그 프리뷰 — 작은 문서 글리프(인라인 PNG, 번들 리소스 불필요).
const DRAG_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAXElEQVR42u3XwQkAIAxDUbfy7AjuP4xePacJCP2B3h82CB2DkG6Zax9loiAlMZQKiqEqoAiqCrKjHCArygWyoV6Q+gXEQN+9ECA6BIgOsTI6xMoAdQU5h9ObtMsFU6mUhxwO6N8AAAAASUVORK5CYII=";

/** 절대경로의 파일을 OS 네이티브 드래그로 내보낸다(복사). Tauri 밖이면 no-op. */
export function startFileDragOut(absPath: string) {
  if (!inTauri) return;
  // onDragStart 제스처 안에서 동기 호출 — fire-and-forget.
  startDrag({ item: [absPath], icon: DRAG_ICON, mode: "copy" }).catch(() => {});
}
