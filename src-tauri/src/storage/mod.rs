//! 파일 I/O · 경로 해석 · frontmatter 코덱. SSOT: docs/10-contracts/workspace-layout.md.
//! 외부 의존성 없이(서드파티 yaml/time/ulid crate 미사용) 최소 구현한다.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;

pub mod frontmatter;

pub type Result<T> = std::result::Result<T, AppError>;

fn io_err(ctx: &str, e: impl std::fmt::Display) -> AppError {
    AppError {
        kind: "io".into(),
        message: format!("{ctx}: {e}"),
    }
}

// ── Workspace 루트 ───────────────────────────────────────────
/// 단일 로컬 Workspace 루트. `~/PiecePool`.
pub fn workspace_root() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    Path::new(&home).join("PiecePool")
}

pub fn config_dir() -> PathBuf {
    workspace_root().join("config")
}

pub fn space_dir(slug: &str) -> PathBuf {
    workspace_root().join(slug)
}

/// 지식 영역 하위 표준 디렉토리.
pub fn space_subdir(slug: &str, sub: &str) -> PathBuf {
    space_dir(slug).join(sub)
}

/// Workspace + 지식 영역 표준 트리를 생성한다(이미 있으면 무시).
pub fn ensure_space_tree(slug: &str) -> Result<()> {
    ensure_dir(&config_dir())?;
    for sub in [
        "inbox",
        "archive",
        "wiki",
        "relations",
        "sources/original-files",
        "config",
    ] {
        ensure_dir(&space_dir(slug).join(sub))?;
    }
    Ok(())
}

// ── 기본 IO ─────────────────────────────────────────────────
pub fn ensure_dir(p: &Path) -> Result<()> {
    fs::create_dir_all(p).map_err(|e| io_err(&format!("create_dir {}", p.display()), e))
}

pub fn read_text(p: &Path) -> Result<String> {
    fs::read_to_string(p).map_err(|e| io_err(&format!("read {}", p.display()), e))
}

pub fn read_bytes(p: &Path) -> Result<Vec<u8>> {
    fs::read(p).map_err(|e| io_err(&format!("read {}", p.display()), e))
}

/// 표준 base64 인코딩 (프론트 data URL 용). 서드파티 crate 없이 구현.
pub fn to_base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        let n = ((b0 as u32) << 16) | ((b1 as u32) << 8) | (b2 as u32);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

/// 표준 base64 디코딩 (to_base64 역함수). 잘못된 문자·길이·패딩은 schema 오류로 거부.
pub fn from_base64(s: &str) -> Result<Vec<u8>> {
    fn sextet(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let bad = |why: &str| AppError {
        kind: "schema".into(),
        message: format!("잘못된 base64: {why}"),
    };
    let b = s.as_bytes();
    if !b.len().is_multiple_of(4) {
        return Err(bad("길이가 4의 배수가 아님"));
    }
    let chunks = b.len() / 4;
    let mut out = Vec::with_capacity(chunks * 3);
    for (i, chunk) in b.chunks(4).enumerate() {
        let pad = chunk.iter().rev().take_while(|&&c| c == b'=').count();
        if pad > 2 || (pad > 0 && i + 1 != chunks) {
            return Err(bad("잘못된 패딩"));
        }
        let mut n: u32 = 0;
        for (j, &c) in chunk.iter().enumerate() {
            let v = if c == b'=' {
                if j < 4 - pad {
                    return Err(bad("패딩 위치가 잘못됨"));
                }
                0
            } else {
                sextet(c).ok_or_else(|| bad("허용되지 않는 문자"))?
            };
            n = (n << 6) | v;
        }
        out.push((n >> 16) as u8);
        if pad < 2 {
            out.push((n >> 8) as u8);
        }
        if pad < 1 {
            out.push(n as u8);
        }
    }
    Ok(out)
}

/// atomic write: 임시 파일에 쓰고 rename. 디렉토리는 보장한다.
pub fn write_text(p: &Path, contents: &str) -> Result<()> {
    if let Some(parent) = p.parent() {
        ensure_dir(parent)?;
    }
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| io_err(&format!("write {}", tmp.display()), e))?;
    fs::rename(&tmp, p).map_err(|e| io_err(&format!("rename {}", p.display()), e))
}

/// atomic write (바이너리): 임시 파일에 쓰고 rename. 디렉토리는 보장한다.
pub fn write_bytes(p: &Path, data: &[u8]) -> Result<()> {
    if let Some(parent) = p.parent() {
        ensure_dir(parent)?;
    }
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, data).map_err(|e| io_err(&format!("write {}", tmp.display()), e))?;
    fs::rename(&tmp, p).map_err(|e| io_err(&format!("rename {}", p.display()), e))
}

/// 파일 삭제. 없는 파일은 io 오류로 반환한다.
pub fn remove_file(p: &Path) -> Result<()> {
    fs::remove_file(p).map_err(|e| io_err(&format!("remove {}", p.display()), e))
}

/// 디렉토리와 그 안의 모든 내용을 재귀 삭제. 없는 경로는 성공 취급(멱등).
pub fn remove_dir_all(p: &Path) -> Result<()> {
    if !p.exists() {
        return Ok(());
    }
    fs::remove_dir_all(p).map_err(|e| io_err(&format!("remove_dir {}", p.display()), e))
}

pub fn exists(p: &Path) -> bool {
    p.exists()
}

/// 안전한 경로 결합: 사용자 입력 파일명을 base 아래로만 결합한다.
/// null-byte / 절대경로 / `..`(ParentDir) 를 거부하고, 결과가 base 아래임을 보장한다.
pub fn safe_join(base: &Path, rel: &str) -> Result<PathBuf> {
    if rel.contains('\0') {
        return Err(AppError {
            kind: "path_invalid".into(),
            message: format!("잘못된 경로: {rel}"),
        });
    }
    let candidate = Path::new(rel);
    for comp in candidate.components() {
        match comp {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError {
                    kind: "path_traversal".into(),
                    message: format!("허용되지 않은 경로 접근: {rel}"),
                });
            }
            _ => {}
        }
    }
    let joined = base.join(candidate);
    if !joined.starts_with(base) {
        return Err(AppError {
            kind: "path_traversal".into(),
            message: format!("허용되지 않은 경로 접근: {rel}"),
        });
    }
    Ok(joined)
}

pub fn read_json<T: serde::de::DeserializeOwned>(p: &Path) -> Result<T> {
    let s = read_text(p)?;
    serde_json::from_str(&s).map_err(|e| AppError {
        kind: "schema".into(),
        message: format!("parse {}: {e}", p.display()),
    })
}

pub fn write_json<T: serde::Serialize>(p: &Path, value: &T) -> Result<()> {
    let s = serde_json::to_string_pretty(value).map_err(|e| AppError {
        kind: "schema".into(),
        message: format!("serialize: {e}"),
    })?;
    write_text(p, &format!("{s}\n"))
}

/// 디렉토리의 확장자 일치 파일명(.md 등) 목록을 정렬해 반환.
pub fn list_files(dir: &Path, ext: &str) -> Result<Vec<String>> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(dir).map_err(|e| io_err(&format!("read_dir {}", dir.display()), e))? {
        let entry = entry.map_err(|e| io_err("dir entry", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(ext) && !name.ends_with(".tmp") {
            out.push(name);
        }
    }
    out.sort();
    Ok(out)
}

// ── 유틸: 시간 / slug ───────────────────────────────────────
/// 현재 UTC 시각을 ISO 8601(`YYYY-MM-DDTHH:MM:SSZ`)로. 외부 crate 없이 계산.
pub fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    epoch_to_iso(secs as i64)
}

/// 현재 날짜 `YYYY-MM-DD`.
pub fn today() -> String {
    now_iso().chars().take(10).collect()
}

fn epoch_to_iso(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

/// ISO 8601 문자열의 날짜부(`YYYY-MM-DD`)를 epoch day(1970-01-01=0) 정수로. 파싱 실패 시 None.
/// 우선도 신선도 팩터(prioritization.md §5.1 factor 4)에서 updatedAt 상대 비교용 — 일 단위 granularity.
pub fn iso_to_epoch_days(iso: &str) -> Option<i64> {
    let y: i64 = iso.get(0..4)?.parse().ok()?;
    let m: u32 = iso.get(5..7)?.parse().ok()?;
    let d: u32 = iso.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some(days_from_civil(y, m, d))
}

/// (year, month, day) → days since 1970-01-01. Howard Hinnant. `civil_from_days` 의 역.
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 } as i64;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// days since 1970-01-01 → (year, month, day). Howard Hinnant's algorithm.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// kebab-case ASCII slug. 비ASCII는 하이픈으로, 연속 하이픈은 축약.
pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let s = out.trim_matches('-').to_string();
    if s.is_empty() {
        "untitled".into()
    } else {
        s
    }
}

/// 간단한 안정 식별자(시간 기반). ULID 대체(contract 허용: "ULID 또는 안정 식별자").
pub fn gen_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos:x}")
}
