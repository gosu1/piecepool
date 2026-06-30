//! 파일 I/O, 경로 해석. SSOT: docs/20-backend/storage-io.md.
//! 폴더 트리: docs/10-contracts/workspace-layout.md.
//!
//! 계층 경계: 이 모듈은 오직 파일 I/O만 다룬다. 엔티티 직렬화·LLM·Import 상태전이는
//! 상위 계층(import/)이 소유한다. 따라서 byte/string·경로만 주고받는다.

use std::path::{Component, Path, PathBuf};

use tokio::fs;
use tokio::io::AsyncWriteExt;

use crate::error::AppError;

/// `<space>/` 하위 표준 디렉토리. 이름이 코드 상수라 traversal 위험이 없다.
/// 폴더 트리 SSOT: docs/10-contracts/workspace-layout.md §2.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpaceDir {
    Inbox,
    Archive,
    Wiki,
    Relations,
    Sources,
    Config,
}

impl SpaceDir {
    pub fn as_str(self) -> &'static str {
        match self {
            SpaceDir::Inbox => "inbox",
            SpaceDir::Archive => "archive",
            SpaceDir::Wiki => "wiki",
            SpaceDir::Relations => "relations",
            SpaceDir::Sources => "sources",
            SpaceDir::Config => "config",
        }
    }
}

/// 외부 주입 컴포넌트(slug·파일명)를 루트 하위 경로로 안전하게 결합한다.
/// 위험 컴포넌트(절대경로·null byte·`..` 탈출)는 거부한다 (storage-io.md §1.2).
pub fn safe_join(base: &Path, untrusted: &str) -> Result<PathBuf, AppError> {
    if untrusted.contains('\0') || Path::new(untrusted).is_absolute() {
        return Err(AppError::path_invalid(untrusted));
    }
    let joined = base.join(untrusted);
    // Path::components()는 `.`·중복 구분자만 흡수하고 `..`는 보존하므로 명시적으로 거부한다.
    if joined.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(AppError::path_traversal(untrusted));
    }
    if !joined.starts_with(base) {
        return Err(AppError::path_traversal(untrusted));
    }
    Ok(joined)
}

/// `workspace_root/<space-slug>/` 절대경로. slug는 외부 입력이므로 safe_join 경유.
pub fn space_root(workspace_root: &Path, space_slug: &str) -> Result<PathBuf, AppError> {
    safe_join(workspace_root, space_slug)
}

/// `<space>/<dir>/` 경로. dir는 코드 상수라 안전하게 join만 한다.
pub fn space_dir(space_root: &Path, dir: SpaceDir) -> PathBuf {
    space_root.join(dir.as_str())
}

/// 디렉토리(중간 경로 포함)를 보장한다. 이미 있으면 no-op.
pub async fn ensure_dir(dir: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dir).await.map_err(AppError::io_write)
}

/// 원자적 쓰기: tmp 파일 기록 → fsync → rename. 같은 디렉토리 내 rename은 원자적이다
/// (storage-io.md §2.2). 호출자는 `target`의 부모 디렉토리가 존재함을 보장해야 한다.
pub async fn write_atomic(target: &Path, content: &[u8]) -> Result<(), AppError> {
    // with_extension은 마지막 확장자를 교체하므로(relations.json → relations.tmp) 금지.
    // 파일명 뒤에 ".tmp"를 그대로 덧붙인다.
    let mut tmp = target.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp_path = PathBuf::from(tmp);

    let mut file = fs::File::create(&tmp_path).await.map_err(AppError::io_write)?;
    file.write_all(content).await.map_err(AppError::io_write)?;
    file.flush().await.map_err(AppError::io_write)?;
    file.sync_all().await.map_err(AppError::io_write)?;
    drop(file);

    fs::rename(&tmp_path, target).await.map_err(AppError::io_write)?;
    Ok(())
}

/// 파일 전체를 UTF-8 문자열로 읽는다.
pub async fn read_to_string(path: &Path) -> Result<String, AppError> {
    fs::read_to_string(path).await.map_err(AppError::io_read)
}

/// 디렉토리 내 파일명을 정렬해 반환한다. 하위 디렉토리는 제외한다.
/// 디렉토리가 없으면 빈 목록(빈 space의 wiki/relations 나열 케이스).
pub async fn list_files(dir: &Path) -> Result<Vec<String>, AppError> {
    let mut entries = match fs::read_dir(dir).await {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(AppError::io_read(e)),
    };

    let mut names = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(AppError::io_read)? {
        let file_type = entry.file_type().await.map_err(AppError::io_read)?;
        if file_type.is_file() {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    names.sort();
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepts_plain_filename() {
        let base = Path::new("/ws/deeplearning/wiki");
        let p = safe_join(base, "self-attention.md").unwrap();
        assert_eq!(p, Path::new("/ws/deeplearning/wiki/self-attention.md"));
    }

    #[test]
    fn safe_join_rejects_parent_traversal() {
        let base = Path::new("/ws/deeplearning");
        let err = safe_join(base, "../config/workspace.json").unwrap_err();
        assert_eq!(err.kind, "path_traversal");
    }

    #[test]
    fn safe_join_rejects_absolute() {
        let base = Path::new("/ws/deeplearning");
        let err = safe_join(base, "/etc/passwd").unwrap_err();
        assert_eq!(err.kind, "path_invalid");
    }

    #[test]
    fn safe_join_rejects_null_byte() {
        let base = Path::new("/ws");
        let err = safe_join(base, "evil\0.md").unwrap_err();
        assert_eq!(err.kind, "path_invalid");
    }

    #[test]
    fn space_dir_resolves_known_subdirs() {
        let root = Path::new("/ws/deeplearning");
        assert_eq!(space_dir(root, SpaceDir::Wiki), Path::new("/ws/deeplearning/wiki"));
        assert_eq!(space_dir(root, SpaceDir::Relations), Path::new("/ws/deeplearning/relations"));
    }

    #[tokio::test]
    async fn write_atomic_then_read_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("transformer.md");
        write_atomic(&target, b"# Transformer\ncontent").await.unwrap();

        let got = read_to_string(&target).await.unwrap();
        assert_eq!(got, "# Transformer\ncontent");
        // 성공 후 .tmp 잔여물이 없어야 한다.
        let mut tmp = target.as_os_str().to_owned();
        tmp.push(".tmp");
        assert!(!Path::new(&tmp).exists());
    }

    #[tokio::test]
    async fn write_atomic_overwrites_existing() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("relations.json");
        write_atomic(&target, b"[1]").await.unwrap();
        write_atomic(&target, b"[1,2]").await.unwrap();
        assert_eq!(read_to_string(&target).await.unwrap(), "[1,2]");
    }

    #[tokio::test]
    async fn list_files_sorted_files_only() {
        let dir = tempfile::tempdir().unwrap();
        write_atomic(&dir.path().join("b.md"), b"b").await.unwrap();
        write_atomic(&dir.path().join("a.md"), b"a").await.unwrap();
        ensure_dir(&dir.path().join("nested")).await.unwrap();

        let names = list_files(dir.path()).await.unwrap();
        assert_eq!(names, vec!["a.md".to_string(), "b.md".to_string()]);
    }

    #[tokio::test]
    async fn list_files_missing_dir_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("wiki");
        assert!(list_files(&missing).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn ensure_dir_creates_nested() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("sources").join("original-files");
        ensure_dir(&nested).await.unwrap();
        assert!(nested.is_dir());
    }
}
