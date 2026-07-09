//! 첫 실행 데모 시드. scope-mvp §2.9 — 실제 archive/wiki/relations 파일 생성(UI 하드코딩 금지).
//! config/workspace.json 이 없을 때만 1회 생성한다.
//! 공간별 데이터는 [`data`] 에, 파일 기록 로직은 여기에.

mod data;

use crate::error::AppError;
use crate::models::*;
use crate::storage::{self, frontmatter};

type R = std::result::Result<(), AppError>;

/// 공간 1개를 만드는 데 필요한 재료 일습.
struct SpaceSeed {
    space: KnowledgeSpace,
    subjects: Vec<Subject>,
    notes: Vec<(String, ArchiveNote)>,
    wikis: Vec<(String, WikiPage)>,
    relations: Vec<Relation>,
}

fn subject(id: &str, space_id: &str, name: &str, color: &str, now: &str) -> Subject {
    Subject {
        id: id.into(),
        space_id: space_id.into(),
        name: name.into(),
        semester: None,
        color: Some(color.into()),
        created_at: now.into(),
        updated_at: now.into(),
    }
}

fn note(
    space_id: &str,
    subject: &str,
    id: &str,
    title: &str,
    body: &str,
    now: &str,
) -> ArchiveNote {
    ArchiveNote {
        id: id.into(),
        space_id: space_id.into(),
        source_id: id.into(),
        path: String::new(),
        title: title.into(),
        markdown: body.into(),
        subject_ids: vec![subject.into()],
        created_at: now.into(),
        updated_at: now.into(),
    }
}

fn wiki(
    space_id: &str,
    subject: &str,
    concept: &str,
    title: &str,
    body: &str,
    now: &str,
) -> WikiPage {
    WikiPage {
        id: format!("wiki-{concept}"),
        space_id: space_id.into(),
        concept_id: format!("concept-{concept}"),
        title: title.into(),
        path: String::new(),
        subject_ids: vec![subject.into()],
        source_ids: vec![],
        source_refs: vec![],
        markdown: body.into(),
        created_at: now.into(),
        updated_at: now.into(),
    }
}

#[allow(clippy::too_many_arguments)] // seed 전용 생성 헬퍼
fn rel(
    space_id: &str,
    src: &str,
    tgt: &str,
    t: RelationType,
    strength: f32,
    conf: f32,
    why: &str,
    now: &str,
) -> Relation {
    Relation {
        id: storage::gen_id("rel"),
        space_id: space_id.into(),
        source_node_id: format!("concept-{src}"),
        target_node_id: format!("concept-{tgt}"),
        relation_type: t,
        strength,
        confidence: conf,
        explanation: why.into(),
        evidence: vec![],
        created_at: now.into(),
        updated_at: now.into(),
    }
}

/// seed 관계에 원본 노트 근거(evidence) 를 채운다 — 모든 엣지는 evidence ≥ 1.
fn with_evidence(mut rels: Vec<Relation>, source_id: &str, archive_file: &str) -> Vec<Relation> {
    for r in &mut rels {
        r.evidence = vec![Evidence {
            source_id: source_id.into(),
            source_ref_id: None,
            archive_path: Some(format!("archive/{archive_file}")),
            original_file_path: None,
            page: None,
            quote: None,
            location: None,
            reason: r.explanation.clone(),
        }];
    }
    rels
}

/// 지식 영역 1개를 실제 파일로 기록.
fn seed_space(
    slug: &str,
    subjects: &[Subject],
    notes: &[(String, ArchiveNote)],
    wikis: &[(String, WikiPage)],
    relations: &[Relation],
) -> R {
    storage::ensure_space_tree(slug)?;
    storage::write_json(
        &storage::space_subdir(slug, "config").join("subjects.json"),
        &subjects.to_vec(),
    )?;

    for (file, n) in notes {
        let md = frontmatter::archive_to_md(n, SourceType::Text, None);
        storage::write_text(&storage::space_subdir(slug, "archive").join(file), &md)?;
    }
    for (file, w) in wikis {
        let md = frontmatter::wiki_to_md(w);
        storage::write_text(&storage::space_subdir(slug, "wiki").join(file), &md)?;
    }
    storage::write_json(
        &storage::space_subdir(slug, "relations").join("relations.json"),
        &relations.to_vec(),
    )?;
    Ok(())
}

/// 첫 실행 시드. 이미 초기화돼 있으면(workspace.json 존재) 아무 것도 하지 않는다.
pub fn ensure_seed() -> R {
    let ws_json = storage::config_dir().join("workspace.json");
    if storage::exists(&ws_json) {
        return Ok(());
    }
    let now = storage::now_iso();
    storage::ensure_dir(&storage::config_dir())?;

    let workspace = Workspace {
        id: "ws-piecepool".into(),
        name: "PiecePool Workspace".into(),
        root_path: storage::workspace_root().to_string_lossy().to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    let seeds = data::all(&now);
    for s in &seeds {
        seed_space(&s.space.slug, &s.subjects, &s.notes, &s.wikis, &s.relations)?;
    }
    let spaces: Vec<KnowledgeSpace> = seeds.into_iter().map(|s| s.space).collect();

    // 마지막에 workspace.json/spaces.json (시드 완료 마커)
    storage::write_json(&storage::config_dir().join("spaces.json"), &spaces)?;
    storage::write_json(&ws_json, &workspace)?;
    Ok(())
}
