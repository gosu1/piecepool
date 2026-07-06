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
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)
        .map_err(|e| e.to_string())?;
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
    frontmatter::validate_archive(
        &note,
        SourceType::Text,
        None,
        &crate::commands::subject_ids(&space),
    )
    .map_err(|e| e.to_string())?;
    let md = frontmatter::archive_to_md(&note, SourceType::Text, None);
    storage::write_text(&dir.join(&file), &md).map_err(|e| e.to_string())?;
    Ok(note)
}

/// 기존 노트 본문 수정·저장(파일명 유지). archive 는 LLM이 아닌 사용자 원문 보존소.
#[tauri::command]
pub fn save_note(space: String, file: String, markdown: String) -> Result<ArchiveNote, String> {
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)
        .map_err(|e| e.to_string())?;
    let existing = storage::read_text(&path).map_err(|e| e.to_string())?;
    let mut note =
        frontmatter::md_to_archive(&sp.id, &file, &existing).map_err(|e| e.to_string())?;
    note.markdown = markdown;
    note.updated_at = storage::now_iso();
    let st = frontmatter::archive_source_type(&existing);
    // originalFilePath 는 기존 frontmatter 값을 보존 — 누락 시 pdf/image 노트는 저장 자체가 불가능해진다.
    let original = frontmatter::archive_original_file_path(&existing);
    frontmatter::validate_archive(
        &note,
        st,
        original.as_deref(),
        &crate::commands::subject_ids(&space),
    )
    .map_err(|e| e.to_string())?;
    let md = frontmatter::archive_to_md(&note, st, original.as_deref());
    storage::write_text(&path, &md).map_err(|e| e.to_string())?;
    Ok(note)
}

/// 노트를 다른 지식 영역으로 이동. pdf/image 원본 파일도 함께 옮긴다.
/// 순서: 검증 전부 통과 → 원본 이동 → 대상에 기록 → 성공 후에만 원래 파일 삭제.
#[tauri::command]
pub fn move_note(space: String, file: String, to_space: String) -> Result<ArchiveNote, String> {
    if space == to_space {
        return Err("같은 공간으로는 이동할 수 없습니다".into());
    }
    space_by_slug(&space)?;
    let target = space_by_slug(&to_space)?;

    let src_path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)
        .map_err(|e| e.to_string())?;
    let existing = storage::read_text(&src_path).map_err(|e| e.to_string())?;
    // created_at/id/source_id 는 frontmatter 에서 그대로 보존, space_id 만 대상 공간으로.
    let mut note =
        frontmatter::md_to_archive(&target.id, &file, &existing).map_err(|e| e.to_string())?;
    note.updated_at = storage::now_iso();

    // Subject 는 공간별 — 대상 공간에 실재하는 것만 남긴다.
    let target_subjects = crate::commands::subject_ids(&to_space);
    note.subject_ids.retain(|s| target_subjects.contains(s));

    let st = frontmatter::archive_source_type(&existing);
    let mut original = frontmatter::archive_original_file_path(&existing);

    storage::ensure_space_tree(&to_space).map_err(|e| e.to_string())?;

    // pdf/image 원본 이동 계획 (실제 이동은 검증 뒤). 디스크에 없으면 이동 없이 계속한다.
    let mut original_move: Option<(std::path::PathBuf, std::path::PathBuf)> = None;
    if matches!(st, SourceType::Pdf | SourceType::Image) {
        if let Some(orig) = original.clone() {
            let from = storage::safe_join(
                &storage::space_subdir(&space, "sources/original-files"),
                &orig,
            )
            .map_err(|e| e.to_string())?;
            if storage::exists(&from) {
                let to_dir = storage::space_subdir(&to_space, "sources/original-files");
                let final_name = crate::commands::unique_file_name(&to_dir, &orig);
                let to = storage::safe_join(&to_dir, &final_name).map_err(|e| e.to_string())?;
                original_move = Some((from, to));
                original = Some(final_name);
            }
        }
    }

    // 대상 archive/ 파일명: 동일 유지, 충돌 시 접미사.
    let to_dir = storage::space_subdir(&to_space, "archive");
    note.path = crate::commands::unique_file_name(&to_dir, &file);
    let to_path = storage::safe_join(&to_dir, &note.path).map_err(|e| e.to_string())?;

    frontmatter::validate_archive(&note, st, original.as_deref(), &target_subjects)
        .map_err(|e| e.to_string())?;

    // 부분 실패 안전 순서: 복사 → 대상 노트 기록 → 원본 삭제.
    // 대상 기록이 실패해도 소스 쪽은 온전하다(대상에 복사본만 남음 — 무해).
    let mut copied_original_from: Option<std::path::PathBuf> = None;
    if let Some((from, to)) = original_move {
        let bytes = storage::read_bytes(&from).map_err(|e| e.to_string())?;
        storage::write_bytes(&to, &bytes).map_err(|e| e.to_string())?;
        copied_original_from = Some(from);
    }
    let md = frontmatter::archive_to_md(&note, st, original.as_deref());
    storage::write_text(&to_path, &md).map_err(|e| e.to_string())?;
    storage::remove_file(&src_path).map_err(|e| e.to_string())?;
    // 이동은 이미 성공 — 소스 원본 정리 실패(잠금 등)는 무해한 복사본만 남기므로 오류로 만들지 않는다.
    if let Some(from) = copied_original_from {
        let _ = storage::remove_file(&from);
    }
    Ok(note)
}

/// 노트 삭제 (archive/ 파일 제거). 없는 파일은 오류.
#[tauri::command]
pub fn delete_note(space: String, file: String) -> Result<(), String> {
    space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)
        .map_err(|e| e.to_string())?;
    storage::remove_file(&path).map_err(|e| e.to_string())
}

/// 노트 제목 변경. 파일명은 다른 곳에서 path 로 참조되므로 유지한다.
#[tauri::command]
pub fn rename_note(space: String, file: String, new_title: String) -> Result<ArchiveNote, String> {
    let title = new_title.trim().to_string();
    if title.is_empty() {
        return Err("제목이 비어 있습니다".into());
    }
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)
        .map_err(|e| e.to_string())?;
    let existing = storage::read_text(&path).map_err(|e| e.to_string())?;
    let mut note =
        frontmatter::md_to_archive(&sp.id, &file, &existing).map_err(|e| e.to_string())?;
    note.title = title;
    note.updated_at = storage::now_iso();
    let st = frontmatter::archive_source_type(&existing);
    let original = frontmatter::archive_original_file_path(&existing);
    frontmatter::validate_archive(
        &note,
        st,
        original.as_deref(),
        &crate::commands::subject_ids(&space),
    )
    .map_err(|e| e.to_string())?;
    let md = frontmatter::archive_to_md(&note, st, original.as_deref());
    storage::write_text(&path, &md).map_err(|e| e.to_string())?;
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
    let path = storage::safe_join(&storage::space_subdir(&space, "archive"), &file)
        .map_err(|e| e.to_string())?;
    let existing = storage::read_text(&path).map_err(|e| e.to_string())?;
    let mut note =
        frontmatter::md_to_archive(&sp.id, &file, &existing).map_err(|e| e.to_string())?;
    note.subject_ids = subject_ids;
    note.updated_at = storage::now_iso();
    let st = frontmatter::archive_source_type(&existing);
    let original = frontmatter::archive_original_file_path(&existing);
    frontmatter::validate_archive(
        &note,
        st,
        original.as_deref(),
        &crate::commands::subject_ids(&space),
    )
    .map_err(|e| e.to_string())?;
    let md = frontmatter::archive_to_md(&note, st, original.as_deref());
    storage::write_text(&path, &md).map_err(|e| e.to_string())?;
    Ok(note)
}
