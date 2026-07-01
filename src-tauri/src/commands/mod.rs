//! Tauri IPC 표면. 함수는 얇게 유지하고, 비즈니스 로직은 storage/seed 계층에 둔다.
//! 모든 command 는 Result<T, String> 을 반환해 프론트가 실패를 처리한다.

pub mod graph;
pub mod notes;
pub mod wiki;
pub mod workspace;

use std::collections::HashSet;

use crate::models::{KnowledgeSpace, Subject};
use crate::storage::{self, frontmatter};

/// slug → KnowledgeSpace 조회 (spaces.json). command 들이 space_id 를 알아내는 공용 헬퍼.
pub(crate) fn space_by_slug(slug: &str) -> Result<KnowledgeSpace, String> {
    let spaces: Vec<KnowledgeSpace> =
        storage::read_json(&storage::config_dir().join("spaces.json")).map_err(|e| e.to_string())?;
    spaces
        .into_iter()
        .find(|s| s.slug == slug)
        .ok_or_else(|| format!("unknown space: {slug}"))
}

/// 참조 무결성 레지스트리: 해당 공간의 실제 Subject id 집합 (config/subjects.json).
pub(crate) fn subject_ids(space: &str) -> HashSet<String> {
    let path = storage::space_subdir(space, "config").join("subjects.json");
    let subjects: Vec<Subject> = storage::read_json(&path).unwrap_or_default();
    subjects.into_iter().map(|s| s.id).collect()
}

/// 참조 무결성 레지스트리: 실제 Source id 집합 (workspace-layout 에 sources.json 없음 → archive/*.md 의 sourceId 재구성).
pub(crate) fn source_ids(space: &str) -> HashSet<String> {
    let dir = storage::space_subdir(space, "archive");
    let files = storage::list_files(&dir, ".md").unwrap_or_default();
    let mut out = HashSet::new();
    for f in files {
        if let Ok(md) = storage::read_text(&dir.join(&f)) {
            if let Ok(note) = frontmatter::md_to_archive("", &f, &md) {
                out.insert(note.source_id);
            }
        }
    }
    out
}
