//! 중앙 오류 타입. SSOT: docs/20-backend/error-handling.md (작성 예정).
//! 사용자 메시지 분류(auth/network/rate_limit/schema/empty/partial): docs/30-llm/output-validation.md §7.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub kind: String,
    pub message: String,
}

impl AppError {
    pub fn new(kind: impl Into<String>, message: impl Into<String>) -> Self {
        Self { kind: kind.into(), message: message.into() }
    }

    /// 위험 컴포넌트(절대경로·null byte)를 포함한 입력.
    pub fn path_invalid(input: &str) -> Self {
        Self::new("path_invalid", format!("잘못되거나 위험한 경로: {input}"))
    }

    /// 루트를 벗어나는 `..` 탈출 시도.
    pub fn path_traversal(input: &str) -> Self {
        Self::new("path_traversal", format!("워크스페이스 루트를 벗어나는 경로: {input}"))
    }

    pub fn io_read(e: std::io::Error) -> Self {
        Self::from_io("io_read", e)
    }

    pub fn io_write(e: std::io::Error) -> Self {
        Self::from_io("io_write", e)
    }

    /// NotFound·PermissionDenied는 프론트가 적합한 UI를 띄우도록 세분한다 (storage-io.md §4).
    fn from_io(default_kind: &str, e: std::io::Error) -> Self {
        use std::io::ErrorKind;
        let kind = match e.kind() {
            ErrorKind::NotFound => "not_found",
            ErrorKind::PermissionDenied => "permission_denied",
            _ => default_kind,
        };
        Self::new(kind, e.to_string())
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.kind, self.message)
    }
}

impl std::error::Error for AppError {}
