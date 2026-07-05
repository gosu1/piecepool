// PiecePool — Tauri backend entry.
// 모듈 경계: docs/20-backend/README.md, architecture.md (작성 예정).
// LLM 오케스트레이션은 Rust가 아니라 TS 공유 어댑터(src/llm/)에 있다 (결정: TS shared adapter).

pub mod commands;
pub mod error;
pub mod import;
pub mod models;
pub mod pdf;
pub mod priority;
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
        assert!(storage::exists(
            &storage::config_dir().join("workspace.json")
        ));
        assert!(storage::exists(
            &storage::space_subdir("operating-systems", "wiki").join("process.md")
        ));

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
        let reread = commands::notes::read_note("operating-systems".into(), note.path.clone())
            .expect("read");
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

        // 8) PDF 추출: 비-PDF 파일 → pdf_extract 오류, 원본은 보존
        {
            let src_dir = storage::space_subdir("operating-systems", "sources/original-files");
            storage::ensure_dir(&src_dir).unwrap();
            let bad = src_dir.join("bad.pdf");
            storage::write_text(&bad, "이건 PDF 가 아닙니다").unwrap();
            let r =
                commands::workspace::extract_pdf_text("operating-systems".into(), "bad.pdf".into());
            assert!(r.is_err(), "비-PDF 는 추출 실패해야 함");
            assert!(
                storage::exists(&bad),
                "추출 실패해도 원본은 삭제하지 않는다"
            );
        }

        // 9) rename_note: 제목만 변경(trim), 파일명 유지, 빈 제목 거부
        let renamed = commands::notes::rename_note(
            "operating-systems".into(),
            note2.path.clone(),
            "  이름 변경  ".into(),
        )
        .expect("rename");
        assert_eq!(renamed.title, "이름 변경");
        assert_eq!(renamed.path, note2.path, "파일명은 유지");
        assert!(commands::notes::rename_note(
            "operating-systems".into(),
            note2.path.clone(),
            "   ".into()
        )
        .is_err());

        // 10) move_note: os → deeplearning (같은 공간 거부, subject 필터, 원래 파일 삭제, 대상 생성)
        assert!(
            commands::notes::move_note(
                "operating-systems".into(),
                note.path.clone(),
                "operating-systems".into()
            )
            .is_err(),
            "같은 공간 이동 거부"
        );
        let moved = commands::notes::move_note(
            "operating-systems".into(),
            note.path.clone(),
            "deeplearning".into(),
        )
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
            &storage::space_subdir("operating-systems", "archive").join(&note.path)
        ));
        assert!(storage::exists(
            &storage::space_subdir("deeplearning", "archive").join(&moved.path)
        ));
        let moved_read = commands::notes::read_note("deeplearning".into(), moved.path.clone())
            .expect("read moved");
        assert!(moved_read.markdown.contains("내용"));

        // 11) move 충돌: 대상에 같은 파일명 존재 → -2 접미사
        let dl_note = commands::notes::create_note(
            "deeplearning".into(),
            "테스트 노트".into(),
            "dl".into(),
            vec![],
        )
        .expect("dl create");
        assert_eq!(
            dl_note.path, note2.path,
            "대상에 같은 파일명이 준비돼야 충돌 테스트 성립"
        );
        let moved2 = commands::notes::move_note(
            "operating-systems".into(),
            note2.path.clone(),
            "deeplearning".into(),
        )
        .expect("move2");
        assert_ne!(moved2.path, note2.path, "충돌 시 파일명 접미사");
        assert!(storage::exists(
            &storage::space_subdir("deeplearning", "archive").join(&moved2.path)
        ));

        // 12) move: pdf 원본 파일 동반 이동 (+ 원본 충돌 접미사, 원본 부재 시 관용)
        {
            use crate::models::{ArchiveNote, SourceType};
            use crate::storage::frontmatter as fm;
            let src_files = storage::space_subdir("operating-systems", "sources/original-files");
            let dst_files = storage::space_subdir("deeplearning", "sources/original-files");
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
                &storage::space_subdir("operating-systems", "archive").join("pdf-note.md"),
                &md,
            )
            .unwrap();
            let moved_pdf = commands::notes::move_note(
                "operating-systems".into(),
                "pdf-note.md".into(),
                "deeplearning".into(),
            )
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
                &storage::space_subdir("deeplearning", "archive").join(&moved_pdf.path),
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
                &storage::space_subdir("operating-systems", "archive").join("ghost-note.md"),
                &md,
            )
            .unwrap();
            assert!(
                commands::notes::move_note(
                    "operating-systems".into(),
                    "ghost-note.md".into(),
                    "deeplearning".into()
                )
                .is_ok(),
                "원본 부재 시에도 노트 이동은 성공"
            );
        }

        // 13) delete_note: 파일 제거, 없는 파일은 오류
        commands::notes::delete_note("deeplearning".into(), moved2.path.clone()).expect("delete");
        assert!(!storage::exists(
            &storage::space_subdir("deeplearning", "archive").join(&moved2.path)
        ));
        assert!(
            commands::notes::delete_note("deeplearning".into(), moved2.path.clone()).is_err(),
            "없는 파일 → 오류"
        );

        // 14) rename_wiki: 제목 변경, 빈 제목 거부
        let rw = commands::wiki::rename_wiki(
            "operating-systems".into(),
            "process.md".into(),
            "프로세스 개념".into(),
        )
        .expect("rename wiki");
        assert_eq!(rw.title, "프로세스 개념");
        assert_eq!(rw.path, "process.md");
        assert!(commands::wiki::rename_wiki(
            "operating-systems".into(),
            "process.md".into(),
            " ".into()
        )
        .is_err());

        // 15) delete_wiki: 파일 제거 + 해당 개념 관계 정리 (시드 5 + 7에서 추가 1 = 6 → 3 정리)
        let pruned =
            commands::wiki::delete_wiki("operating-systems".into(), "synchronization.md".into())
                .expect("delete wiki");
        assert_eq!(pruned, 3, "synchronization 이 걸린 관계 3개 정리");
        assert!(!storage::exists(
            &storage::space_subdir("operating-systems", "wiki").join("synchronization.md")
        ));
        let g2 = commands::graph::get_graph("operating-systems".into()).expect("graph2");
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
            "operating-systems".into(),
            "My Lecture.PDF".into(),
            b64.clone(),
        )
        .expect("save src");
        assert_eq!(saved, "my-lecture.pdf", "stem slugify + 확장자 소문자");
        let back = commands::workspace::read_file_bytes("operating-systems".into(), saved.clone())
            .expect("read back");
        assert_eq!(back, b64, "저장/조회 roundtrip");
        let saved2 = commands::workspace::save_source_file(
            "operating-systems".into(),
            "My Lecture.PDF".into(),
            b64.clone(),
        )
        .expect("save src 2");
        assert_eq!(saved2, "my-lecture-2.pdf", "충돌 접미사");
        assert!(
            commands::workspace::save_source_file(
                "operating-systems".into(),
                "x.pdf".into(),
                "abc".into()
            )
            .is_err(),
            "base64 길이 오류 거부"
        );
        assert!(
            commands::workspace::save_source_file(
                "operating-systems".into(),
                "x.pdf".into(),
                "@@@@".into()
            )
            .is_err(),
            "base64 문자 오류 거부"
        );
        assert!(
            commands::workspace::save_source_file(
                "operating-systems".into(),
                "noext".into(),
                "TWFu".into()
            )
            .is_err(),
            "확장자 없는 파일명 거부"
        );

        // 17) delete_source: 파일 제거 후 목록에서 사라짐, 없는 파일·경로 탈출 거부
        commands::workspace::delete_source("operating-systems".into(), saved2.clone())
            .expect("delete source");
        let sources =
            commands::workspace::list_sources("operating-systems".into()).expect("list sources");
        assert!(!sources.contains(&saved2), "삭제된 원본은 목록에 없음");
        assert!(
            commands::workspace::delete_source("operating-systems".into(), saved2).is_err(),
            "없는 파일 삭제는 오류"
        );
        assert!(
            commands::workspace::delete_source("operating-systems".into(), "../evil.pdf".into())
                .is_err(),
            "경로 탈출 거부"
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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            commands::workspace::get_workspace,
            commands::workspace::list_spaces,
            commands::workspace::create_space,
            commands::workspace::list_subjects,
            commands::workspace::list_sources,
            commands::workspace::extract_pdf_text,
            commands::workspace::read_file_bytes,
            commands::workspace::save_source_file,
            commands::workspace::delete_source,
            commands::notes::list_notes,
            commands::notes::list_source_types,
            commands::notes::read_note,
            commands::notes::create_note,
            commands::notes::save_note,
            commands::notes::move_note,
            commands::notes::delete_note,
            commands::notes::rename_note,
            commands::wiki::list_wiki,
            commands::wiki::read_wiki,
            commands::wiki::save_wiki,
            commands::wiki::delete_wiki,
            commands::wiki::rename_wiki,
            commands::graph::get_graph,
            commands::graph::append_relations,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
