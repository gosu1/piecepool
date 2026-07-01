// PiecePool — Tauri backend entry.
// 모듈 경계: docs/20-backend/README.md, architecture.md (작성 예정).
// LLM 오케스트레이션은 Rust가 아니라 TS 공유 어댑터(src/llm/)에 있다 (결정: TS shared adapter).
#![allow(dead_code)] // scaffold 단계 — 모듈 구현되면 제거

pub mod commands;
pub mod error;
pub mod import;
pub mod models;
pub mod pdf;
pub mod seed;
pub mod storage;

#[cfg(test)]
mod tests {
    use crate::{commands, seed, storage};

    #[test]
    fn seed_and_read_back() {
        // 임시 HOME 으로 격리 (실제 ~/PiecePool 오염 방지)
        let tmp = std::env::temp_dir().join(format!("pp-test-{}", std::process::id()));
        std::env::set_var("HOME", &tmp);
        let _ = std::fs::remove_dir_all(storage::workspace_root());

        // 1) 시드 → 실제 파일 생성
        seed::ensure_seed().expect("seed");
        assert!(storage::exists(&storage::config_dir().join("workspace.json")));
        assert!(storage::exists(&storage::space_subdir("operating-systems", "wiki").join("process.md")));

        // 2) 공간 목록
        let spaces = commands::workspace::list_spaces().expect("spaces");
        assert_eq!(spaces.len(), 2);

        // 3) 위키 5개 (운영체제)
        let wikis = commands::wiki::list_wiki("operating-systems".into()).expect("wiki");
        assert_eq!(wikis.len(), 5);
        assert!(wikis.iter().any(|w| w.title == "프로세스"));

        // 4) 그래프: 노드 5, 교착상태는 result
        let g = commands::graph::get_graph("operating-systems".into()).expect("graph");
        assert_eq!(g.nodes.len(), 5);
        assert_eq!(g.relations.len(), 5);
        let deadlock = g.nodes.iter().find(|n| n.title == "교착상태").unwrap();
        assert_eq!(deadlock.kind, "result");

        // 5) 노트 생성 → archive 파일 + 재조회
        let note = commands::notes::create_note(
            "operating-systems".into(),
            "테스트 노트".into(),
            "# 본문\n\n내용".into(),
            vec!["subject-os".into()],
        )
        .expect("create");
        let notes = commands::notes::list_notes("operating-systems".into()).expect("list");
        assert!(notes.iter().any(|n| n.id == note.id));
        let reread = commands::notes::read_note("operating-systems".into(), note.path.clone()).expect("read");
        assert!(reread.markdown.contains("내용"));

        // 6) 같은 제목 재생성 → 충돌 접미사로 별도 파일 (silent overwrite 없음)
        let note2 = commands::notes::create_note(
            "operating-systems".into(),
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
            let sp = "operating-systems".to_string();
            assert!(commands::graph::append_relations(sp.clone(), vec![mk(RelationType::PartOf, ev(), 0.8)]).is_ok());
            assert!(commands::graph::append_relations(sp.clone(), vec![mk(RelationType::PartOf, vec![], 0.8)]).is_err());
            assert!(commands::graph::append_relations(sp.clone(), vec![mk(RelationType::ReviewNeeded, ev(), 0.8)]).is_err());
            assert!(commands::graph::append_relations(sp.clone(), vec![mk(RelationType::PartOf, ev(), 1.5)]).is_err());
        }

        // 8) PDF 추출: 비-PDF 파일 → pdf_extract 오류, 원본은 보존
        {
            let src_dir = storage::space_subdir("operating-systems", "sources/original-files");
            storage::ensure_dir(&src_dir).unwrap();
            let bad = src_dir.join("bad.pdf");
            storage::write_text(&bad, "이건 PDF 가 아닙니다").unwrap();
            let r = commands::workspace::extract_pdf_text("operating-systems".into(), "bad.pdf".into());
            assert!(r.is_err(), "비-PDF 는 추출 실패해야 함");
            assert!(storage::exists(&bad), "추출 실패해도 원본은 삭제하지 않는다");
        }

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
        assert!(fm::validate_archive(&mk(vec!["subject-os"], "2026-07-01T00:00:00Z"), SourceType::Text, None, &subjects).is_ok());
        assert!(fm::validate_archive(&mk(vec![], "2026-07-01T00:00:00Z"), SourceType::Text, None, &subjects).is_ok());
        assert!(fm::validate_archive(&mk(vec!["subject-x"], "2026-07-01T00:00:00Z"), SourceType::Text, None, &subjects).is_err());
        assert!(fm::validate_archive(&mk(vec!["subject-os"], "2026/07/01"), SourceType::Text, None, &subjects).is_err());
        // pdf 는 originalFilePath 필수
        assert!(fm::validate_archive(&mk(vec!["subject-os"], "2026-07-01T00:00:00Z"), SourceType::Pdf, None, &subjects).is_err());
        assert!(fm::validate_archive(&mk(vec!["subject-os"], "2026-07-01T00:00:00Z"), SourceType::Pdf, Some("x.pdf"), &subjects).is_ok());
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
        page.source_refs = vec![SourceRef { id: "r1".into(), source_id: "source-x".into(), file: "f.pdf".into(), page: None, embed: false, label: None, reason: None }];
        assert!(fm::validate_wiki(&page, &subjects, &sources).is_err());
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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::workspace::get_workspace,
            commands::workspace::list_spaces,
            commands::workspace::list_subjects,
            commands::workspace::list_sources,
            commands::workspace::extract_pdf_text,
            commands::workspace::read_file_bytes,
            commands::notes::list_notes,
            commands::notes::list_source_types,
            commands::notes::read_note,
            commands::notes::create_note,
            commands::notes::save_note,
            commands::wiki::list_wiki,
            commands::wiki::read_wiki,
            commands::wiki::save_wiki,
            commands::graph::get_graph,
            commands::graph::append_relations,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
