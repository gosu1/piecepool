use crate::commands::space_by_slug;
use crate::models::{ArchiveNote, SourceType};
use crate::storage::{self, frontmatter};

/// archive/*.md 전체를 ArchiveNote 로 파싱해 반환(최신순).
#[tauri::command]
pub fn list_notes(space: String) -> Result<Vec<ArchiveNote>, String> {
    let sp = space_by_slug(&space)?;
    let dir = storage::space_subdir(&space, "archive");
    let files = storage::list_files(&dir, ".md").map_err(|e| e.to_string())?;
    let mut out = vec![];
    for f in files {
        let md = storage::read_text(&dir.join(&f)).map_err(|e| e.to_string())?;
        match frontmatter::md_to_archive(&sp.id, &f, &md) {
            Ok(n) => out.push(n),
            Err(_) => continue, // 깨진 파일은 건너뛴다
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

/// archive/*.md 의 (sourceId, sourceType) 목록 — provenance tier 추론용([D]).
/// ArchiveNote 계약은 sourceType을 갖지 않으므로 frontmatter에서 직접 뽑아 별도로 노출한다.
#[tauri::command]
pub fn list_source_types(space: String) -> Result<Vec<(String, SourceType)>, String> {
    let sp = space_by_slug(&space)?;
    let dir = storage::space_subdir(&space, "archive");
    let files = storage::list_files(&dir, ".md").map_err(|e| e.to_string())?;
    let mut out = vec![];
    for f in files {
        let md = storage::read_text(&dir.join(&f)).map_err(|e| e.to_string())?;
        if let Ok(n) = frontmatter::md_to_archive(&sp.id, &f, &md) {
            out.push((n.source_id, frontmatter::archive_source_type(&md)));
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn read_note(space: String, file: String) -> Result<ArchiveNote, String> {
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file).map_err(|e| e.to_string())?;
    let md = storage::read_text(&path).map_err(|e| e.to_string())?;
    frontmatter::md_to_archive(&sp.id, &file, &md).map_err(|e| e.to_string())
}

/// 새 노트 생성: inbox 입력 → archive/<today>-<slug>.md.
#[tauri::command]
pub fn create_note(
    space: String,
    title: String,
    markdown: String,
    subject_ids: Vec<String>,
) -> Result<ArchiveNote, String> {
    let sp = space_by_slug(&space)?;
    let now = storage::now_iso();
    // 파일명 충돌 시 -2, -3 … 접미사 (같은 날 같은 제목의 silent overwrite 방지).
    let dir = storage::space_subdir(&space, "archive");
    let base = format!("{}-{}", storage::today(), storage::slugify(&title));
    let mut file = format!("{base}.md");
    let mut n = 2;
    while storage::exists(&dir.join(&file)) {
        file = format!("{base}-{n}.md");
        n += 1;
    }
    // ArchiveNote.sourceId 는 대응 Source.id 와 1:1 — id 와 동일한 source 식별자를 쓴다.
    let source_id = storage::gen_id("source");
    let note = ArchiveNote {
        id: source_id.clone(),
        space_id: sp.id,
        source_id,
        path: file.clone(),
        title,
        markdown,
        subject_ids,
        created_at: now.clone(),
        updated_at: now,
    };
    // 저장 전 frontmatter 검증 (hard-fail, 부분 파일 없음)
    frontmatter::validate_archive(&note, SourceType::Text, None, &crate::commands::subject_ids(&space))
        .map_err(|e| e.to_string())?;
    let md = frontmatter::archive_to_md(&note, SourceType::Text, None);
    storage::write_text(&dir.join(&file), &md).map_err(|e| e.to_string())?;
    Ok(note)
}

/// 기존 노트 본문 수정·저장(파일명 유지). archive 는 LLM이 아닌 사용자 원문 보존소.
#[tauri::command]
pub fn save_note(space: String, file: String, markdown: String) -> Result<ArchiveNote, String> {
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file).map_err(|e| e.to_string())?;
    let existing = storage::read_text(&path).map_err(|e| e.to_string())?;
    let mut note = frontmatter::md_to_archive(&sp.id, &file, &existing).map_err(|e| e.to_string())?;
    note.markdown = markdown;
    note.updated_at = storage::now_iso();
    let st = frontmatter::archive_source_type(&existing);
    frontmatter::validate_archive(&note, st, None, &crate::commands::subject_ids(&space))
        .map_err(|e| e.to_string())?;
    let md = frontmatter::archive_to_md(&note, st, None);
    storage::write_text(&path, &md).map_err(|e| e.to_string())?;
    Ok(note)
}
