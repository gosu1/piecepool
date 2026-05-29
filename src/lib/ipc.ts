import { invoke } from "@tauri-apps/api/core";
import type { Workspace } from "./types";

// Tauri command 타입 래퍼. SSOT: docs/20-backend/ipc-api.md (작성 예정).

export function getWorkspace(): Promise<Workspace> {
  return invoke<Workspace>("get_workspace");
}
