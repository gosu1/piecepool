import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./ds";
import { inTauri } from "./lib/platform";
import "./styles/index.css";

// Tauri(WebView2)가 브라우저보다 UI를 크게 렌더하는 문제 — Tauri에서만 전체 웹뷰 줌을 낮춰
// 웹 미리보기와 비슷한 밀도로 맞춘다(브라우저 Ctrl+- 와 동일 방식이라 100vh 레이아웃도 안 깨짐).
// 값은 눈대중 튜닝용 — 여기 숫자만 바꾸면 됨.
const TAURI_ZOOM = 0.85;
if (inTauri) {
  import("@tauri-apps/api/webview")
    .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(TAURI_ZOOM))
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
