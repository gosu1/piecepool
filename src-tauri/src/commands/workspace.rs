use crate::models::{KnowledgeSpace, Subject, Workspace};
use crate::seed;
use crate::storage;

/// Workspace 를 연다(없으면 시드 생성). config/workspace.json 을 읽어 반환.
#[tauri::command]
pub fn get_workspace() -> Result<Workspace, String> {
    seed::ensure_seed()?;
    Ok(storage::read_json(
        &storage::config_dir().join("workspace.json"),
    )?)
}

/// 지식 영역 목록 (config/spaces.json).
#[tauri::command]
pub fn list_spaces() -> Result<Vec<KnowledgeSpace>, String> {
    seed::ensure_seed()?;
    Ok(storage::read_json(
        &storage::config_dir().join("spaces.json"),
    )?)
}

/// 이름과 충돌하지 않는 지식 영역 폴더명을 고른다. 이미 있으면 `이름 2`, `이름 3` … 접미사.
/// 비교는 대소문자 무시 — 케이스 인센시티브 FS(APFS/NTFS)에서 "os" 와 "OS" 는 같은 물리
/// 폴더라, 구분하면 두 공간이 폴더 하나를 공유하고 delete_space 가 남의 공간까지 지운다.
fn unique_dir_name(name: &str, spaces: &[KnowledgeSpace]) -> String {
    let base = storage::space_dir_name(name);
    let taken = |c: &str| {
        spaces.iter().any(|s| s.slug.eq_ignore_ascii_case(c))
            || storage::RESERVED_SPACE_DIR
                .iter()
                .any(|r| r.eq_ignore_ascii_case(c))
    };
    let mut slug = base.clone();
    let mut n = 2;
    while taken(&slug) {
        slug = format!("{base} {n}");
        n += 1;
    }
    slug
}

/// 새 지식 영역(공간)을 만든다. 표시 이름을 그대로 폴더명으로 쓰고(충돌 시 접미사) 표준 디렉토리
/// 트리를 생성한 뒤 config/spaces.json 에 추가한다. 생성된 KnowledgeSpace 를 반환.
#[tauri::command]
pub fn create_space(name: String) -> Result<KnowledgeSpace, String> {
    seed::ensure_seed()?;
    let name = name.trim();
    if name.is_empty() {
        return Err("공간 이름을 입력해 주세요".into());
    }

    let spaces_path = storage::config_dir().join("spaces.json");
    let mut spaces: Vec<KnowledgeSpace> = storage::read_json(&spaces_path)?;

    let slug = unique_dir_name(name, &spaces);

    storage::ensure_space_tree(&slug)?;

    let now = storage::now_iso();
    let space = KnowledgeSpace {
        id: storage::gen_id("space"),
        name: name.to_string(),
        slug: slug.clone(),
        root_path: storage::space_dir(&slug).to_string_lossy().to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    spaces.push(space.clone());
    storage::write_json(&spaces_path, &spaces)?;
    Ok(space)
}

/// 지식 영역(공간)의 표시 이름을 바꾼다. 폴더명은 표시 이름과 같아야 하므로(계약 §4) 디스크 폴더도
/// 함께 옮기고 slug/rootPath 를 갱신한다. 폴더 이동이 실패하면 spaces.json 은 건드리지 않는다.
#[tauri::command]
pub fn rename_space(slug: String, new_name: String) -> Result<KnowledgeSpace, String> {
    let name = new_name.trim();
    if name.is_empty() {
        return Err("공간 이름을 입력해 주세요".into());
    }
    let spaces_path = storage::config_dir().join("spaces.json");
    let mut spaces: Vec<KnowledgeSpace> = storage::read_json(&spaces_path)?;
    if !spaces.iter().any(|s| s.slug == slug) {
        return Err(format!("unknown space: {slug}"));
    }

    // 자기 자신은 충돌 후보에서 뺀다 — 대소문자만 바꾸는 rename 이 "이름 2" 가 되지 않게.
    let others: Vec<KnowledgeSpace> = spaces.iter().filter(|s| s.slug != slug).cloned().collect();
    let new_slug = unique_dir_name(name, &others);

    storage::rename_space_dir(&slug, &new_slug)?;

    let sp = spaces
        .iter_mut()
        .find(|s| s.slug == slug)
        .ok_or_else(|| format!("unknown space: {slug}"))?;
    sp.name = name.to_string();
    sp.slug = new_slug.clone();
    sp.root_path = storage::space_dir(&new_slug).to_string_lossy().to_string();
    sp.updated_at = storage::now_iso();
    let updated = sp.clone();
    storage::write_json(&spaces_path, &spaces)?;
    Ok(updated)
}

/// 지식 영역(공간)을 삭제한다 — 공간 디렉토리 전체(노트·위키·관계 포함) + spaces.json 항목.
/// 되돌릴 수 없다(프론트가 확인 다이얼로그로 감싼다). 디렉토리 제거가 실패하면 목록은 건드리지 않아 공간이 온전히 남는다.
#[tauri::command]
pub fn delete_space(slug: String) -> Result<(), String> {
    let spaces_path = storage::config_dir().join("spaces.json");
    let mut spaces: Vec<KnowledgeSpace> = storage::read_json(&spaces_path)?;
    let before = spaces.len();
    spaces.retain(|s| s.slug != slug);
    if spaces.len() == before {
        return Err(format!("unknown space: {slug}"));
    }
    storage::remove_dir_all(&storage::space_dir(&slug))?;
    storage::write_json(&spaces_path, &spaces)?;
    Ok(())
}

/// 한 지식 영역의 과목 목록 (<space>/config/subjects.json).
#[tauri::command]
pub fn list_subjects(space: String) -> Result<Vec<Subject>, String> {
    let path = storage::space_subdir(&space, "config").join("subjects.json");
    if !storage::exists(&path) {
        return Ok(vec![]);
    }
    Ok(storage::read_json(&path)?)
}

/// 원본 파일 목록 (<space>/sources/original-files/). 모든 확장자.
#[tauri::command]
pub fn list_sources(space: String) -> Result<Vec<String>, String> {
    let dir = storage::space_subdir(&space, "sources/original-files");
    Ok(storage::list_files(&dir, "")?)
}

/// PDF 페이지별 텍스트 추출 (sources/original-files/<file>). page_count 는 #page=N 범위 SSOT.
/// (async): CPU-heavy — 메인 스레드에서 돌리면 추출 내내 UI·IPC 전체가 멈춘다.
#[tauri::command(async)]
pub fn extract_pdf_text(
    space: String,
    file: String,
) -> Result<crate::models::PdfExtractResult, String> {
    let path = storage::safe_join(
        &storage::space_subdir(&space, "sources/original-files"),
        &file,
    )?;
    Ok(crate::pdf::extract(&path)?)
}

/// 원본 파일 바이트를 base64 로 반환 (FilePreview: 이미지/PDF data URL). sources/original-files/ 하위만.
/// (async): 수십 MB 읽기+인코딩 — 메인 스레드 블록 방지.
#[tauri::command(async)]
pub fn read_file_bytes(space: String, file: String) -> Result<String, String> {
    let path = storage::safe_join(
        &storage::space_subdir(&space, "sources/original-files"),
        &file,
    )?;
    let bytes = storage::read_bytes(&path)?;
    Ok(storage::to_base64(&bytes))
}

/// 원본 파일 삭제 (sources/original-files/<file>). 없는 파일은 오류.
/// 노트/위키 본문의 ![[임베드]] 는 건드리지 않는다 — 깨진 링크 처리는 뷰어 몫(자동 재작성 금지 계약).
#[tauri::command]
pub fn delete_source(space: String, file: String) -> Result<(), String> {
    let path = storage::safe_join(
        &storage::space_subdir(&space, "sources/original-files"),
        &file,
    )?;
    Ok(storage::remove_file(&path)?)
}

/// base64 원본 파일을 <space>/sources/original-files/ 에 저장하고 최종 파일명을 반환.
/// 파일명 정리: stem 은 slug_or_hash(한글 등은 해시), 확장자는 slugify(소문자 영숫자). 충돌 시 base-2.ext … 접미사.
/// (async): 최대 50MB 디코드+쓰기 — 메인 스레드 블록 방지.
#[tauri::command(async)]
pub fn save_source_file(
    space: String,
    name: String,
    data_base64: String,
) -> Result<String, String> {
    crate::commands::space_by_slug(&space)?;
    let data = storage::from_base64(&data_base64)?;
    if data.len() > 50 * 1024 * 1024 {
        return Err("파일이 너무 큽니다 (최대 50MB)".into());
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !e.trim().is_empty() => (s, e),
        _ => return Err("파일 확장자가 필요합니다".into()),
    };
    let safe_name = format!("{}.{}", storage::slug_or_hash(stem), storage::slugify(ext));
    let dir = storage::space_subdir(&space, "sources/original-files");
    let final_name = crate::commands::unique_file_name(&dir, &safe_name);
    let path = storage::safe_join(&dir, &final_name)?;
    storage::write_bytes(&path, &data)?;
    Ok(final_name)
}

/// 원본 파일을 다른 공간의 sources/original-files/ 로 옮기고 최종 파일명을 반환.
/// 대상에 동명 파일이 있으면 base-2.ext 접미사가 붙으므로 호출부는 반환된 이름을 써야 한다.
/// from == to 는 no-op. 부분 실패 안전 순서: 복사 → 원본 삭제(move_note 와 동일).
#[tauri::command]
pub fn move_source(from_space: String, to_space: String, file: String) -> Result<String, String> {
    crate::commands::space_by_slug(&from_space)?;
    crate::commands::space_by_slug(&to_space)?;
    if from_space == to_space {
        return Ok(file);
    }
    let from = storage::safe_join(
        &storage::space_subdir(&from_space, "sources/original-files"),
        &file,
    )?;
    if !storage::exists(&from) {
        return Err(format!("원본 없음: {file}"));
    }
    storage::ensure_space_tree(&to_space)?;
    let to_dir = storage::space_subdir(&to_space, "sources/original-files");
    let final_name = crate::commands::unique_file_name(&to_dir, &file);
    let to = storage::safe_join(&to_dir, &final_name)?;

    let bytes = storage::read_bytes(&from)?;
    storage::write_bytes(&to, &bytes)?;
    // 대상 기록은 끝났다 — 소스 정리 실패(잠금 등)는 무해한 복사본만 남기므로 오류로 만들지 않는다.
    let _ = storage::remove_file(&from);
    Ok(final_name)
}
