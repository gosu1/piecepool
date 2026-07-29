//! Tauri IPC 표면. 함수는 얇게 유지하고, 비즈니스 로직은 storage/seed 계층에 둔다.
//! 모든 command 는 Result<T, String> 을 반환해 프론트가 실패를 처리한다.

pub mod graph;
pub mod notes;
pub mod understanding;
pub mod wiki;
pub mod workspace;

use std::collections::HashSet;
use std::path::Path;

use crate::models::{KnowledgeSpace, Subject};
use crate::storage::{self, frontmatter};

/// slug → KnowledgeSpace 조회 (spaces.json). command 들이 space_id 를 알아내는 공용 헬퍼.
pub(crate) fn space_by_slug(slug: &str) -> Result<KnowledgeSpace, String> {
    let spaces: Vec<KnowledgeSpace> =
        storage::read_json(&storage::config_dir().join("spaces.json"))?;
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

/// dir 안에서 name 이 이미 있으면 base-2.ext, base-3.ext … 접미사를 붙인 파일명 반환 (create_note 패턴).
pub(crate) fn unique_file_name(dir: &Path, name: &str) -> String {
    if !storage::exists(&dir.join(name)) {
        return name.to_string();
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    let mut n = 2;
    loop {
        let candidate = format!("{stem}-{n}{ext}");
        if !storage::exists(&dir.join(&candidate)) {
            return candidate;
        }
        n += 1;
    }
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
