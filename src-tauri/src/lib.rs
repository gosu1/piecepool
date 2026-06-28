// PiecePool — Tauri backend entry.
// 모듈 경계: docs/20-backend/README.md, architecture.md (작성 예정).
// LLM 오케스트레이션은 Rust가 아니라 TS 공유 어댑터(src/llm/)에 있다 (결정: TS shared adapter).
#![allow(dead_code)] // scaffold 단계 — 모듈 구현되면 제거

pub mod commands;
pub mod error;
pub mod import;
pub mod llm_sidecar;
pub mod models;
pub mod pdf;
pub mod seed;
pub mod storage;

use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 로컬 추론 sidecar — env 경로 있으면 백그라운드 spawn (없으면 Disabled no-op).
    let sidecar = Arc::new(llm_sidecar::SidecarManager::new());
    llm_sidecar::launch(sidecar.clone());
    let shutdown = sidecar.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(sidecar)
        .invoke_handler(tauri::generate_handler![
            commands::workspace::get_workspace,
            commands::llm_sidecar::llm_sidecar_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app, event| {
            if let tauri::RunEvent::Exit = event {
                shutdown.shutdown();
            }
        });
}
