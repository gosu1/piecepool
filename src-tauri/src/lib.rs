// PiecePool — Tauri backend entry.
// 모듈 경계: docs/20-backend/README.md, architecture.md (작성 예정).
// LLM 오케스트레이션은 Rust가 아니라 TS 공유 어댑터(src/llm/)에 있다 (결정: TS shared adapter).

pub mod commands;
pub mod error;
pub mod graph;
pub mod import;
pub mod models;
pub mod notes;
pub mod pdf;
pub mod priority;
pub mod seed;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .setup(|app| {
            // PDF 글자 대응표(bcmap) 위치를 추출기에 알린다. 안 걸면 배포 앱에서만
            // 한글 CID 폰트 처리가 조용히 빠진다 — pdf::set_bcmaps_dir 주석 참고.
            // 실패해도 앱은 뜬다. 그 PDF 는 프론트 pdf.js 재추출이 받는다(ADR-0011).
            use tauri::Manager;
            match app
                .path()
                .resolve("resources/bcmaps", tauri::path::BaseDirectory::Resource)
            {
                Ok(dir) => {
                    if let Err(e) = pdf::set_bcmaps_dir(&dir) {
                        eprintln!("[pdf] {}", e.message);
                    }
                }
                Err(e) => eprintln!("[pdf] bcmap 리소스 경로 해석 실패: {e}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace::get_workspace,
            commands::workspace::list_spaces,
            commands::workspace::create_space,
            commands::workspace::rename_space,
            commands::workspace::delete_space,
            commands::workspace::list_subjects,
            commands::workspace::list_sources,
            commands::workspace::extract_pdf_text,
            commands::workspace::read_file_bytes,
            commands::workspace::save_source_file,
            commands::workspace::move_source,
            commands::workspace::delete_source,
            commands::notes::list_notes,
            commands::notes::list_source_types,
            commands::notes::read_note,
            commands::notes::create_note,
            commands::notes::save_note,
            commands::notes::move_note,
            commands::notes::delete_note,
            commands::notes::rename_note,
            commands::notes::update_note_subjects,
            commands::wiki::list_wiki,
            commands::wiki::read_wiki,
            commands::wiki::save_wiki,
            commands::wiki::save_wiki_batch,
            commands::wiki::delete_wiki,
            commands::wiki::rename_wiki,
            commands::graph::get_graph,
            commands::graph::append_relations,
            commands::graph::mark_review_needed,
            commands::graph::unmark_review_needed,
            commands::understanding::get_understanding,
            commands::understanding::set_understanding,
            commands::queries::open_query_window,
            commands::queries::list_query_sessions,
            commands::queries::read_query_session,
            commands::queries::save_query_session,
            commands::queries::delete_query_session,
        ])
        // 메인 창이 닫히면 쿼리바도 같이 닫는다 (설계 문서 §1.5). 반대 방향은 서로 독립.
        .on_window_event(commands::queries::close_query_with_main)
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

#[cfg(test)]
mod tests;
