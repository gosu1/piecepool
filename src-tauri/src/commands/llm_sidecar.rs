use std::sync::Arc;

use tauri::State;

use crate::llm_sidecar::{SidecarManager, SidecarState};

/// 로컬 추론 sidecar 상태 조회. 로직은 llm_sidecar/ 모듈 (command는 thin).
#[tauri::command]
pub fn llm_sidecar_status(manager: State<'_, Arc<SidecarManager>>) -> SidecarState {
    manager.snapshot()
}
