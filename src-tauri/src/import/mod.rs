//! Import 파이프라인 + ImportJob 상태. SSOT: docs/20-backend/import-pipeline.md,
//! import-job-states.md (작성 예정). 오케스트레이션 흐름은 TS 서비스층(src/llm/)과 조율.
//!
//! ImportJobStatus / ImportJob 타입 = crate::models (entities.md SSOT).
// TODO: 상태 전이 머신, 우선도(prioritization.md), 부분 실패 기록(output-validation.md §5).
