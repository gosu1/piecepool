use crate::{commands, seed, storage};

#[test]
fn slug_or_hash_handles_korean() {
    // ASCII 있으면 slugify 그대로
    assert_eq!(
        storage::slug_or_hash("Operating Systems"),
        "operating-systems"
    );
    assert_eq!(storage::slug_or_hash("CS 자료구조"), "cs");
    // 순수 한글은 untitled 로 뭉개지지 않고 유니크 해시 slug (원본 파일명 stem 용)
    let a = storage::slug_or_hash("자료구조");
    let b = storage::slug_or_hash("알고리즘");
    assert_ne!(a, "untitled");
    assert!(a.chars().all(|c| c.is_ascii_alphanumeric()));
    assert_ne!(a, b, "다른 한글 이름은 다른 slug");
    assert_eq!(a, storage::slug_or_hash("자료구조"), "같은 이름은 안정적");
}

/// 이관 테스트용 빈 루트. HOME 을 건드리지 않는다 — HOME 은 프로세스 전역이라
/// 병렬로 도는 seed_and_read_back 의 워크스페이스를 덮어쓴다.
fn migrate_root(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("pp-migrate-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("root");
    root
}

#[test]
fn config_dir_is_hidden() {
    // Finder/탐색기에서 ~/PiecePool 을 열면 과목 폴더만 보여야 한다.
    let dir = storage::config_dir();
    assert!(
        dir.ends_with(storage::CONFIG_DIR),
        "설정 폴더는 {} 여야 한다: {}",
        storage::CONFIG_DIR,
        dir.display()
    );
    assert!(dir.ends_with(".config"), "macOS·Windows 동일한 닷 이름");
    // 이관 전 구버전 워크스페이스와 충돌하지 않게 레거시 이름도 예약을 유지한다.
    assert!(storage::RESERVED_SPACE_DIR.contains(&".config"));
    assert!(storage::RESERVED_SPACE_DIR.contains(&"config"));
}

// 루트의 `config` 를 무조건 설정 디렉토리로 단정하면 안 된다 — RESERVED_SPACE_DIR 도입
// 이전 버전이 만든 워크스페이스에는 "config" 라는 과목 폴더가 있을 수 있다.
#[test]
fn migrate_skips_dir_without_marker() {
    let root = migrate_root("not-config");
    std::fs::create_dir_all(root.join("config/archive")).expect("space-like");
    std::fs::write(root.join("config/archive/note.md"), "내 필기").expect("note");

    storage::migrate_config_at(&root);
    assert!(
        root.join("config/archive/note.md").is_file(),
        "과목 폴더는 건드리지 않는다"
    );
    assert!(
        !root.join(".config").exists(),
        "마커 없는 폴더는 이관 대상이 아니다"
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn migrate_moves_legacy_config() {
    let root = migrate_root("legacy-only");
    std::fs::create_dir_all(root.join("config")).expect("legacy");
    std::fs::write(root.join("config/workspace.json"), "{}").expect("marker");

    storage::migrate_config_at(&root);
    assert!(!root.join("config").exists(), "legacy 는 옮겨졌다");
    assert_eq!(
        std::fs::read_to_string(root.join(".config/workspace.json")).expect("이관된 설정"),
        "{}"
    );

    // 멱등 — 두 번째 호출은 no-op
    storage::migrate_config_at(&root);
    assert!(root.join(".config/workspace.json").exists());
    assert!(!root.join("config").exists());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn migrate_keeps_legacy_when_both_exist() {
    // 둘 다 있으면 어느 쪽이 최신인지 알 수 없다 — 사용자 데이터를 지우지 않는다.
    let root = migrate_root("both");
    std::fs::create_dir_all(root.join("config")).expect("legacy");
    std::fs::create_dir_all(root.join(".config")).expect("target");
    std::fs::write(root.join("config/workspace.json"), "old").expect("old");
    std::fs::write(root.join(".config/workspace.json"), "new").expect("new");

    storage::migrate_config_at(&root);
    assert_eq!(
        std::fs::read_to_string(root.join("config/workspace.json")).expect("legacy 보존"),
        "old"
    );
    assert_eq!(
        std::fs::read_to_string(root.join(".config/workspace.json")).expect("현행 보존"),
        "new"
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn migrate_is_noop_without_legacy() {
    let root = migrate_root("empty");
    storage::migrate_config_at(&root);
    assert!(!root.join(".config").exists(), "빈 워크스페이스는 그대로");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn space_dir_name_keeps_display_name() {
    // 계약 §4 — 폴더명 = 사용자가 화면에서 본 이름 그대로.
    assert_eq!(storage::space_dir_name("운영체제"), "운영체제");
    assert_eq!(storage::space_dir_name("AI 딥러닝"), "AI 딥러닝");
    assert_eq!(storage::space_dir_name("  미적분학  "), "미적분학");
    assert_eq!(storage::space_dir_name("선형   대수"), "선형 대수");
    // 경로 위험 문자만 치환한다
    assert_eq!(storage::space_dir_name("운영/체제"), "운영-체제");
    assert_eq!(storage::space_dir_name("a:b\\c"), "a-b-c");
    // 숨김 폴더가 되지 않는다
    assert_eq!(storage::space_dir_name(".hidden"), "hidden");
    // 비면 untitled
    assert_eq!(storage::space_dir_name("   "), "untitled");
}

#[test]
fn seed_and_read_back() {
    // 임시 HOME 으로 격리 (실제 ~/PiecePool 오염 방지)
    let tmp = std::env::temp_dir().join(format!("pp-test-{}", std::process::id()));
    std::env::set_var("HOME", &tmp);
    let _ = std::fs::remove_dir_all(storage::workspace_root());

    // 1) 시드 → 실제 파일 생성
    seed::ensure_seed().expect("seed");
    assert!(storage::exists(
        &storage::config_dir().join("workspace.json")
    ));
    assert!(storage::exists(
        &storage::space_subdir("운영체제", "wiki").join("process.md")
    ));

    // 2) 공간 목록 — 운영체제·AI 딥러닝 + 데모 3과목(통계학·경제학·생리학)
    let spaces = commands::workspace::list_spaces().expect("spaces");
    assert_eq!(spaces.len(), 5);

    // 2-1) 데모 공간은 과목 2개를 갖고, 그 둘을 잇는 크로스 과목 엣지가 실재한다.
    //      (공간을 넘는 엣지는 계약상 불가 — 크로스 "과목"은 같은 relations.json 안에 산다)
    for (slug, a, b) in [
        (
            "통계학",
            "concept-regression-analysis",
            "concept-linear-regression",
        ),
        ("경제학", "concept-marginal-cost", "concept-derivative"),
        (
            "생리학",
            "concept-diffusion",
            "concept-concentration-gradient",
        ),
    ] {
        let g = commands::graph::get_graph(slug.into()).expect("graph");
        let subj: std::collections::HashSet<_> =
            g.nodes.iter().flat_map(|n| n.subject_ids.clone()).collect();
        assert_eq!(subj.len(), 2, "{slug}: 과목 2개");
        assert!(
            g.relations.iter().any(|r| {
                (r.source_node_id == a && r.target_node_id == b)
                    || (r.source_node_id == b && r.target_node_id == a)
            }),
            "{slug}: 크로스 과목 엣지 없음"
        );
        // relation-types.md §related_to — 최후의 수단. 30% 초과 시 리뷰 대상.
        let loose = g
            .relations
            .iter()
            .filter(|r| r.relation_type == crate::models::RelationType::RelatedTo)
            .count();
        assert!(
            loose * 10 <= g.relations.len() * 3,
            "{slug}: related_to {loose}/{} — 30% 초과",
            g.relations.len()
        );
        // 모든 엣지는 evidence ≥ 1 (graph.rs append_relations 와 같은 불변식)
        assert!(
            g.relations.iter().all(|r| !r.evidence.is_empty()),
            "{slug}: evidence 누락"
        );
    }

    // 3) 위키 5개 (운영체제)
    let wikis = commands::wiki::list_wiki("운영체제".into()).expect("wiki");
    assert_eq!(wikis.len(), 5);
    assert!(wikis.iter().any(|w| w.title == "프로세스"));
    // 모든 시드 위키는 출처(원본 노트)를 갖는다 — "모든 개념은 출처를 갖는다"(vision §6).
    // 없으면 위키의 "관련 소스"가 비고, 노트 하단 복습 바가 안 뜨고,
    // mark_review_needed 가 source_id 를 못 채워 그래프에서 표시를 못 붙인다.
    assert!(
        wikis
            .iter()
            .all(|w| w.source_ids == vec!["source-os-overview".to_string()]),
        "시드 위키에 source_ids 누락"
    );

    // 4) 그래프: 노드 5, 교착상태는 result
    let g = commands::graph::get_graph("운영체제".into()).expect("graph");
    assert_eq!(g.nodes.len(), 5);
    assert_eq!(g.relations.len(), 5);
    let deadlock = g.nodes.iter().find(|n| n.title == "교착상태").unwrap();
    assert_eq!(deadlock.kind, "result");

    // 파생 우선도(§5): 전부 [0,1], 콜드스타트 구조 팩터만으로 허브(프로세스)가 최고점
    assert!(g.nodes.iter().all(|n| (0.0..=1.0).contains(&n.priority)));
    let top = g
        .nodes
        .iter()
        .max_by(|a, b| a.priority.total_cmp(&b.priority))
        .unwrap();
    assert_eq!(top.title, "프로세스", "허브 노드가 최고 우선도");
    assert!(
        deadlock.priority < top.priority,
        "결과 잎 노드는 허브보다 낮은 우선도"
    );

    // 5) 노트 생성 → archive 파일 + 재조회
    let note = commands::notes::create_note(
        "운영체제".into(),
        "테스트 노트".into(),
        "# 본문\n\n내용".into(),
        vec!["subject-os".into()],
    )
    .expect("create");
    let notes = commands::notes::list_notes("운영체제".into()).expect("list");
    assert!(notes.iter().any(|n| n.id == note.id));
    let reread = commands::notes::read_note("운영체제".into(), note.path.clone()).expect("read");
    assert!(reread.markdown.contains("내용"));

    // 6) 같은 제목 재생성 → 충돌 접미사로 별도 파일 (silent overwrite 없음)
    let note2 = commands::notes::create_note(
        "운영체제".into(),
        "테스트 노트".into(),
        "두 번째".into(),
        vec!["subject-os".into()],
    )
    .expect("create2");
    assert_ne!(note.path, note2.path, "충돌 시 파일명이 달라야 한다");
    assert_ne!(note.id, note2.id);

    // 7) append_relations 검증 (같은 HOME 안에서 순차 — 전역 env 경쟁 방지)
    {
        use crate::models::{Evidence, Relation, RelationType};
        let ev = || {
            vec![Evidence {
                source_id: "source-os-overview".into(),
                source_ref_id: None,
                archive_path: Some("archive/x.md".into()),
                original_file_path: None,
                page: None,
                quote: None,
                location: None,
                reason: "테스트".into(),
            }]
        };
        let mk = |rt: RelationType, ev: Vec<Evidence>, strength: f32| Relation {
            id: "rel-test".into(),
            space_id: "space-os".into(),
            source_node_id: "concept-a".into(),
            target_node_id: "concept-b".into(),
            relation_type: rt,
            strength,
            confidence: 0.9,
            explanation: "why".into(),
            evidence: ev,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        };
        let sp = "운영체제".to_string();
        assert!(commands::graph::append_relations(
            sp.clone(),
            vec![mk(RelationType::PartOf, ev(), 0.8)]
        )
        .is_ok());
        assert!(commands::graph::append_relations(
            sp.clone(),
            vec![mk(RelationType::PartOf, vec![], 0.8)]
        )
        .is_err());
        assert!(commands::graph::append_relations(
            sp.clone(),
            vec![mk(RelationType::ReviewNeeded, ev(), 0.8)]
        )
        .is_err());
        assert!(commands::graph::append_relations(
            sp.clone(),
            vec![mk(RelationType::PartOf, ev(), 1.5)]
        )
        .is_err());
    }

    // 7-1) mark_review_needed — append_relations 의 거울상.
    //      계약(relation-types.md §review_needed): LLM 자동 부여 금지, 사용자만 지정.
    {
        use crate::models::RelationType;
        let sp = || "운영체제".to_string();
        let cid = "concept-deadlock";
        let src = "source-os-overview".to_string();
        let q = || vec!["둘이 서로 기다리는 거...".to_string()];

        let review_loops = |space: &str| -> usize {
            commands::graph::get_graph(space.to_string())
                .unwrap()
                .relations
                .iter()
                .filter(|r| {
                    r.relation_type == RelationType::ReviewNeeded
                        && r.source_node_id == r.target_node_id
                })
                .count()
        };

        // 사용자 전용 통로로는 기록된다 (append_relations 가 거부하던 바로 그 타입)
        assert!(commands::graph::mark_review_needed(sp(), cid.into(), src.clone(), q()).is_ok());
        assert_eq!(review_loops("운영체제"), 1, "self-loop 1개 기록");

        // 멱등 — 두 번 눌러도 중복 엣지가 생기지 않는다
        assert!(commands::graph::mark_review_needed(sp(), cid.into(), src.clone(), q()).is_ok());
        assert_eq!(review_loops("운영체제"), 1, "중복 기록 없음");

        // evidence 없이는 거부 — 설명 시도가 곧 근거다
        assert!(
            commands::graph::mark_review_needed(sp(), cid.into(), src.clone(), vec![]).is_err()
        );
        assert!(commands::graph::mark_review_needed(
            sp(),
            cid.into(),
            src.clone(),
            vec!["   ".into()]
        )
        .is_err());

        // source_id 없이는 거부
        assert!(commands::graph::mark_review_needed(sp(), cid.into(), "".into(), q()).is_err());

        // Concept 아닌 노드에는 못 붙인다
        assert!(commands::graph::mark_review_needed(
            sp(),
            "wiki-deadlock".into(),
            src.clone(),
            q()
        )
        .is_err());

        // 거두면 사라진다 (멱등)
        assert!(commands::graph::unmark_review_needed(sp(), cid.into()).is_ok());
        assert_eq!(review_loops("운영체제"), 0, "표시 해제됨");
        assert!(commands::graph::unmark_review_needed(sp(), cid.into()).is_ok());

        // 해제 후 다시 표시할 수 있어야 한다 — 시연 촬영을 반복하려면 왕복이 성립해야 한다.
        assert!(commands::graph::mark_review_needed(sp(), cid.into(), src.clone(), q()).is_ok());
        assert_eq!(review_loops("운영체제"), 1, "재표시됨");
        assert!(commands::graph::unmark_review_needed(sp(), cid.into()).is_ok());

        // 해제는 무관한 관계를 건드리지 않는다 (블록 7 이 넣은 concept-a→concept-b PartOf 는 남아야 한다)
        let rels = commands::graph::get_graph("운영체제".to_string())
            .unwrap()
            .relations;
        assert!(
            rels.iter().any(|r| r.source_node_id == "concept-a"
                && r.target_node_id == "concept-b"
                && r.relation_type == RelationType::PartOf),
            "unmark 이 무관한 관계를 지웠다"
        );
        // (LLM 경로가 review_needed 를 거부하는지는 블록 7 에서 이미 검증한다)
    }

    // 7-2) 대칭 관계 dedup + 무효 self-loop skip.
    //      contrasts/confused_with/related_to 는 (A,B) ≡ (B,A) — relation-types.md §대칭성.
    //      LLM 이 양방향 두 건을 뱉어도 엣지는 하나여야 한다.
    {
        use crate::models::{Evidence, Relation, RelationType};
        let sp = || "운영체제".to_string();
        // 이 블록은 관계를 여럿 넣는다. 뒤 블록들(특히 15번 delete_wiki)이 관계 개수를 세므로
        // 끝에서 relations.json 을 원상복구한다.
        let path = storage::space_subdir("운영체제", "relations").join("relations.json");
        let snapshot: Vec<Relation> = storage::read_json(&path).unwrap();
        let mk = |id: &str, s: &str, t: &str, rt: RelationType| Relation {
            id: id.into(),
            space_id: "space-os".into(),
            source_node_id: s.into(),
            target_node_id: t.into(),
            relation_type: rt,
            strength: 0.8,
            confidence: 0.9,
            explanation: "why".into(),
            evidence: vec![Evidence {
                source_id: "source-os-overview".into(),
                source_ref_id: None,
                archive_path: Some("archive/x.md".into()),
                original_file_path: None,
                page: None,
                quote: None,
                location: None,
                reason: "테스트".into(),
            }],
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        };
        // 디스크의 relations.json 을 그대로 읽는다. get_graph 를 거치면 read_relations 가
        // 같은 dedup 을 다시 걸어서, append_relations 게이트가 망가져도 초록으로 숨는다.
        let raw = || -> Vec<Relation> { storage::read_json(&path).unwrap() };
        // 방향 무시하고 두 노드 사이 특정 타입의 엣지 수를 센다 (디스크 기준)
        let count = |s: &str, t: &str, rt: RelationType| -> usize {
            raw()
                .iter()
                .filter(|r| {
                    r.relation_type == rt
                        && ((r.source_node_id == s && r.target_node_id == t)
                            || (r.source_node_id == t && r.target_node_id == s))
                })
                .count()
        };

        // 대칭 — 양방향으로 넣어도 하나로 접힌다 (교감↔부교감 contrasts 선 2개 버그)
        assert!(commands::graph::append_relations(
            sp(),
            vec![mk(
                "rel-sym-1",
                "concept-symp",
                "concept-parasymp",
                RelationType::Contrasts
            )]
        )
        .is_ok());
        assert!(commands::graph::append_relations(
            sp(),
            vec![mk(
                "rel-sym-2",
                "concept-parasymp",
                "concept-symp",
                RelationType::Contrasts
            )]
        )
        .is_ok());
        assert_eq!(
            count("concept-symp", "concept-parasymp", RelationType::Contrasts),
            1,
            "대칭 관계는 방향이 달라도 하나로 접힌다"
        );

        // 방향성 — part_of 는 접으면 계층축(DAG)이 무너진다. 블록 7 이 concept-a→concept-b 를 이미 넣었다.
        assert!(commands::graph::append_relations(
            sp(),
            vec![mk(
                "rel-dir-1",
                "concept-b",
                "concept-a",
                RelationType::PartOf
            )]
        )
        .is_ok());
        assert_eq!(
            count("concept-a", "concept-b", RelationType::PartOf),
            2,
            "방향성 관계는 역방향도 별개 엣지로 남는다"
        );

        // 무효 self-loop 는 배치를 실패시키지 않고 건너뛴다 (기존에 통과하던 임포트를 깨지 않기 위해)
        let before = raw().len();
        assert!(commands::graph::append_relations(
            sp(),
            vec![
                mk("rel-loop", "concept-t", "concept-t", RelationType::UsedIn),
                mk("rel-ok", "concept-c", "concept-d", RelationType::Causes),
            ]
        )
        .is_ok());
        let after = raw();
        assert!(
            !after.iter().any(|r| r.source_node_id == r.target_node_id
                && r.relation_type != RelationType::ReviewNeeded),
            "review_needed 외 self-loop 는 디스크에 저장되지 않는다"
        );
        assert!(
            after.iter().any(|r| r.id == "rel-ok"),
            "self-loop 하나 때문에 배치 전체가 버려지면 안 된다"
        );
        assert_eq!(after.len(), before + 1, "정상 관계 1개만 늘어난다");

        // 읽기 시점 정리 — 저장 게이트를 우회해 이미 오염된 relations.json 도 접힌다.
        // (지금 사용자 워크스페이스에 쌓여 있는 중복이 앱 재시작만으로 사라지는 근거)
        let mut dirty: Vec<Relation> = storage::read_json(&path).unwrap();
        dirty.push(mk(
            "rel-dirty-1",
            "concept-x",
            "concept-y",
            RelationType::ConfusedWith,
        ));
        dirty.push(mk(
            "rel-dirty-2",
            "concept-y",
            "concept-x",
            RelationType::ConfusedWith,
        ));
        storage::write_json(&path, &dirty).unwrap();
        assert_eq!(
            count("concept-x", "concept-y", RelationType::ConfusedWith),
            2,
            "디스크는 아직 오염 상태"
        );
        let repaired = commands::graph::get_graph(sp())
            .unwrap()
            .relations
            .iter()
            .filter(|r| {
                r.relation_type == RelationType::ConfusedWith
                    && (r.source_node_id == "concept-x" || r.target_node_id == "concept-x")
            })
            .count();
        assert_eq!(
            repaired, 1,
            "저장을 우회해 들어온 대칭 중복도 읽기 시점에 접힌다"
        );

        storage::write_json(&path, &snapshot).unwrap(); // 원상복구
    }

    // 7-3) 대칭 엣지는 한 방향만 저장되므로, 차수만 보는 kind 판정이 상대편을
    //      "결과 개념"(흐린 회색)으로 오분류하면 안 된다. 시드: 교감신경 --contrasts--> 부교감신경.
    {
        let g = commands::graph::get_graph("생리학".into()).expect("graph");
        let para = g
            .nodes
            .iter()
            .find(|n| n.id == "concept-parasympathetic-nerve")
            .expect("부교감신경 노드");
        assert_eq!(
            para.kind, "core",
            "대칭 관계만 가진 개념은 결과 개념이 아니다"
        );
    }

    // 8) PDF 추출: 비-PDF 파일 → pdf_extract 오류, 원본은 보존
    {
        let src_dir = storage::space_subdir("운영체제", "sources/original-files");
        storage::ensure_dir(&src_dir).unwrap();
        let bad = src_dir.join("bad.pdf");
        storage::write_text(&bad, "이건 PDF 가 아닙니다").unwrap();
        let r = commands::workspace::extract_pdf_text("운영체제".into(), "bad.pdf".into());
        assert!(r.is_err(), "비-PDF 는 추출 실패해야 함");
        assert!(
            storage::exists(&bad),
            "추출 실패해도 원본은 삭제하지 않는다"
        );
    }

    // 9) rename_note: 제목만 변경(trim), 파일명 유지, 빈 제목 거부
    let renamed = commands::notes::rename_note(
        "운영체제".into(),
        note2.path.clone(),
        "  이름 변경  ".into(),
    )
    .expect("rename");
    assert_eq!(renamed.title, "이름 변경");
    assert_eq!(renamed.path, note2.path, "파일명은 유지");
    assert!(
        commands::notes::rename_note("운영체제".into(), note2.path.clone(), "   ".into()).is_err()
    );

    // 9-1) update_note_subjects: 실재 과목만 허용, 파일명·본문 유지
    let subj = commands::notes::update_note_subjects(
        "운영체제".into(),
        note2.path.clone(),
        vec!["subject-os".into()],
    )
    .expect("update subjects");
    assert_eq!(subj.subject_ids, vec!["subject-os".to_string()]);
    assert_eq!(subj.path, note2.path, "파일명은 유지");
    assert!(
        commands::notes::update_note_subjects(
            "운영체제".into(),
            note2.path.clone(),
            vec!["subject-없는-과목".into()],
        )
        .is_err(),
        "존재하지 않는 subjectId 는 거부"
    );

    // 10) move_note: os → deeplearning (같은 공간 거부, subject 필터, 원래 파일 삭제, 대상 생성)
    assert!(
        commands::notes::move_note("운영체제".into(), note.path.clone(), "운영체제".into())
            .is_err(),
        "같은 공간 이동 거부"
    );
    let moved =
        commands::notes::move_note("운영체제".into(), note.path.clone(), "AI 딥러닝".into())
            .expect("move");
    assert_eq!(moved.space_id, "space-ai");
    assert_eq!(moved.id, note.id, "id 보존");
    assert_eq!(moved.created_at, note.created_at, "createdAt 보존");
    assert!(
        moved.subject_ids.is_empty(),
        "subject-os 는 deeplearning 에 없음 → 필터링"
    );
    assert_eq!(moved.path, note.path, "충돌 없으면 파일명 유지");
    assert!(!storage::exists(
        &storage::space_subdir("운영체제", "archive").join(&note.path)
    ));
    assert!(storage::exists(
        &storage::space_subdir("AI 딥러닝", "archive").join(&moved.path)
    ));
    let moved_read =
        commands::notes::read_note("AI 딥러닝".into(), moved.path.clone()).expect("read moved");
    assert!(moved_read.markdown.contains("내용"));

    // 11) move 충돌: 대상에 같은 파일명 존재 → -2 접미사
    let dl_note = commands::notes::create_note(
        "AI 딥러닝".into(),
        "테스트 노트".into(),
        "dl".into(),
        vec![],
    )
    .expect("dl create");
    assert_eq!(
        dl_note.path, note2.path,
        "대상에 같은 파일명이 준비돼야 충돌 테스트 성립"
    );
    let moved2 =
        commands::notes::move_note("운영체제".into(), note2.path.clone(), "AI 딥러닝".into())
            .expect("move2");
    assert_ne!(moved2.path, note2.path, "충돌 시 파일명 접미사");
    assert!(storage::exists(
        &storage::space_subdir("AI 딥러닝", "archive").join(&moved2.path)
    ));

    // 12) move: pdf 원본 파일 동반 이동 (+ 원본 충돌 접미사, 원본 부재 시 관용)
    {
        use crate::models::{ArchiveNote, SourceType};
        use crate::storage::frontmatter as fm;
        let src_files = storage::space_subdir("운영체제", "sources/original-files");
        let dst_files = storage::space_subdir("AI 딥러닝", "sources/original-files");
        storage::write_bytes(&src_files.join("lecture.pdf"), b"PDFDATA").unwrap();
        storage::write_bytes(&dst_files.join("lecture.pdf"), b"OTHER").unwrap(); // 대상 충돌 유발
        let mk_pdf = |id: &str, path: &str| ArchiveNote {
            id: id.into(),
            space_id: "space-os".into(),
            source_id: id.into(),
            path: path.into(),
            title: "PDF 노트".into(),
            markdown: "pdf body".into(),
            subject_ids: vec![],
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        };
        let md = fm::archive_to_md(
            &mk_pdf("source-pdf-1", "pdf-note.md"),
            SourceType::Pdf,
            Some("lecture.pdf"),
        );
        storage::write_text(
            &storage::space_subdir("운영체제", "archive").join("pdf-note.md"),
            &md,
        )
        .unwrap();
        let moved_pdf =
            commands::notes::move_note("운영체제".into(), "pdf-note.md".into(), "AI 딥러닝".into())
                .expect("move pdf");
        assert!(
            !storage::exists(&src_files.join("lecture.pdf")),
            "원본은 원래 공간에서 제거"
        );
        assert!(
            storage::exists(&dst_files.join("lecture-2.pdf")),
            "원본 충돌 → lecture-2.pdf"
        );
        let target_md = storage::read_text(
            &storage::space_subdir("AI 딥러닝", "archive").join(&moved_pdf.path),
        )
        .unwrap();
        assert!(
            target_md.contains("originalFilePath: \"lecture-2.pdf\""),
            "frontmatter 경로 갱신"
        );
        assert_eq!(fm::archive_source_type(&target_md), SourceType::Pdf);
        // 원본이 디스크에 없어도 이동은 진행된다
        let md = fm::archive_to_md(
            &mk_pdf("source-pdf-2", "ghost-note.md"),
            SourceType::Pdf,
            Some("ghost.pdf"),
        );
        storage::write_text(
            &storage::space_subdir("운영체제", "archive").join("ghost-note.md"),
            &md,
        )
        .unwrap();
        assert!(
            commands::notes::move_note(
                "운영체제".into(),
                "ghost-note.md".into(),
                "AI 딥러닝".into()
            )
            .is_ok(),
            "원본 부재 시에도 노트 이동은 성공"
        );
    }

    // 13) delete_note: 파일 제거, 없는 파일은 오류
    commands::notes::delete_note("AI 딥러닝".into(), moved2.path.clone()).expect("delete");
    assert!(!storage::exists(
        &storage::space_subdir("AI 딥러닝", "archive").join(&moved2.path)
    ));
    assert!(
        commands::notes::delete_note("AI 딥러닝".into(), moved2.path.clone()).is_err(),
        "없는 파일 → 오류"
    );

    // 14) rename_wiki: 제목 변경, 빈 제목 거부
    let rw = commands::wiki::rename_wiki(
        "운영체제".into(),
        "process.md".into(),
        "프로세스 개념".into(),
    )
    .expect("rename wiki");
    assert_eq!(rw.title, "프로세스 개념");
    assert_eq!(rw.path, "process.md");
    assert!(
        commands::wiki::rename_wiki("운영체제".into(), "process.md".into(), " ".into()).is_err()
    );

    // 15) delete_wiki: 파일 제거 + 해당 개념 관계 정리 (시드 5 + 7에서 추가 1 = 6 → 3 정리)
    let pruned = commands::wiki::delete_wiki("운영체제".into(), "synchronization.md".into())
        .expect("delete wiki");
    assert_eq!(pruned, 3, "synchronization 이 걸린 관계 3개 정리");
    assert!(!storage::exists(
        &storage::space_subdir("운영체제", "wiki").join("synchronization.md")
    ));
    let g2 = commands::graph::get_graph("운영체제".into()).expect("graph2");
    assert_eq!(g2.relations.len(), 3);
    assert!(g2
        .relations
        .iter()
        .all(|r| r.source_node_id != "concept-synchronization"
            && r.target_node_id != "concept-synchronization"));

    // 16) save_source_file: roundtrip + 파일명 정리 + 충돌 접미사 + 잘못된 입력 거부
    let data: Vec<u8> = (0u8..=255).collect();
    let b64 = storage::to_base64(&data);
    let saved = commands::workspace::save_source_file(
        "운영체제".into(),
        "My Lecture.PDF".into(),
        b64.clone(),
    )
    .expect("save src");
    assert_eq!(saved, "my-lecture.pdf", "stem slugify + 확장자 소문자");
    // 한글 파일명은 stem 이 untitled 로 뭉개지지 않고 해시 stem 으로 저장된다
    let ko = commands::workspace::save_source_file(
        "운영체제".into(),
        "확률과 통계 3주차.pdf".into(),
        b64.clone(),
    )
    .expect("save ko src");
    assert!(
        ko.ends_with(".pdf") && !ko.starts_with("untitled"),
        "한글 stem → 해시, untitled 아님: {ko}"
    );
    let back =
        commands::workspace::read_file_bytes("운영체제".into(), saved.clone()).expect("read back");
    assert_eq!(back, b64, "저장/조회 roundtrip");
    let saved2 = commands::workspace::save_source_file(
        "운영체제".into(),
        "My Lecture.PDF".into(),
        b64.clone(),
    )
    .expect("save src 2");
    assert_eq!(saved2, "my-lecture-2.pdf", "충돌 접미사");
    assert!(
        commands::workspace::save_source_file("운영체제".into(), "x.pdf".into(), "abc".into())
            .is_err(),
        "base64 길이 오류 거부"
    );
    assert!(
        commands::workspace::save_source_file("운영체제".into(), "x.pdf".into(), "@@@@".into())
            .is_err(),
        "base64 문자 오류 거부"
    );
    assert!(
        commands::workspace::save_source_file("운영체제".into(), "noext".into(), "TWFu".into())
            .is_err(),
        "확장자 없는 파일명 거부"
    );

    // 17) delete_source: 파일 제거 후 목록에서 사라짐, 없는 파일·경로 탈출 거부
    commands::workspace::delete_source("운영체제".into(), saved2.clone()).expect("delete source");
    let sources = commands::workspace::list_sources("운영체제".into()).expect("list sources");
    assert!(!sources.contains(&saved2), "삭제된 원본은 목록에 없음");
    assert!(
        commands::workspace::delete_source("운영체제".into(), saved2).is_err(),
        "없는 파일 삭제는 오류"
    );
    assert!(
        commands::workspace::delete_source("운영체제".into(), "../evil.pdf".into()).is_err(),
        "경로 탈출 거부"
    );

    // 18) move_source: 공간 간 이동 + 충돌 접미사 + no-op + 없는 파일 거부
    let b64_m = storage::to_base64(&[1u8, 2, 3]);
    let src = commands::workspace::save_source_file(
        "운영체제".into(),
        "lecture.pdf".into(),
        b64_m.clone(),
    )
    .expect("save for move");
    assert_eq!(src, "lecture.pdf");

    // 18-1) 이동: from 에서 사라지고 to 에 생긴다
    let moved = commands::workspace::move_source("운영체제".into(), "통계학".into(), src.clone())
        .expect("move");
    assert_eq!(moved, "lecture.pdf", "충돌 없으면 이름 유지");
    assert!(!storage::exists(
        &storage::space_subdir("운영체제", "sources/original-files").join("lecture.pdf")
    ));
    let back =
        commands::workspace::read_file_bytes("통계학".into(), moved.clone()).expect("read moved");
    assert_eq!(back, b64_m, "이동 후 내용 동일");

    // 18-2) 대상에 동명 파일이 있으면 접미사가 붙고 그 이름이 반환된다
    let src2 = commands::workspace::save_source_file(
        "운영체제".into(),
        "lecture.pdf".into(),
        b64_m.clone(),
    )
    .expect("save for move 2");
    let moved2 =
        commands::workspace::move_source("운영체제".into(), "통계학".into(), src2).expect("move 2");
    assert_eq!(moved2, "lecture-2.pdf", "대상 충돌 접미사");

    // 18-3) from == to 는 no-op — 파일명 그대로, 파일도 그대로
    let same =
        commands::workspace::move_source("통계학".into(), "통계학".into(), "lecture.pdf".into())
            .expect("no-op move");
    assert_eq!(same, "lecture.pdf");
    assert!(storage::exists(
        &storage::space_subdir("통계학", "sources/original-files").join("lecture.pdf")
    ));

    // 18-4) 없는 파일 → 오류
    assert!(
        commands::workspace::move_source("운영체제".into(), "통계학".into(), "nope.pdf".into())
            .is_err(),
        "없는 원본 거부"
    );

    // 18-5) 없는 공간 → 오류
    assert!(
        commands::workspace::move_source(
            "통계학".into(),
            "no-such-space".into(),
            "lecture.pdf".into()
        )
        .is_err(),
        "없는 대상 공간 거부"
    );

    // 19) 계약 §4 — 폴더명 = 표시 이름. Finder 에서 본 이름과 앱 사이드바가 같아야 한다.
    // 19-1) 새 공간: 한글 이름이 해시/untitled 로 뭉개지지 않고 그대로 폴더가 된다.
    let sp = commands::workspace::create_space("미적분학".into()).expect("create");
    assert_eq!(sp.slug, "미적분학");
    assert!(storage::space_dir("미적분학").is_dir(), "한글 폴더가 실재");
    assert!(storage::exists(&storage::space_subdir(
        "미적분학",
        "archive"
    )));

    // 19-2) 이름 충돌 → "이름 2" (해시가 아니라 사람이 읽는 접미사)
    let dup = commands::workspace::create_space("미적분학".into()).expect("dup");
    assert_eq!(dup.slug, "미적분학 2");

    // 19-3) 이름을 바꾸면 디스크 폴더도 따라 옮겨진다 — 안 그러면 Finder 와 어긋난다.
    let renamed =
        commands::workspace::rename_space("미적분학".into(), "해석학".into()).expect("rename");
    assert_eq!(renamed.slug, "해석학");
    assert_eq!(renamed.name, "해석학");
    assert!(storage::space_dir("해석학").is_dir(), "새 폴더로 이동");
    assert!(!storage::space_dir("미적분학").exists(), "옛 폴더는 사라짐");
    assert!(renamed.root_path.ends_with("해석학"), "rootPath 갱신");

    // 19-4) config 는 Workspace 설정 디렉토리라 공간 폴더명으로 쓸 수 없다.
    let cfg = commands::workspace::create_space("config".into()).expect("config space");
    assert_eq!(cfg.slug, "config 2");

    // 19-5) 대소문자만 다른 이름은 케이스 인센시티브 FS(APFS/NTFS)에서 같은 물리 폴더 —
    //       충돌 접미사를 붙여야 한다. 안 그러면 spaces.json 항목 둘이 폴더 하나를 가리키고
    //       delete_space 의 remove_dir_all 이 남의 공간까지 전멸시킨다.
    let os = commands::workspace::create_space("OS".into()).expect("OS space");
    assert_eq!(os.slug, "OS");
    let os_dup = commands::workspace::create_space("os".into()).expect("os dup");
    assert_eq!(os_dup.slug, "os 2", "대소문자만 달라도 충돌 접미사");
    assert!(storage::exists(&storage::space_subdir("os 2", "archive")));
    // 예약 폴더도 대소문자 무시 — "Config" 가 legacy config 를 침범하면 안 된다.
    // (19-4 의 "config 2" 공간과도 대소문자 무시로 충돌 → 다음 접미사 3)
    let cfg2 = commands::workspace::create_space("Config".into()).expect("Config space");
    assert_eq!(cfg2.slug, "Config 3");
    // 대소문자만 바꾸는 rename 은 자기 자신 — 충돌 오류도 접미사도 없이 성공해야 한다.
    let os_renamed =
        commands::workspace::rename_space("OS".into(), "Os".into()).expect("case-only rename");
    assert_eq!(os_renamed.slug, "Os");
    // 접미사 공간을 지워도 원래 공간 폴더는 살아 있다 (폴더 공유 시 여기서 전멸했다).
    commands::workspace::delete_space("os 2".into()).expect("delete dup");
    assert!(
        storage::exists(&storage::space_subdir("Os", "archive")),
        "다른 공간 삭제가 원본 공간 폴더를 지웠다"
    );

    let _ = std::fs::remove_dir_all(storage::workspace_root());
}

#[test]
fn frontmatter_validation() {
    use crate::models::{ArchiveNote, SourceRef, SourceType, WikiPage};
    use crate::storage::frontmatter as fm;
    use std::collections::HashSet;
    let subjects: HashSet<String> = ["subject-os".to_string()].into_iter().collect();
    let sources: HashSet<String> = HashSet::new();
    let mk = |ids: Vec<&str>, created: &str| ArchiveNote {
        id: "source-1".into(),
        space_id: "space-os".into(),
        source_id: "source-1".into(),
        path: "x.md".into(),
        title: "t".into(),
        markdown: "b".into(),
        subject_ids: ids.into_iter().map(String::from).collect(),
        created_at: created.into(),
        updated_at: String::new(),
    };
    // 유효 / 빈 subjectIds 허용 / 알 수 없는 subject 거부 / 잘못된 시각 거부
    assert!(fm::validate_archive(
        &mk(vec!["subject-os"], "2026-07-01T00:00:00Z"),
        SourceType::Text,
        None,
        &subjects
    )
    .is_ok());
    assert!(fm::validate_archive(
        &mk(vec![], "2026-07-01T00:00:00Z"),
        SourceType::Text,
        None,
        &subjects
    )
    .is_ok());
    assert!(fm::validate_archive(
        &mk(vec!["subject-x"], "2026-07-01T00:00:00Z"),
        SourceType::Text,
        None,
        &subjects
    )
    .is_err());
    assert!(fm::validate_archive(
        &mk(vec!["subject-os"], "2026/07/01"),
        SourceType::Text,
        None,
        &subjects
    )
    .is_err());
    // pdf 는 originalFilePath 필수
    assert!(fm::validate_archive(
        &mk(vec!["subject-os"], "2026-07-01T00:00:00Z"),
        SourceType::Pdf,
        None,
        &subjects
    )
    .is_err());
    assert!(fm::validate_archive(
        &mk(vec!["subject-os"], "2026-07-01T00:00:00Z"),
        SourceType::Pdf,
        Some("x.pdf"),
        &subjects
    )
    .is_ok());
    // ISO 8601 offset-aware
    assert!(fm::valid_iso8601("2026-05-28T12:00:00+09:00"));
    assert!(fm::valid_iso8601("2026-06-30T15:48:59Z"));
    assert!(!fm::valid_iso8601("2026-05-28 12:00:00"));

    let mut page = WikiPage {
        id: "wiki-1".into(),
        space_id: "space-os".into(),
        concept_id: "concept-p".into(),
        title: "P".into(),
        path: "p.md".into(),
        subject_ids: vec!["subject-os".into()],
        source_ids: vec![],
        source_refs: vec![],
        markdown: "b".into(),
        created_at: "2026-07-01T00:00:00Z".into(),
        updated_at: "2026-07-01T00:00:00Z".into(),
    };
    assert!(fm::validate_wiki(&page, &subjects, &sources).is_ok());
    // 존재하지 않는 Source 참조 → 거부
    page.source_refs = vec![SourceRef {
        id: "r1".into(),
        source_id: "source-x".into(),
        file: "f.pdf".into(),
        page: None,
        embed: false,
        label: None,
        reason: None,
    }];
    assert!(fm::validate_wiki(&page, &subjects, &sources).is_err());
}

#[test]
fn frontmatter_split_accepts_crlf() {
    use crate::storage::frontmatter as fm;
    // 회귀: 외부 에디터가 CRLF 로 저장하면 split 이 "---\n" 을 못 찾아 frontmatter 없음으로
    // 파싱 → md_to_wiki/archive "missing id" → 목록에서 문서가 무소음 실종됐다.
    let md = "---\r\nid: \"note-crlf\"\r\ntitle: \"CRLF 노트\"\r\nsubjectIds:\r\n  - \"subject-os\"\r\ncreatedAt: \"2026-07-01T00:00:00Z\"\r\n---\r\n\r\n본문\r\n둘째 줄";
    let note = fm::md_to_archive("space-os", "x.md", md).expect("CRLF frontmatter 인식");
    assert_eq!(note.id, "note-crlf");
    assert_eq!(note.title, "CRLF 노트");
    assert_eq!(note.subject_ids, vec!["subject-os".to_string()]);
    assert_eq!(note.markdown, "본문\n둘째 줄", "본문도 LF 로 정규화");
    // LF 파일은 기존 그대로
    let (fm_lf, body_lf) = fm::split("---\nid: \"a\"\n---\n\nbody");
    assert_eq!(fm_lf, "id: \"a\"");
    assert_eq!(body_lf, "\nbody", "빈 줄 하나는 남는다 — 호출부가 trim");
}

#[test]
fn frontmatter_quote_roundtrip() {
    use crate::models::{ArchiveNote, SourceType};
    use crate::storage::frontmatter as fm;
    // 회귀: 쓰기(yq)는 \ 와 " 를 이스케이프하는데 읽기(unquote)가 복원하지 않아
    // 저장 사이클마다 백슬래시가 증식했다 — 쓰기→읽기 왕복은 항등이어야 한다.
    for title in [
        r#"경로 C:\temp 와 "인용" 혼합"#,
        r#"백슬래시로 끝 \"#,
        r#"이중 백슬래시 \\ 가운데"#,
        "평범한 제목",
    ] {
        let note = ArchiveNote {
            id: "note-q".into(),
            space_id: "space-os".into(),
            source_id: "note-q".into(),
            path: "x.md".into(),
            title: title.into(),
            markdown: "본문".into(),
            subject_ids: vec![],
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: String::new(),
        };
        let md = fm::archive_to_md(&note, SourceType::Text, None);
        let back = fm::md_to_archive("space-os", "x.md", &md).expect("1왕복");
        assert_eq!(back.title, title, "1왕복 항등");
        // 2왕복 — 증식 버그는 사이클마다 악화되므로 한 번 더 돈다
        let md2 = fm::archive_to_md(&back, SourceType::Text, None);
        let back2 = fm::md_to_archive("space-os", "x.md", &md2).expect("2왕복");
        assert_eq!(back2.title, title, "2왕복 항등");
    }
    // 손으로 쓴 알 수 없는 이스케이프(\n 등)는 그대로 보존 — 데이터를 지어내지 않는다
    let (fm_text, _) = fm::split("---\ntitle: \"a\\nb\"\n---\n\nx");
    assert_eq!(fm::Fm::parse(&fm_text).scalar("title").unwrap(), "a\\nb");
}

#[test]
fn base64_encode() {
    assert_eq!(storage::to_base64(b"Man"), "TWFu");
    assert_eq!(storage::to_base64(b"Ma"), "TWE=");
    assert_eq!(storage::to_base64(b"M"), "TQ==");
    assert_eq!(storage::to_base64(b""), "");
    assert_eq!(storage::to_base64(b"PiecePool"), "UGllY2VQb29s");
}

#[test]
fn base64_decode() {
    // roundtrip: from_base64(to_base64(x)) == x
    let all: Vec<u8> = (0u8..=255).collect();
    for input in [&b""[..], b"M", b"Ma", b"Man", b"PiecePool", &all] {
        assert_eq!(
            storage::from_base64(&storage::to_base64(input)).unwrap(),
            input
        );
    }
    assert_eq!(storage::from_base64("TWFu").unwrap(), b"Man");
    assert_eq!(storage::from_base64("TQ==").unwrap(), b"M");
    // 거부: 길이 / 패딩 위치 / 마지막 블록 아닌 패딩 / 허용되지 않는 문자
    assert!(storage::from_base64("TWF").is_err());
    assert!(storage::from_base64("TW=u").is_err());
    assert!(storage::from_base64("TQ==TWFu").is_err());
    assert!(storage::from_base64("@@@@").is_err());
}

#[test]
fn safe_join_rejects_traversal() {
    let base = std::path::Path::new("/tmp/pp-base");
    // 정상
    assert!(storage::safe_join(base, "wiki/process.md").is_ok());
    // 거부: 상위 경로
    assert!(storage::safe_join(base, "../config/workspace.json").is_err());
    // 거부: 절대 경로
    assert!(storage::safe_join(base, "/etc/passwd").is_err());
    // 거부: null byte
    assert!(storage::safe_join(base, "a\0b").is_err());
}
