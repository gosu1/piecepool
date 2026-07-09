import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      // 4. dev 환경에서 workspace_root(~/PiecePool)가 repo 폴더(~/piecepool)와 대소문자무시 Windows에서
      //    같은 경로로 겹쳐, 앱이 워크스페이스 데이터를 repo 루트에 쓴다. Vite가 이를 감지해 매 쓰기마다
      //    page reload → PDF 업로드/저장이 중단됨. 워크스페이스 하위 구조를 감시에서 제외한다.
      //    (앱은 이 파일들을 Vite 아닌 Tauri IPC(백엔드 fs)로 읽으므로 제외해도 무해)
      ignored: [
        "**/src-tauri/**",
        "**/{archive,wiki,sources,relations,inbox}/**",
        "**/config/*.json",
      ],
    },
  },
}));
