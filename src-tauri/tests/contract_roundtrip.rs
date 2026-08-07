//! 계약 예시 왕복 테스트 — 계약 문서 자체가 픽스처다 (PIE-5).
//!
//! docs/10-contracts/markdown-frontmatter.md 의 §2.2(ArchiveNote)·§3.3(WikiPage)
//! 예시 블록을 include_str! 로 읽어, 우리 코덱이 그 예시를 손실 없이
//! 읽기 → 쓰기 → 다시 읽기 할 수 있는지 검사한다.
//!
//! 이 구조의 효과:
//! - 계약 예시에 필드가 추가되면 (예: 2026-06-25 의 tags) 코드가 안 따라간 순간
//!   여기서 빨간불이 난다. Source.tags 가 40일 넘게 조용히 방치된 일의 재발 방지.
//! - 계약 문서를 옮기거나 지우면 include_str! 이 컴파일 에러를 낸다 —
//!   계약이 "그냥 문서" 가 아니라 빌드 의존물이 된다.
//!
//! 주의: 바이트 단위 비교가 아니라 의미 단위 비교다. 계약 예시는 맨몸 스칼라를
//! 쓰고 우리 writer 는 외부 에디터 호환을 위해 전부 큰따옴표를 치므로(§1),
//! 원문 == 재직렬화 문자열 비교는 성립하지 않는다. 대신
//! (1) 예시의 모든 필드가 파싱에서 살아남고 (2) 쓰기 → 읽기가 항등임을 본다.

use piecepool_lib::models::SourceType;
use piecepool_lib::storage::frontmatter as fm;

const CONTRACT: &str = include_str!("../../docs/10-contracts/markdown-frontmatter.md");

/// 계약 문서에서 `heading` 이후 첫 ```md 코드블록을 꺼낸다.
fn example_block(heading: &str) -> String {
    let at = CONTRACT.find(heading).unwrap_or_else(|| {
        panic!("계약 문서에 '{heading}' 절이 없다 — 문서 구조가 바뀌었으면 테스트를 갱신할 것")
    });
    let rest = &CONTRACT[at..];
    let open = rest.find("```md").expect("예시 ```md 블록이 없다");
    let body = &rest[open + 5..];
    let close = body.find("```").expect("예시 블록이 닫히지 않았다");
    body[..close].trim_start_matches(['\r', '\n']).to_string()
}

#[test]
fn archive_contract_example_roundtrips() {
    let example = example_block("### 2.2 예시");

    // ① 계약 예시의 모든 필드가 파싱에서 살아남는다
    let note = fm::md_to_archive("space-ai", "x.md", &example).expect("계약 예시 파싱 실패");
    assert_eq!(note.id, "source-transformer-week3");
    assert_eq!(note.title, "Transformer Week 3 Lecture");
    assert_eq!(note.subject_ids, vec!["subject-ai".to_string()]);
    assert_eq!(
        note.tags.as_deref(),
        Some(&["딥러닝".to_string()][..]),
        "계약 §2.1 의 tags 필드가 파싱에서 사라졌다"
    );
    assert_eq!(note.source_id, "source-transformer-week3");
    assert_eq!(note.created_at, "2026-05-28T12:00:00+09:00");
    assert!(note.markdown.contains("# Transformer Week 3 Lecture"));
    assert!(matches!(fm::archive_source_type(&example), SourceType::Pdf));
    assert_eq!(
        fm::archive_original_file_path(&example).as_deref(),
        Some("deeplearning/sources/original-files/transformer-week3.pdf")
    );

    // ② 쓰기 → 읽기 항등 — 어떤 필드도 왕복에서 증발하지 않는다
    let written = fm::archive_to_md(
        &note,
        SourceType::Pdf,
        Some("deeplearning/sources/original-files/transformer-week3.pdf"),
    );
    let back = fm::md_to_archive("space-ai", "x.md", &written).expect("재직렬화 결과 파싱 실패");
    assert_eq!(back.id, note.id);
    assert_eq!(back.title, note.title);
    assert_eq!(back.subject_ids, note.subject_ids);
    assert_eq!(back.tags, note.tags, "tags 가 쓰기 왕복에서 사라졌다");
    assert_eq!(back.source_id, note.source_id);
    assert_eq!(back.created_at, note.created_at);
    assert_eq!(back.markdown, note.markdown);
}

#[test]
fn wiki_contract_example_roundtrips() {
    let example = example_block("### 3.3 예시");

    // ① 계약 예시의 모든 필드가 파싱에서 살아남는다
    let page = fm::md_to_wiki("space-ai", "x.md", &example).expect("계약 예시 파싱 실패");
    assert_eq!(page.id, "wiki-self-attention");
    assert_eq!(page.concept_id, "concept-self-attention");
    assert_eq!(page.title, "Self-Attention");
    assert_eq!(page.subject_ids, vec!["subject-ai".to_string()]);
    assert_eq!(
        page.tags.as_deref(),
        Some(&["딥러닝".to_string()][..]),
        "계약 §3.1 의 tags 필드가 파싱에서 사라졌다"
    );
    assert_eq!(
        page.source_ids,
        vec!["source-transformer-week3".to_string()]
    );
    assert_eq!(page.created_at, "2026-05-28T12:30:00+09:00");
    assert_eq!(page.updated_at, "2026-05-28T12:30:00+09:00");
    assert!(page.markdown.contains("![[transformer-week3.pdf#page=12]]"));

    assert_eq!(
        page.source_refs.len(),
        1,
        "계약 §3.2 sourceRefs 가 파싱되지 않았다"
    );
    let r = &page.source_refs[0];
    assert_eq!(r.id, "source-ref-transformer-week3-page-12");
    assert_eq!(r.source_id, "source-transformer-week3");
    assert_eq!(r.file, "transformer-week3.pdf");
    assert_eq!(r.page, Some(12));
    assert!(r.embed);
    assert_eq!(
        r.reason.as_deref(),
        Some("Self-Attention 수식과 설명이 있는 핵심 근거 page")
    );

    // ② 쓰기 → 읽기 항등
    let written = fm::wiki_to_md(&page);
    let back = fm::md_to_wiki("space-ai", "x.md", &written).expect("재직렬화 결과 파싱 실패");
    assert_eq!(back.id, page.id);
    assert_eq!(back.concept_id, page.concept_id);
    assert_eq!(back.title, page.title);
    assert_eq!(back.subject_ids, page.subject_ids);
    assert_eq!(back.tags, page.tags, "tags 가 쓰기 왕복에서 사라졌다");
    assert_eq!(back.source_ids, page.source_ids);
    assert_eq!(back.source_refs.len(), page.source_refs.len());
    assert_eq!(back.source_refs[0].page, page.source_refs[0].page);
    assert_eq!(back.source_refs[0].reason, page.source_refs[0].reason);
    assert_eq!(back.created_at, page.created_at);
    assert_eq!(back.updated_at, page.updated_at);
    assert_eq!(back.markdown, page.markdown);
}
