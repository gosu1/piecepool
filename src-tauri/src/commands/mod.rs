//! Tauri IPC 표면. 함수는 얇게 유지하고, 비즈니스 로직은 도메인(graph/notes)·storage 계층에 둔다.
//! 모든 command 는 Result<T, String> 을 반환해 프론트가 실패를 처리한다.

pub mod graph;
pub mod notes;
pub mod understanding;
pub mod wiki;
pub mod workspace;

use crate::models::KnowledgeSpace;
use crate::storage;

/// slug → KnowledgeSpace 조회 (spaces.json). command 들이 space_id 를 알아내는 공용 헬퍼.
pub(crate) fn space_by_slug(slug: &str) -> Result<KnowledgeSpace, String> {
    let spaces: Vec<KnowledgeSpace> =
        storage::read_json(&storage::config_dir().join("spaces.json"))?;
    spaces
        .into_iter()
        .find(|s| s.slug == slug)
        .ok_or_else(|| format!("unknown space: {slug}"))
}
