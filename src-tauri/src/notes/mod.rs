//! 노트 도메인 — 공간 간 이동 트랜잭션(검증 → 원본 복사 → 대상 기록 → 소스 삭제).
//! commands/notes.rs 는 이 모듈의 얇은 IPC 위임이다.

use std::path::PathBuf;

use crate::error::AppError;
use crate::models::{ArchiveNote, KnowledgeSpace, SourceType};
use crate::storage::{self, frontmatter};

/// 노트를 다른 지식 영역으로 이동. pdf/image 원본 파일도 함께 옮긴다.
/// 순서: 검증 전부 통과 → 원본 복사 → 대상에 기록 → 성공 후에만 원래 파일 삭제.
pub fn move_note(
    space: &str,
    target: &KnowledgeSpace,
    file: &str,
) -> Result<ArchiveNote, AppError> {
    let src_path = storage::safe_join(&storage::space_subdir(space, "archive"), file)?;
    let existing = storage::read_text(&src_path)?;
    // created_at/id/source_id 는 frontmatter 에서 그대로 보존, space_id 만 대상 공간으로.
    let mut note = frontmatter::md_to_archive(&target.id, file, &existing)?;
    note.updated_at = storage::now_iso();

    // Subject 는 공간별 — 대상 공간에 실재하는 것만 남긴다.
    let target_subjects = storage::subject_ids(&target.slug);
    note.subject_ids.retain(|s| target_subjects.contains(s));

    let st = frontmatter::archive_source_type(&existing);
    let mut original = frontmatter::archive_original_file_path(&existing);

    storage::ensure_space_tree(&target.slug)?;

    // pdf/image 원본 이동 계획 (실제 이동은 검증 뒤). 디스크에 없으면 이동 없이 계속한다.
    let mut original_move: Option<(PathBuf, PathBuf)> = None;
    if matches!(st, SourceType::Pdf | SourceType::Image) {
        if let Some(orig) = original.clone() {
            let from = storage::safe_join(
                &storage::space_subdir(space, "sources/original-files"),
                &orig,
            )?;
            if storage::exists(&from) {
                let to_dir = storage::space_subdir(&target.slug, "sources/original-files");
                let final_name = storage::unique_file_name(&to_dir, &orig);
                let to = storage::safe_join(&to_dir, &final_name)?;
                original_move = Some((from, to));
                original = Some(final_name);
            }
        }
    }

    // 대상 archive/ 파일명: 동일 유지, 충돌 시 접미사.
    let to_dir = storage::space_subdir(&target.slug, "archive");
    note.path = storage::unique_file_name(&to_dir, file);
    let to_path = storage::safe_join(&to_dir, &note.path)?;

    frontmatter::validate_archive(&note, st, original.as_deref(), &target_subjects)?;

    // 부분 실패 안전 순서: 복사 → 대상 노트 기록 → 원본 삭제.
    // 대상 기록이 실패해도 소스 쪽은 온전하다(대상에 복사본만 남음 — 무해).
    let mut copied_original_from: Option<PathBuf> = None;
    if let Some((from, to)) = original_move {
        storage::copy_file(&from, &to)?;
        copied_original_from = Some(from);
    }
    let md = frontmatter::archive_to_md(&note, st, original.as_deref());
    storage::write_text(&to_path, &md)?;
    storage::remove_file(&src_path)?;
    // 이동은 이미 성공 — 소스 원본 정리 실패(잠금 등)는 무해한 복사본만 남기므로 오류로 만들지 않는다.
    if let Some(from) = copied_original_from {
        let _ = storage::remove_file(&from);
    }
    Ok(note)
}
