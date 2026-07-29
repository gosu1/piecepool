use std::collections::HashSet;

use crate::commands::space_by_slug;
use crate::models::WikiPage;
use crate::storage::{self, frontmatter};

/// wiki/*.md 전체를 WikiPage 로 파싱(제목순).
#[tauri::command]
pub fn list_wiki(space: String) -> Result<Vec<WikiPage>, String> {
    let sp = space_by_slug(&space)?;
    let mut out = storage::list_parsed(&space, "wiki", |f, md| {
        frontmatter::md_to_wiki(&sp.id, f, md).ok()
    })?;
    out.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(out)
}

#[tauri::command]
pub fn read_wiki(space: String, file: String) -> Result<WikiPage, String> {
    let sp = space_by_slug(&space)?;
    Ok(storage::read_parsed(&space, "wiki", &file, |f, md| {
        frontmatter::md_to_wiki(&sp.id, f, md)
    })?)
}

/// WikiPage 저장. archive 는 절대 건드리지 않는다(원문 보존). 파일명 = path 또는 concept slug.
#[tauri::command(async)]
pub fn save_wiki(space: String, page: WikiPage) -> Result<WikiPage, String> {
    let subjects = crate::commands::subject_ids(&space);
    let sources = crate::commands::source_ids(&space);
    save_wiki_with(&space, page, &subjects, &sources)
}

/// WikiPage 여러 개를 한 번에 저장 — 임포트 writing 단계 전용.
/// subject/source 레지스트리(source_ids 는 archive 전체 스캔)를 페이지마다가 아니라 1회만 읽는다.
#[tauri::command(async)]
pub fn save_wiki_batch(space: String, pages: Vec<WikiPage>) -> Result<Vec<WikiPage>, String> {
    let subjects = crate::commands::subject_ids(&space);
    let sources = crate::commands::source_ids(&space);
    let mut out = Vec::with_capacity(pages.len());
    for page in pages {
        out.push(save_wiki_with(&space, page, &subjects, &sources)?);
    }
    Ok(out)
}

fn save_wiki_with(
    space: &str,
    mut page: WikiPage,
    subjects: &HashSet<String>,
    sources: &HashSet<String>,
) -> Result<WikiPage, String> {
    if page.path.is_empty() {
        let slug = page
            .concept_id
            .strip_prefix("concept-")
            .unwrap_or(&page.concept_id);
        page.path = format!("{}.md", storage::slugify(slug));
    }
    if page.created_at.is_empty() {
        page.created_at = storage::now_iso();
    }
    page.updated_at = storage::now_iso();
    // 저장 전 frontmatter 검증 (hard-fail)
    frontmatter::validate_wiki(&page, subjects, sources)?;
    // archive 보호: wiki 저장은 반드시 wiki/ 아래로만 (path-traversal 방어).
    let path = storage::safe_join(&storage::space_subdir(space, "wiki"), &page.path)?;
    let md = frontmatter::wiki_to_md(&page);
    storage::write_text(&path, &md)?;
    Ok(page)
}

/// 위키 삭제 + 해당 개념이 걸린 관계를 relations.json 에서 정리. 정리된 관계 수 반환.
#[tauri::command]
pub fn delete_wiki(space: String, file: String) -> Result<usize, String> {
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "wiki"), &file)?;
    let md = storage::read_text(&path)?;
    let page = frontmatter::md_to_wiki(&sp.id, &file, &md)?;
    storage::remove_file(&path)?;

    // dangling edge 방지: 삭제된 개념을 source/target 으로 갖는 관계 제거.
    let relations = crate::graph::read_relations(&space)?;
    let before = relations.len();
    let kept: Vec<_> = relations
        .into_iter()
        .filter(|r| r.source_node_id != page.concept_id && r.target_node_id != page.concept_id)
        .collect();
    let pruned = before - kept.len();
    if pruned > 0 {
        crate::graph::write_relations(&space, &kept)?;
    }
    Ok(pruned)
}

/// 위키 제목 변경. 파일명(path)은 다른 곳에서 참조되므로 유지한다.
#[tauri::command]
pub fn rename_wiki(space: String, file: String, new_title: String) -> Result<WikiPage, String> {
    let title = new_title.trim().to_string();
    if title.is_empty() {
        return Err("제목이 비어 있습니다".into());
    }
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "wiki"), &file)?;
    let md = storage::read_text(&path)?;
    let mut page = frontmatter::md_to_wiki(&sp.id, &file, &md)?;
    page.title = title;
    page.updated_at = storage::now_iso();
    frontmatter::validate_wiki(
        &page,
        &crate::commands::subject_ids(&space),
        &crate::commands::source_ids(&space),
    )?;
    storage::write_text(&path, &frontmatter::wiki_to_md(&page))?;
    Ok(page)
}
