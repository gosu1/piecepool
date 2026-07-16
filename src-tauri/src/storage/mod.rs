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

/// Workspace 설정 디렉토리 이름. 사용자가 Finder/탐색기로 `~/PiecePool` 을 열면 과목 폴더만
/// 보여야 하므로 닷 프리픽스로 숨긴다. macOS·Windows 가 **같은 이름**을 쓴다 — OS 별로 이름이
/// 갈리면 워크스페이스를 zip 으로 옮길 때 깨지고 경로 SSOT 가 둘이 된다.
/// (Windows 탐색기는 닷 이름을 숨기지 않으므로 `ensure_config_dir` 이 숨김 속성을 따로 건다.)
pub const CONFIG_DIR: &str = ".config";

/// 구버전(닷 프리픽스 도입 전) 설정 디렉토리 이름. `migrate_legacy_config` 의 이관 대상.
const LEGACY_CONFIG_DIR: &str = "config";

pub fn config_dir() -> PathBuf {
    workspace_root().join(CONFIG_DIR)
}

pub fn space_dir(slug: &str) -> PathBuf {
    workspace_root().join(slug)
}

/// 지식 영역 하위 표준 디렉토리.
pub fn space_subdir(slug: &str, sub: &str) -> PathBuf {
    space_dir(slug).join(sub)
}

/// Workspace 설정 디렉토리를 만든다(이미 있으면 무시). 생성 직후 숨김 처리까지 책임진다 —
/// 설정 디렉토리를 만드는 경로는 반드시 이 함수를 거쳐야 숨김이 빠지지 않는다.
pub fn ensure_config_dir() -> Result<()> {
    let dir = config_dir();
    ensure_dir(&dir)?;
    hide_dir(&dir);
    Ok(())
}

/// 디렉토리를 파일 탐색기에서 숨긴다.
/// macOS·Linux: 닷 프리픽스(`CONFIG_DIR`)만으로 숨겨지므로 no-op.
/// Windows: 탐색기가 닷 이름을 숨기지 않아 FILE_ATTRIBUTE_HIDDEN 을 따로 걸어야 한다.
/// 숨김은 부가 기능이라 실패해도 앱은 그대로 동작해야 한다 — 오류는 로그만 남기고 삼킨다.
#[cfg(not(windows))]
fn hide_dir(_dir: &Path) {}

#[cfg(windows)]
fn hide_dir(dir: &Path) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN, INVALID_FILE_ATTRIBUTES,
    };

    let wide: Vec<u16> = dir
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // SAFETY: wide 는 널 종단 UTF-16 이고 호출이 끝날 때까지 살아 있다.
    let attrs = unsafe { GetFileAttributesW(wide.as_ptr()) };
    if attrs == INVALID_FILE_ATTRIBUTES {
        eprintln!("[storage] 숨김 실패(속성 조회): {}", dir.display());
        return;
    }
    if attrs & FILE_ATTRIBUTE_HIDDEN != 0 {
        return; // 이미 숨김 — 멱등
    }
    // SetFileAttributesW 는 속성 집합을 통째로 덮으므로 기존 속성에 HIDDEN 만 더한다.
    // SAFETY: 위와 동일.
    if unsafe { SetFileAttributesW(wide.as_ptr(), attrs | FILE_ATTRIBUTE_HIDDEN) } == 0 {
        eprintln!("[storage] 숨김 실패(속성 설정): {}", dir.display());
    }
}

/// 구버전 워크스페이스의 설정 디렉토리(`config`)를 숨김 이름(`.config`)으로 이관한다.
/// 설정 파일을 읽거나 시드 여부를 판정하기 **전에** 호출해야 한다(seed::ensure_seed 맨 앞).
///
/// legacy 가 있고 `.config` 가 없을 때만 rename 한다. 둘 다 있으면 어느 쪽이 최신인지 알 수 없으므로
/// 아무것도 지우지 않고 로그만 남긴다(사용자 데이터 파괴 금지). 없으면 no-op — 멱등하다.
/// 이관 실패도 앱을 막지 않는다(에러 삼킴) — 그래서 Result 가 아니라 unit 을 반환한다.
///
/// legacy `config` 가 사용자 과목 폴더일 가능성은 없다: `RESERVED_SPACE_DIR` 이 처음부터
/// "config" 를 과목 이름으로 못 쓰게 막아 왔으므로 루트의 `config` 는 언제나 설정 디렉토리다.
pub fn migrate_legacy_config() {
    migrate_config_at(&workspace_root());
}

/// `migrate_legacy_config` 의 본체. 루트를 인자로 받아 테스트가 HOME 을 건드리지 않게 한다
/// (HOME 은 프로세스 전역 — 병렬 테스트끼리 서로의 워크스페이스를 덮어쓴다).
pub(crate) fn migrate_config_at(root: &Path) {
    let legacy = root.join(LEGACY_CONFIG_DIR);
    let target = root.join(CONFIG_DIR);
    if !legacy.is_dir() {
        return; // 구버전 워크스페이스가 아니다(이관 완료 후 재호출 포함)
    }
    if target.exists() {
        eprintln!(
            "[storage] {} 와 {} 가 모두 있어 이관을 건너뛴다 — 수동 확인 필요",
            legacy.display(),
            target.display()
        );
        return;
    }
    match fs::rename(&legacy, &target) {
        Ok(()) => hide_dir(&target),
        Err(e) => eprintln!(
            "[storage] 설정 디렉토리 이관 실패({}): {e}",
            legacy.display()
        ),
    }
}

/// Workspace + 지식 영역 표준 트리를 생성한다(이미 있으면 무시).
pub fn ensure_space_tree(slug: &str) -> Result<()> {
    ensure_config_dir()?;
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

/// 비ASCII(한글 등) 이름용 안정 해시 토큰 — slugify 가 빈 값이 될 때 유니크 slug 재료로 쓴다.
pub fn name_hash(input: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    input.hash(&mut h);
    format!("{:x}", h.finish() & 0xffff_ffff)
}

/// slugify 하되, ASCII 영숫자가 하나도 없으면(순수 한글 등) 이름 해시로 유니크 ASCII slug 를 만든다.
/// slugify 는 비ASCII 를 전부 버려 한글 폴더/파일이 모두 "untitled" 로 겹치므로,
/// 원본 파일명 stem 에서 이 함수를 쓴다. (계약: 파일명 slug = ASCII kebab 유지)
pub fn slug_or_hash(input: &str) -> String {
    if input.chars().any(|c| c.is_ascii_alphanumeric()) {
        slugify(input)
    } else {
        name_hash(input)
    }
}

/// Workspace 루트에서 지식 영역이 쓸 수 없는 이름(설정 디렉토리와 충돌).
/// 레거시 "config" 도 계속 예약한다 — 아직 이관되지 않은 구버전 워크스페이스에서 과목 폴더가
/// 설정 디렉토리를 덮어쓰는 것을 막고, 이관이 실패한 워크스페이스에서도 legacy 를 보호한다.
/// ".config" 는 `space_dir_name` 이 앞 `.` 을 떼므로 실제로 도달하지 않지만, 폴더명 규칙이
/// 바뀌어도 설정 디렉토리가 뚫리지 않게 함께 예약한다.
pub const RESERVED_SPACE_DIR: &[&str] = &[CONFIG_DIR, LEGACY_CONFIG_DIR];

/// 지식 영역 폴더명. 표시 이름을 그대로 쓴다(한글 보존) — Finder 에서 본 이름과 같게.
/// 경로에 위험한 문자만 `-` 로 치환하고, 연속 공백을 접고, 숨김 파일이 되지 않게 앞 `.` 을 떼어낸다.
/// 계약: docs/10-contracts/workspace-layout.md §4.
pub fn space_dir_name(input: &str) -> String {
    let mut out = String::new();
    let mut prev_space = false;
    for ch in input.trim().chars() {
        if ch.is_whitespace() {
            if !prev_space && !out.is_empty() {
                out.push(' ');
                prev_space = true;
            }
            continue;
        }
        prev_space = false;
        match ch {
            '/' | '\\' | ':' | '\0' => out.push('-'),
            c if c.is_control() => out.push('-'),
            c => out.push(c),
        }
    }
    let s = out.trim().trim_start_matches('.').trim().to_string();
    if s.is_empty() {
        "untitled".into()
    } else {
        s
    }
}

/// 지식 영역 폴더를 옮긴다(표시 이름 변경 시). 대상이 이미 있으면 실패한다.
pub fn rename_space_dir(old: &str, new: &str) -> Result<()> {
    let (from, to) = (space_dir(old), space_dir(new));
    if from == to {
        return Ok(());
    }
    if to.exists() {
        return Err(AppError {
            kind: "conflict".into(),
            message: format!("이미 있는 폴더입니다: {}", to.display()),
        });
    }
    fs::rename(&from, &to).map_err(|e| io_err(&format!("rename {}", from.display()), e))
}

/// 간단한 안정 식별자(시간 기반). ULID 대체(contract 허용: "ULID 또는 안정 식별자").
pub fn gen_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos:x}")
}
