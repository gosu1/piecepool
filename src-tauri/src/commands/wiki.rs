use crate::commands::space_by_slug;
use crate::models::WikiPage;
use crate::storage::{self, frontmatter};

/// wiki/*.md 전체를 WikiPage 로 파싱(제목순).
#[tauri::command]
pub fn list_wiki(space: String) -> Result<Vec<WikiPage>, String> {
    let sp = space_by_slug(&space)?;
    let dir = storage::space_subdir(&space, "wiki");
    let files = storage::list_files(&dir, ".md").map_err(|e| e.to_string())?;
    let mut out = vec![];
    for f in files {
        let md = storage::read_text(&dir.join(&f)).map_err(|e| e.to_string())?;
        if let Ok(p) = frontmatter::md_to_wiki(&sp.id, &f, &md) {
            out.push(p);
        }
    }
    out.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(out)
}

#[tauri::command]
pub fn read_wiki(space: String, file: String) -> Result<WikiPage, String> {
    let sp = space_by_slug(&space)?;
    let path = storage::safe_join(&storage::space_subdir(&space, "wiki"), &file).map_err(|e| e.to_string())?;
    let md = storage::read_text(&path).map_err(|e| e.to_string())?;
    frontmatter::md_to_wiki(&sp.id, &file, &md).map_err(|e| e.to_string())
}

/// WikiPage 저장. archive 는 절대 건드리지 않는다(원문 보존). 파일명 = path 또는 concept slug.
#[tauri::command]
pub fn save_wiki(space: String, page: WikiPage) -> Result<WikiPage, String> {
    let mut page = page;
    if page.path.is_empty() {
        let slug = page.concept_id.strip_prefix("concept-").unwrap_or(&page.concept_id);
        page.path = format!("{}.md", storage::slugify(slug));
    }
    if page.created_at.is_empty() {
        page.created_at = storage::now_iso();
    }
    page.updated_at = storage::now_iso();
    // 저장 전 frontmatter 검증 (hard-fail)
    frontmatter::validate_wiki(&page, &crate::commands::subject_ids(&space), &crate::commands::source_ids(&space))
        .map_err(|e| e.to_string())?;
    // archive 보호: wiki 저장은 반드시 wiki/ 아래로만 (path-traversal 방어).
    let path = storage::safe_join(&storage::space_subdir(&space, "wiki"), &page.path).map_err(|e| e.to_string())?;
    let md = frontmatter::wiki_to_md(&page);
    storage::write_text(&path, &md).map_err(|e| e.to_string())?;
    Ok(page)
}
