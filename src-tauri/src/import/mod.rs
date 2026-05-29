//! Import 파이프라인 + ImportJob 상태. SSOT: docs/20-backend/import-pipeline.md,
//! import-job-states.md (작성 예정). 오케스트레이션 흐름은 TS 서비스층(src/llm/)과 조율.

use serde::{Deserialize, Serialize};

/// docs/10-contracts/entities.md#importjob
/// 주의: Premium 되묻기용 `clarify_pending`은 SSOT 변경(contracts-change) 후 추가 — output-validation.md §6.4.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportJobStatus {
    Idle,
    Parsing,
    Archiving,
    LlmProcessing,
    Writing,
    Completed,
    Failed,
}
// TODO: 상태 전이 머신, 우선도(prioritization.md), 부분 실패 기록(output-validation.md §5).
