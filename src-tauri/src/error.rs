//! 중앙 오류 타입. SSOT: docs/20-backend/error-handling.md (작성 예정).
//! 사용자 메시지 분류(auth/network/rate_limit/schema/empty/partial): docs/30-llm/output-validation.md §7.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub kind: String,
    pub message: String,
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.kind, self.message)
    }
}

impl std::error::Error for AppError {}
