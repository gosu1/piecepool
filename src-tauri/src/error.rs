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

/// commands 레이어 경계(Result<T, String>)로 나갈 때 `?` 한 번으로 변환한다.
/// 문자열 형태는 Display("[kind] message")와 동일 — 기존 map_err(|e| e.to_string()) 와 같은 출력.
impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}
