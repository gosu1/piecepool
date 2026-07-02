//! YAML frontmatter 최소 코덱. SSOT: docs/10-contracts/markdown-frontmatter.md.
//! 서드파티 yaml crate 없이, 우리가 쓰는 필드 형태만 관용적으로 파싱/직렬화한다.
//!   - `key: scalar`
//!   - `key:` + 2-space `- scalar`            (string list)
//!   - `key:` + 2-space `- subkey: val` ...    (list of maps — sourceRefs)

use std::collections::HashSet;

use crate::error::AppError;
use crate::models::{ArchiveNote, SourceRef, SourceType, WikiPage};

fn err(msg: impl Into<String>) -> AppError {
    AppError { kind: "schema".into(), message: msg.into() }
}

fn invalid(msg: impl Into<String>) -> AppError {
    AppError { kind: "frontmatter_invalid".into(), message: msg.into() }
}

/// offset-aware ISO 8601 여부 — `YYYY-MM-DDTHH:MM:SS(.fff)?(Z|±HH:MM)`.
pub fn valid_iso8601(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() < 20 {
        return false;
    }
    let d = |i: usize| b[i].is_ascii_digit();
    if !(d(0) && d(1) && d(2) && d(3)) || b[4] != b'-' || !(d(5) && d(6)) || b[7] != b'-' || !(d(8) && d(9)) {
        return false;
    }
    if b[10] != b'T' {
        return false;
    }
    if !(d(11) && d(12)) || b[13] != b':' || !(d(14) && d(15)) || b[16] != b':' || !(d(17) && d(18)) {
        return false;
    }
    let rest = &s[19..];
    let rest = if let Some(r) = rest.strip_prefix('.') {
        let nd = r.find(|c: char| !c.is_ascii_digit()).unwrap_or(r.len());
        if nd == 0 {
            return false;
        }
        &r[nd..]
    } else {
        rest
    };
    if rest == "Z" {
        return true;
    }
    let z = rest.as_bytes();
    z.len() == 6
        && (z[0] == b'+' || z[0] == b'-')
        && z[1].is_ascii_digit()
        && z[2].is_ascii_digit()
        && z[3] == b':'
        && z[4].is_ascii_digit()
        && z[5].is_ascii_digit()
}

/// ArchiveNote frontmatter 검증(저장 전, hard-fail). SSOT: markdown-frontmatter.md §4.
/// (2) id, (3) subjectIds→실제 Subject, (6) pdf/image 는 originalFilePath 필수, (7) 시각 ISO 8601.
pub fn validate_archive(
    note: &ArchiveNote,
    source_type: SourceType,
    original_file_path: Option<&str>,
    subjects: &HashSet<String>,
) -> std::result::Result<(), AppError> {
    if note.id.trim().is_empty() {
        return Err(invalid("id 가 비어있음"));
    }
    for sid in &note.subject_ids {
        if !subjects.contains(sid) {
            return Err(invalid(format!("존재하지 않는 Subject: {sid}")));
        }
    }
    if matches!(source_type, SourceType::Pdf | SourceType::Image) && original_file_path.is_none() {
        return Err(invalid("pdf/image 원문은 originalFilePath 필수"));
    }
    if !valid_iso8601(&note.created_at) {
        return Err(invalid(format!("createdAt ISO 8601 아님: {}", note.created_at)));
    }
    if !note.updated_at.is_empty() && !valid_iso8601(&note.updated_at) {
        return Err(invalid(format!("updatedAt ISO 8601 아님: {}", note.updated_at)));
    }
    Ok(())
}

/// WikiPage frontmatter 검증(저장 전, hard-fail). (2) id, (3) subjectIds, (4) sourceRefs.sourceId→실제 Source, (7) 시각.
/// (5) sourceRefs.file 부재는 soft broken-link — 여기서 hard-fail 하지 않는다(호출부에서 경고).
pub fn validate_wiki(
    page: &WikiPage,
    subjects: &HashSet<String>,
    sources: &HashSet<String>,
) -> std::result::Result<(), AppError> {
    if page.id.trim().is_empty() {
        return Err(invalid("id 가 비어있음"));
    }
    for sid in &page.subject_ids {
        if !subjects.contains(sid) {
            return Err(invalid(format!("존재하지 않는 Subject: {sid}")));
        }
    }
    for r in &page.source_refs {
        if !sources.contains(&r.source_id) {
            return Err(invalid(format!("존재하지 않는 Source 참조: {}", r.source_id)));
        }
    }
    if !valid_iso8601(&page.created_at) {
        return Err(invalid(format!("createdAt ISO 8601 아님: {}", page.created_at)));
    }
    if !valid_iso8601(&page.updated_at) {
        return Err(invalid(format!("updatedAt ISO 8601 아님: {}", page.updated_at)));
    }
    Ok(())
}

/// `---\n<fm>\n---\n<body>` 를 (fm, body)로 분리. frontmatter 없으면 ("", 전체).
pub fn split(md: &str) -> (String, String) {
    let trimmed = md.strip_prefix('\u{feff}').unwrap_or(md);
    if let Some(rest) = trimmed.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            let fm = &rest[..end];
            let after = &rest[end + 4..];
            let body = after.strip_prefix('\n').unwrap_or(after);
            return (fm.to_string(), body.to_string());
        }
    }
    (String::new(), trimmed.to_string())
}

fn unquote(s: &str) -> String {
    let s = s.trim();
    if (s.starts_with('"') && s.ends_with('"') && s.len() >= 2)
        || (s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2)
    {
        s[1..s.len() - 1].to_string()
    } else {
        s.to_string()
    }
}

/// 파싱된 frontmatter 접근기.
pub struct Fm {
    lines: Vec<String>,
}

impl Fm {
    pub fn parse(fm: &str) -> Self {
        Fm { lines: fm.lines().map(|l| l.to_string()).collect() }
    }

    /// top-level `key: value` 스칼라.
    pub fn scalar(&self, key: &str) -> Option<String> {
        let prefix = format!("{key}:");
        for line in &self.lines {
            if line.starts_with(&prefix) && !line.starts_with(' ') {
                let v = line[prefix.len()..].trim();
                if v.is_empty() {
                    return None;
                }
                return Some(unquote(v));
            }
        }
        None
    }

    /// top-level `key:` 아래 2-space `- item` 문자열 리스트.
    pub fn list(&self, key: &str) -> Vec<String> {
        let mut out = vec![];
        let prefix = format!("{key}:");
        let mut capturing = false;
        for line in &self.lines {
            if !line.starts_with(' ') && line.starts_with(&prefix) {
                capturing = line[prefix.len()..].trim().is_empty();
                continue;
            }
            if capturing {
                let t = line.trim_start();
                if line.starts_with(' ') && t.starts_with("- ") {
                    out.push(unquote(t[2..].trim()));
                } else if !line.trim().is_empty() && !line.starts_with(' ') {
                    break;
                }
            }
        }
        out
    }

    /// top-level `key:` 아래 list-of-maps. 각 map은 (subkey -> value).
    pub fn map_list(&self, key: &str) -> Vec<Vec<(String, String)>> {
        let mut out: Vec<Vec<(String, String)>> = vec![];
        let prefix = format!("{key}:");
        let mut capturing = false;
        for line in &self.lines {
            if !line.starts_with(' ') && line.starts_with(&prefix) {
                capturing = line[prefix.len()..].trim().is_empty();
                continue;
            }
            if !capturing {
                continue;
            }
            if !line.starts_with(' ') && !line.trim().is_empty() {
                break;
            }
            let t = line.trim_start();
            if let Some(rest) = t.strip_prefix("- ") {
                out.push(vec![]);
                if let Some((k, v)) = rest.split_once(':') {
                    out.last_mut().unwrap().push((k.trim().to_string(), unquote(v)));
                }
            } else if let Some((k, v)) = t.split_once(':') {
                if let Some(last) = out.last_mut() {
                    last.push((k.trim().to_string(), unquote(v)));
                }
            }
        }
        out
    }
}

// ── YAML 빌더 헬퍼 ──────────────────────────────────────────
fn yq(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn yaml_scalar(buf: &mut String, key: &str, val: &str) {
    buf.push_str(&format!("{key}: {}\n", yq(val)));
}

fn yaml_list(buf: &mut String, key: &str, items: &[String]) {
    if items.is_empty() {
        buf.push_str(&format!("{key}: []\n"));
        return;
    }
    buf.push_str(&format!("{key}:\n"));
    for it in items {
        buf.push_str(&format!("  - {}\n", yq(it)));
    }
}

// ── ArchiveNote ─────────────────────────────────────────────
fn source_type_str(t: SourceType) -> &'static str {
    match t {
        SourceType::Text => "text",
        SourceType::Pdf => "pdf",
        SourceType::SummaryText => "summary_text",
        SourceType::Image => "image",
    }
}
fn source_type_from(s: &str) -> SourceType {
    match s {
        "pdf" => SourceType::Pdf,
        "summary_text" => SourceType::SummaryText,
        "image" => SourceType::Image,
        _ => SourceType::Text,
    }
}

pub fn archive_to_md(note: &ArchiveNote, source_type: SourceType, original_file_path: Option<&str>) -> String {
    let mut fm = String::new();
    yaml_scalar(&mut fm, "id", &note.id);
    fm.push_str("type: archive\n");
    fm.push_str(&format!("sourceType: {}\n", source_type_str(source_type)));
    yaml_scalar(&mut fm, "title", &note.title);
    yaml_list(&mut fm, "subjectIds", &note.subject_ids);
    yaml_scalar(&mut fm, "sourceId", &note.source_id);
    if let Some(p) = original_file_path {
        yaml_scalar(&mut fm, "originalFilePath", p);
    }
    yaml_scalar(&mut fm, "createdAt", &note.created_at);
    yaml_scalar(&mut fm, "updatedAt", &note.updated_at);
    format!("---\n{fm}---\n\n{}", note.markdown)
}

pub fn md_to_archive(space_id: &str, path: &str, md: &str) -> std::result::Result<ArchiveNote, AppError> {
    let (fm_text, body) = split(md);
    let fm = Fm::parse(&fm_text);
    let id = fm.scalar("id").ok_or_else(|| err("archive: missing id"))?;
    Ok(ArchiveNote {
        id: id.clone(),
        space_id: space_id.to_string(),
        source_id: fm.scalar("sourceId").unwrap_or(id),
        path: path.to_string(),
        title: fm.scalar("title").unwrap_or_default(),
        markdown: body.trim_start_matches('\n').to_string(),
        subject_ids: fm.list("subjectIds"),
        created_at: fm.scalar("createdAt").unwrap_or_default(),
        updated_at: fm.scalar("updatedAt").unwrap_or_default(),
    })
}

/// archive 파일의 sourceType(본문 표시용은 아니지만 보존). 현재는 사용처에서 필요 없으면 무시.
pub fn archive_source_type(md: &str) -> SourceType {
    let (fm_text, _) = split(md);
    let fm = Fm::parse(&fm_text);
    source_type_from(&fm.scalar("sourceType").unwrap_or_else(|| "text".into()))
}

// ── WikiPage ────────────────────────────────────────────────
pub fn wiki_to_md(page: &WikiPage) -> String {
    let mut fm = String::new();
    yaml_scalar(&mut fm, "id", &page.id);
    fm.push_str("type: wiki\n");
    yaml_scalar(&mut fm, "conceptId", &page.concept_id);
    yaml_scalar(&mut fm, "title", &page.title);
    yaml_list(&mut fm, "subjectIds", &page.subject_ids);
    yaml_list(&mut fm, "sourceIds", &page.source_ids);
    fm.push_str("sourceRefs:\n");
    if page.source_refs.is_empty() {
        // 빈 리스트는 `[]` 로
        fm.pop();
        fm.push_str(" []\n");
    } else {
        for r in &page.source_refs {
            fm.push_str(&format!("  - id: {}\n", yq(&r.id)));
            fm.push_str(&format!("    sourceId: {}\n", yq(&r.source_id)));
            fm.push_str(&format!("    file: {}\n", yq(&r.file)));
            if let Some(p) = r.page {
                fm.push_str(&format!("    page: {p}\n"));
            }
            fm.push_str(&format!("    embed: {}\n", r.embed));
            if let Some(l) = &r.label {
                fm.push_str(&format!("    label: {}\n", yq(l)));
            }
            if let Some(rs) = &r.reason {
                fm.push_str(&format!("    reason: {}\n", yq(rs)));
            }
        }
    }
    yaml_scalar(&mut fm, "createdAt", &page.created_at);
    yaml_scalar(&mut fm, "updatedAt", &page.updated_at);
    format!("---\n{fm}---\n\n{}", page.markdown)
}

pub fn md_to_wiki(space_id: &str, path: &str, md: &str) -> std::result::Result<WikiPage, AppError> {
    let (fm_text, body) = split(md);
    let fm = Fm::parse(&fm_text);
    let id = fm.scalar("id").ok_or_else(|| err("wiki: missing id"))?;
    let source_refs = fm
        .map_list("sourceRefs")
        .into_iter()
        .filter_map(|m| {
            let get = |k: &str| m.iter().find(|(kk, _)| kk == k).map(|(_, v)| v.clone());
            Some(SourceRef {
                id: get("id")?,
                source_id: get("sourceId").unwrap_or_default(),
                file: get("file").unwrap_or_default(),
                page: get("page").and_then(|p| p.parse().ok()),
                embed: get("embed").map(|e| e == "true").unwrap_or(false),
                label: get("label"),
                reason: get("reason"),
            })
        })
        .collect();
    Ok(WikiPage {
        id: id.clone(),
        space_id: space_id.to_string(),
        concept_id: fm.scalar("conceptId").unwrap_or_else(|| id.clone()),
        title: fm.scalar("title").unwrap_or_default(),
        path: path.to_string(),
        subject_ids: fm.list("subjectIds"),
        source_ids: fm.list("sourceIds"),
        source_refs,
        markdown: body.trim_start_matches('\n').to_string(),
        created_at: fm.scalar("createdAt").unwrap_or_default(),
        updated_at: fm.scalar("updatedAt").unwrap_or_default(),
    })
}
