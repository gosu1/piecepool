import { spawnSync } from "node:child_process";

function hasCommand(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

const hasCargo = hasCommand("cargo");
const hasRustc = hasCommand("rustc");

if (!hasCargo || !hasRustc) {
  console.error(`
PiecePool 데스크톱 앱을 실행하려면 Rust/Cargo가 필요합니다.
Tauri가 네이티브 데스크톱 창을 만들 때 cargo를 사용하기 때문에, cargo가 없으면 앱 창이 뜨기 전에 종료됩니다.

설치:
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

설치 후 현재 터미널에 적용:
  source "$HOME/.cargo/env"

확인:
  cargo --version
  rustc --version

다시 실행:
  npm run dev
`);
  process.exit(1);
}
