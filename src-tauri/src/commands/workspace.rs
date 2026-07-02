use crate::models::{KnowledgeSpace, Subject, Workspace};
use crate::seed;
use crate::storage;

/// Workspace 를 연다(없으면 시드 생성). config/workspace.json 을 읽어 반환.
#[tauri::command]
pub fn get_workspace() -> Result<Workspace, String> {
    seed::ensure_seed().map_err(|e| e.to_string())?;
    storage::read_json(&storage::config_dir().join("workspace.json")).map_err(|e| e.to_string())
}

/// 지식 영역 목록 (config/spaces.json).
#[tauri::command]
pub fn list_spaces() -> Result<Vec<KnowledgeSpace>, String> {
    seed::ensure_seed().map_err(|e| e.to_string())?;
    storage::read_json(&storage::config_dir().join("spaces.json")).map_err(|e| e.to_string())
}

/// 한 지식 영역의 과목 목록 (<space>/config/subjects.json).
#[tauri::command]
pub fn list_subjects(space: String) -> Result<Vec<Subject>, String> {
    let path = storage::space_subdir(&space, "config").join("subjects.json");
    if !storage::exists(&path) {
        return Ok(vec![]);
    }
    storage::read_json(&path).map_err(|e| e.to_string())
}

/// 원본 파일 목록 (<space>/sources/original-files/). 모든 확장자.
#[tauri::command]
pub fn list_sources(space: String) -> Result<Vec<String>, String> {
    let dir = storage::space_subdir(&space, "sources/original-files");
    storage::list_files(&dir, "").map_err(|e| e.to_string())
}

/// PDF 페이지별 텍스트 추출 (sources/original-files/<file>). page_count 는 #page=N 범위 SSOT.
#[tauri::command]
pub fn extract_pdf_text(
    space: String,
    file: String,
) -> Result<crate::models::PdfExtractResult, String> {
    let path = storage::safe_join(
        &storage::space_subdir(&space, "sources/original-files"),
        &file,
    )
    .map_err(|e| e.to_string())?;
    crate::pdf::extract(&path).map_err(|e| e.to_string())
}

/// 원본 파일 바이트를 base64 로 반환 (FilePreview: 이미지/PDF data URL). sources/original-files/ 하위만.
#[tauri::command]
pub fn read_file_bytes(space: String, file: String) -> Result<String, String> {
    let path = storage::safe_join(
        &storage::space_subdir(&space, "sources/original-files"),
        &file,
    )
    .map_err(|e| e.to_string())?;
    let bytes = storage::read_bytes(&path).map_err(|e| e.to_string())?;
    Ok(storage::to_base64(&bytes))
}

/// base64 원본 파일을 <space>/sources/original-files/ 에 저장하고 최종 파일명을 반환.
/// 파일명 정리: stem·확장자 모두 slugify(소문자 영숫자). 충돌 시 base-2.ext … 접미사.
#[tauri::command]
pub fn save_source_file(
    space: String,
    name: String,
    data_base64: String,
) -> Result<String, String> {
    crate::commands::space_by_slug(&space)?;
    let data = storage::from_base64(&data_base64).map_err(|e| e.to_string())?;
    if data.len() > 50 * 1024 * 1024 {
        return Err("파일이 너무 큽니다 (최대 50MB)".into());
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !e.trim().is_empty() => (s, e),
        _ => return Err("파일 확장자가 필요합니다".into()),
    };
    let safe_name = format!("{}.{}", storage::slugify(stem), storage::slugify(ext));
    let dir = storage::space_subdir(&space, "sources/original-files");
    let final_name = crate::commands::unique_file_name(&dir, &safe_name);
    let path = storage::safe_join(&dir, &final_name).map_err(|e| e.to_string())?;
    storage::write_bytes(&path, &data).map_err(|e| e.to_string())?;
    Ok(final_name)
}
