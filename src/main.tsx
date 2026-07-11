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

  // 웹뷰 기본 컨텍스트 메뉴(Look Up · Translate · Search with Google · Inspect Element …)는
  // 웹페이지의 것이지 데스크톱 앱의 것이 아니다 — 데스크톱 앱들이 그렇듯 우리 UI 만 보여준다.
  // 앱이 직접 띄우는 메뉴(트리·탭 우클릭)는 React 핸들러라 그대로 뜬다.
  // 브라우저(`npm run dev`)에서는 걸지 않는다 — 개발 중 devtools 를 뺏지 않기 위해.
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
