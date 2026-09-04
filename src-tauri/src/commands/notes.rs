use crate::commands::space_by_slug;
use crate::models::{ArchiveNote, SourceType};
use crate::storage::{self, frontmatter};

/// archive/*.md 전체를 ArchiveNote 로 파싱해 반환(최신순).
#[tauri::command]
pub fn list_notes(space: String) -> Result<Vec<ArchiveNote>, String> {
    let sp = space_by_slug(&space)?;
    let mut out = storage::list_parsed(&space, "archive", |f, md| {
        frontmatter::md_to_archive(&sp.id, f, md).ok()
    })?;
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

/// archive/*.md 의 (sourceId, sourceType) 목록 — provenance tier 추론용([D]).
/// ArchiveNote 계약은 sourceType을 갖지 않으므로 frontmatter에서 직접 뽑아 별도로 노출한다.
#[tauri::command]
pub fn list_source_types(space: String) -> Result<Vec<(String, SourceType)>, String> {
    let sp = space_by_slug(&space)?;
    Ok(storage::list_parsed(&space, "archive", |f, md| {
        frontmatter::md_to_archive(&sp.id, f, md)
            .ok()
            .map(|n| (n.source_id, frontmatter::archive_source_type(md)))
    })?)
}

#[tauri::command]
pub fn read_note(space: String, file: String) -> Result<ArchiveNote, String> {
    let sp = space_by_slug(&space)?;
    Ok(storage::read_parsed(&space, "archive", &file, |f, md| {
        frontmatter::md_to_archive(&sp.id, f, md)
    })?)
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
        tags: None,
        created_at: now.clone(),
        updated_at: now,
    };
    // 저장 전 frontmatter 검증 (hard-fail, 부분 파일 없음)
    frontmatter::validate_archive(&note, SourceType::Text, None, &storage::subject_ids(&space))?;
    let md = frontmatter::archive_to_md(&note, SourceType::Text, None);
    storage::write_text(&dir.join(&file), &md)?;
    Ok(note)
}

/// 기존 노트 본문 수정·저장(파일명 유지). archive 는 LLM이 아닌 사용자 원문 보존소.
/// title 이 주어지면 frontmatter 제목도 갱신한다(살아있는 노트에서 제목을 이어 편집할 때). 파일명은 그대로 둔다.
#[tauri::command]
pub fn save_note(
    space: String,
    file: String,
    markdown: String,
    title: Option<String>,
) -> Result<ArchiveNote, String> {
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)?;
    let existing = storage::read_text(&path)?;
    let mut note = frontmatter::md_to_archive(&sp.id, &file, &existing)?;
    note.markdown = markdown;
    if let Some(t) = title {
        let t = t.trim();
        if !t.is_empty() {
            note.title = t.to_string();
        }
    }
    note.updated_at = storage::now_iso();
    let st = frontmatter::archive_source_type(&existing);
    // originalFilePath 는 기존 frontmatter 값을 보존 — 누락 시 pdf/image 노트는 저장 자체가 불가능해진다.
    let original = frontmatter::archive_original_file_path(&existing);
    frontmatter::validate_archive(
        &note,
        st,
        original.as_deref(),
        &storage::subject_ids(&space),
    )?;
    let md = frontmatter::archive_to_md(&note, st, original.as_deref());
    storage::write_text(&path, &md)?;
    Ok(note)
}

/// 노트를 다른 지식 영역으로 이동. pdf/image 원본 파일도 함께 옮긴다.
/// 트랜잭션 순서는 crate::notes::move_note 참조.
#[tauri::command]
pub fn move_note(space: String, file: String, to_space: String) -> Result<ArchiveNote, String> {
    if space == to_space {
        return Err("같은 공간으로는 이동할 수 없습니다".into());
    }
    space_by_slug(&space)?;
    let target = space_by_slug(&to_space)?;
    Ok(crate::notes::move_note(&space, &target, &file)?)
}

/// 노트 삭제 (archive/ 파일 제거). 없는 파일은 오류.
#[tauri::command]
pub fn delete_note(space: String, file: String) -> Result<(), String> {
    space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)?;
    Ok(storage::remove_file(&path)?)
}

/// 노트 제목 변경. 파일명은 다른 곳에서 path 로 참조되므로 유지한다.
#[tauri::command]
pub fn rename_note(space: String, file: String, new_title: String) -> Result<ArchiveNote, String> {
    let title = new_title.trim().to_string();
    if title.is_empty() {
        return Err("제목이 비어 있습니다".into());
    }
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)?;
    let existing = storage::read_text(&path)?;
    let mut note = frontmatter::md_to_archive(&sp.id, &file, &existing)?;
    note.title = title;
    note.updated_at = storage::now_iso();
    let st = frontmatter::archive_source_type(&existing);
    let original = frontmatter::archive_original_file_path(&existing);
    frontmatter::validate_archive(
        &note,
        st,
        original.as_deref(),
        &storage::subject_ids(&space),
    )?;
    let md = frontmatter::archive_to_md(&note, st, original.as_deref());
    storage::write_text(&path, &md)?;
    Ok(note)
}

/// 노트 과목(subjectIds) 갱신. 파일명·본문 유지 — 페이지 헤더의 "영역 · 과목" 속성에서 호출.
#[tauri::command]
pub fn update_note_subjects(
    space: String,
    file: String,
    subject_ids: Vec<String>,
) -> Result<ArchiveNote, String> {
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)?;
    let existing = storage::read_text(&path)?;
    let mut note = frontmatter::md_to_archive(&sp.id, &file, &existing)?;
    note.subject_ids = subject_ids;
    note.updated_at = storage::now_iso();
    let st = frontmatter::archive_source_type(&existing);
    let original = frontmatter::archive_original_file_path(&existing);
    frontmatter::validate_archive(
        &note,
        st,
        original.as_deref(),
        &storage::subject_ids(&space),
    )?;
    let md = frontmatter::archive_to_md(&note, st, original.as_deref());
    storage::write_text(&path, &md)?;
    Ok(note)
}
