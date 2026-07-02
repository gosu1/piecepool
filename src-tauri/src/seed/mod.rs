//! 첫 실행 데모 시드. scope-mvp §2.9 — 실제 archive/wiki/relations 파일 생성(UI 하드코딩 금지).
//! config/workspace.json 이 없을 때만 1회 생성한다.

use crate::error::AppError;
use crate::models::*;
use crate::storage::{self, frontmatter};

type R = std::result::Result<(), AppError>;

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

fn note(space_id: &str, subject: &str, id: &str, title: &str, body: &str, now: &str) -> ArchiveNote {
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

fn wiki(space_id: &str, subject: &str, concept: &str, title: &str, body: &str, now: &str) -> WikiPage {
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
fn rel(space_id: &str, src: &str, tgt: &str, t: RelationType, strength: f32, conf: f32, why: &str, now: &str) -> Relation {
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
    storage::write_json(&storage::space_subdir(slug, "config").join("subjects.json"), &subjects.to_vec())?;

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

    // ── Workspace + spaces.json ──
    let workspace = Workspace {
        id: "ws-piecepool".into(),
        name: "PiecePool Workspace".into(),
        root_path: storage::workspace_root().to_string_lossy().to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let spaces = vec![
        KnowledgeSpace {
            id: "space-os".into(),
            name: "운영체제".into(),
            slug: "operating-systems".into(),
            root_path: storage::space_dir("operating-systems").to_string_lossy().to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        KnowledgeSpace {
            id: "space-ai".into(),
            name: "AI 딥러닝".into(),
            slug: "deeplearning".into(),
            root_path: storage::space_dir("deeplearning").to_string_lossy().to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
    ];

    // ── 운영체제 ──
    let os_subjects = vec![subject("subject-os", "space-os", "운영체제론", "#0075de", &now)];
    let os_notes = vec![(
        format!("{}-os-overview.md", storage::today()),
        note(
            "space-os",
            "subject-os",
            "source-os-overview",
            "운영체제 개요 강의 노트",
            "# 운영체제 개요\n\n운영체제의 핵심 기능은 프로세스 관리, 메모리 관리, 동기화다.\n프로세스 스케줄링은 CPU 이용률을 극대화하기 위해 실행 가능한 프로세스들 사이에서 CPU를 할당한다.\n스레드는 프로세스 내부의 실행 단위이며, 동기화 문제를 잘못 다루면 교착상태가 발생한다.",
            &now,
        ),
    )];
    let os_wikis = vec![
        (
            "process.md".into(),
            wiki("space-os", "subject-os", "process", "프로세스",
                "# 프로세스\n\n프로세스는 실행 중인 프로그램의 인스턴스다. 코드, 데이터, 스택, 그리고 PCB(Process Control Block)로 구성된다.\n\n## 상태\n\n생성 → 준비 → 실행 → 대기 → 종료 의 생애주기를 가진다.\n\n## 관련 개념\n\n프로세스 내부의 실행 단위는 [[스레드]]이고, 실행 순서는 [[CPU 스케줄링]]이 결정한다.", &now),
        ),
        (
            "thread.md".into(),
            wiki("space-os", "subject-os", "thread", "스레드",
                "# 스레드\n\n스레드는 프로세스 내부의 실행 단위다. 같은 프로세스의 스레드들은 코드·데이터·힙을 공유하지만 각자의 스택과 레지스터를 가진다.", &now),
        ),
        (
            "cpu-scheduling.md".into(),
            wiki("space-os", "subject-os", "cpu-scheduling", "CPU 스케줄링",
                "# CPU 스케줄링\n\nCPU 스케줄링은 실행 가능한 프로세스들 사이에서 CPU를 할당하는 과정이다. 선점형(Preemptive)과 비선점형 알고리즘이 있다.\n\n- FCFS, SJF, Round Robin, Priority", &now),
        ),
        (
            "synchronization.md".into(),
            wiki("space-os", "subject-os", "synchronization", "동기화",
                "# 동기화\n\n동기화는 공유 자원에 대한 동시 접근을 조율한다. 임계 구역(critical section) 문제를 뮤텍스·세마포어·모니터로 해결한다.\n\n여러 [[스레드]]가 경쟁할 때 잘못 다루면 [[교착상태]]가 발생한다.", &now),
        ),
        (
            "deadlock.md".into(),
            wiki("space-os", "subject-os", "deadlock", "교착상태",
                "# 교착상태 (Deadlock)\n\n교착상태는 둘 이상의 프로세스가 서로의 자원을 기다리며 영원히 진행하지 못하는 상태다.\n\n## 발생 조건\n\n상호 배제, 점유와 대기, 비선점, 순환 대기 — 네 조건이 동시에 성립할 때 발생한다.", &now),
        ),
    ];
    let os_relations = vec![
        rel("space-os", "thread", "process", RelationType::PartOf, 0.9, 0.95, "스레드는 프로세스의 실행 단위다.", &now),
        rel("space-os", "cpu-scheduling", "process", RelationType::UsedIn, 0.8, 0.9, "CPU 스케줄링은 프로세스에 CPU를 할당한다.", &now),
        rel("space-os", "synchronization", "process", RelationType::RelatedTo, 0.6, 0.8, "동기화는 프로세스/스레드 간 자원 접근을 조율한다.", &now),
        rel("space-os", "synchronization", "thread", RelationType::Prerequisite, 0.5, 0.7, "스레드 동시 실행을 다루려면 동기화 개념이 필요하다.", &now),
        rel("space-os", "synchronization", "deadlock", RelationType::Causes, 0.85, 0.9, "잘못된 동기화는 교착상태를 유발한다.", &now),
    ];
    let os_relations = with_evidence(os_relations, "source-os-overview", &format!("{}-os-overview.md", storage::today()));
    seed_space("operating-systems", &os_subjects, &os_notes, &os_wikis, &os_relations)?;

    // ── AI 딥러닝 ──
    let ai_subjects = vec![subject("subject-ai", "space-ai", "AI 딥러닝", "#2a9d99", &now)];
    let ai_notes = vec![(
        format!("{}-transformer-notes.md", storage::today()),
        note(
            "space-ai",
            "subject-ai",
            "source-transformer",
            "트랜스포머 강의 노트",
            "# 트랜스포머\n\n트랜스포머는 self-attention 으로 시퀀스의 토큰 간 관계를 계산한다. 임베딩으로 토큰을 벡터화한 뒤 attention 으로 문맥을 합성한다.",
            &now,
        ),
    )];
    let ai_wikis = vec![
        (
            "transformer.md".into(),
            wiki("space-ai", "subject-ai", "transformer", "트랜스포머",
                "# 트랜스포머\n\n트랜스포머는 RNN 없이 self-attention 만으로 시퀀스를 처리하는 신경망 구조다. 인코더-디코더로 구성된다.\n\n핵심 구성요소는 [[셀프 어텐션]]이며 입력은 [[임베딩]]으로 벡터화한다.", &now),
        ),
        (
            "self-attention.md".into(),
            wiki("space-ai", "subject-ai", "self-attention", "셀프 어텐션",
                "# 셀프 어텐션\n\nSelf-Attention은 시퀀스 안의 토큰들이 서로의 관계를 계산해 문맥 표현을 만드는 mechanism이다. Query·Key·Value 의 내적으로 가중치를 구한다.", &now),
        ),
        (
            "embedding.md".into(),
            wiki("space-ai", "subject-ai", "embedding", "임베딩",
                "# 임베딩\n\n임베딩은 토큰을 연속 벡터 공간으로 사상한다. 의미가 가까운 토큰은 가까운 벡터가 된다.", &now),
        ),
    ];
    let ai_relations = vec![
        rel("space-ai", "self-attention", "transformer", RelationType::PartOf, 0.9, 0.95, "셀프 어텐션은 트랜스포머의 핵심 구성요소다.", &now),
        rel("space-ai", "embedding", "transformer", RelationType::Prerequisite, 0.7, 0.85, "임베딩은 트랜스포머 입력의 전제다.", &now),
        rel("space-ai", "embedding", "self-attention", RelationType::UsedIn, 0.6, 0.8, "셀프 어텐션은 임베딩 벡터에 작용한다.", &now),
    ];
    let ai_relations = with_evidence(ai_relations, "source-transformer", &format!("{}-transformer-notes.md", storage::today()));
    seed_space("deeplearning", &ai_subjects, &ai_notes, &ai_wikis, &ai_relations)?;

    // ── 마지막에 workspace.json/spaces.json (시드 완료 마커) ──
    storage::write_json(&storage::config_dir().join("spaces.json"), &spaces)?;
    storage::write_json(&ws_json, &workspace)?;
    Ok(())
}
