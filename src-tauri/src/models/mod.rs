//! 엔티티 Rust 구조체 = 타입 SSOT 미러.
//! SSOT: docs/10-contracts/entities.md, relation-types.md.
//! TS 타입(../../src/lib/generated/*.ts)은 ts-rs로 본 파일에서 자동 생성 — 수동 편집 금지.
//! 생성: `npm run gen:types` (cargo test export_bindings).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ── Workspace ───────────────────────────────────────────────
/// entities.md#workspace
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: String,
    pub updated_at: String,
}

// ── KnowledgeSpace ──────────────────────────────────────────
/// entities.md#knowledgespace
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSpace {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub root_path: String,
    pub created_at: String,
    pub updated_at: String,
}

// ── Subject ─────────────────────────────────────────────────
/// entities.md#subject
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Subject {
    pub id: String,
    pub space_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub semester: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Source ──────────────────────────────────────────────────
/// entities.md#source
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    Text,
    Pdf,
    SummaryText,
    Image,
}

/// entities.md#source
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub space_id: String,
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub kind: SourceType,
    pub title: String,
    pub subject_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub inbox_path: Option<String>,
    pub archive_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub original_file_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── ArchiveNote ─────────────────────────────────────────────
/// entities.md#archivenote
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ArchiveNote {
    pub id: String,
    pub space_id: String,
    pub source_id: String,
    pub path: String,
    pub title: String,
    pub markdown: String,
    pub subject_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Concept ─────────────────────────────────────────────────
/// entities.md#concept
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Concept {
    pub id: String,
    pub space_id: String,
    pub title: String,
    pub normalized_title: String,
    pub subject_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub wiki_page_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub aliases: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}

// ── SourceRef ───────────────────────────────────────────────
/// entities.md#sourceref
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct SourceRef {
    pub id: String,
    pub source_id: String,
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub page: Option<u32>,
    pub embed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reason: Option<String>,
}

// ── WikiPage ────────────────────────────────────────────────
/// entities.md#wikipage
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct WikiPage {
    pub id: String,
    pub space_id: String,
    pub concept_id: String,
    pub title: String,
    pub path: String,
    pub subject_ids: Vec<String>,
    pub source_ids: Vec<String>,
    pub source_refs: Vec<SourceRef>,
    pub markdown: String,
    pub created_at: String,
    pub updated_at: String,
}

// ── Evidence ────────────────────────────────────────────────
/// entities.md#evidence
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub source_ref_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub archive_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub original_file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub quote: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub location: Option<String>,
    pub reason: String,
}

// ── Relation ────────────────────────────────────────────────
/// relation-types.md#1-relationtype-enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "snake_case")]
pub enum RelationType {
    ExtractedFrom,
    ExplainedBy,
    Prerequisite,
    PartOf,
    UsedIn,
    Causes,
    Solves,
    Contrasts,
    ConfusedWith,
    RelatedTo,
    TestedIn,
    ReviewNeeded,
}

/// relation-types.md#3-relation-엔티티
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Relation {
    pub id: String,
    pub space_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relation_type: RelationType,
    pub strength: f32,
    pub confidence: f32,
    pub explanation: String,
    pub evidence: Vec<Evidence>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Question ────────────────────────────────────────────────
/// entities.md#question
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub space_id: String,
    pub text: String,
    pub concept_ids: Vec<String>,
    pub source_ids: Vec<String>,
    pub created_at: String,
}

// ── PdfExtractResult (커맨드 DTO) ────────────────────────────
/// pdf/ 추출 결과. page_count 는 #page=N 범위 검사의 SSOT. 빈 페이지는 "" 로 보존(인덱스 유지).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PageText {
    pub page: u32, // 1-indexed
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PdfExtractResult {
    pub page_count: u32,
    pub pages: Vec<PageText>,
}

// ── ImportJob ───────────────────────────────────────────────
/// entities.md#importjob — 상태 전이는 entities.md ImportJobStatus (SSOT) 를 미러한다.
/// clarify 전이: llm_processing(1차) → clarify_pending(응답 대기) → llm_processing(2차) → writing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "snake_case")]
pub enum ImportJobStatus {
    Idle,
    Parsing,
    Archiving,
    LlmProcessing,
    ClarifyPending,
    Writing,
    Completed,
    Failed,
}

/// entities.md#importjob
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ImportJob {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub space_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub source_id: Option<String>,
    pub status: ImportJobStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
