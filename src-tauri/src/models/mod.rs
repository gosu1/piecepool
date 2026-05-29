//! 엔티티 Rust 구조체. SSOT: docs/10-contracts/entities.md.
//! 드리프트 방지: 향후 ts-rs로 src/lib/types.ts 자동 생성 권장.

use serde::{Deserialize, Serialize};

/// docs/10-contracts/entities.md#workspace
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: String,
    pub updated_at: String,
}
// TODO: KnowledgeSpace, Subject, Source, ArchiveNote, Concept, WikiPage,
//       SourceRef, Evidence, Question, ImportJob — entities.md 참조.
