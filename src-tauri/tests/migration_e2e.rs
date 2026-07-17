//! 실제 사용자 업그레이드 경로 회귀 테스트:
//! 이미 시드된 레거시 워크스페이스(~/PiecePool/config) → 앱 시작(ensure_seed) → 이관 + 재시드 없음.
//!
//! 단위 테스트(lib.rs)는 `migrate_config_at` 자체만 본다. 여기서 지키는 건 **순서**다 —
//! `ensure_seed` 가 시드 완료 마커(.config/workspace.json)를 찾기 전에 이관해야 한다.
//! 순서가 뒤집히면 이미 쓰던 워크스페이스를 새 것으로 오인해 재시드하고, 사용자의
//! spaces.json 이 데모 데이터로 덮인다. HOME 을 바꾸므로 별도 테스트 바이너리로 격리한다.
use piecepool_lib::{seed, storage};

#[test]
fn legacy_workspace_upgrades_without_reseed() {
    let tmp = std::env::temp_dir().join(format!("pp-e2e-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    std::env::set_var("HOME", &tmp);

    let root = storage::workspace_root();

    // 1) 구버전 워크스페이스를 만든다: 시드 완료된 상태 + 사용자 과목 폴더.
    std::fs::create_dir_all(root.join("config")).unwrap();
    std::fs::write(
        root.join("config/workspace.json"),
        r#"{"id":"ws-piecepool","name":"내 워크스페이스","rootPath":"x","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}"#,
    )
    .unwrap();
    std::fs::write(root.join("config/spaces.json"), "[]").unwrap();
    std::fs::create_dir_all(root.join("운영체제/wiki")).unwrap();
    std::fs::write(root.join("운영체제/wiki/mine.md"), "내 지식").unwrap();

    // 2) 앱 시작.
    seed::ensure_seed().expect("ensure_seed");

    // 3) 레거시는 사라지고 .config 로 이관됐다.
    assert!(
        !root.join("config").exists(),
        "레거시 config 는 남지 않는다"
    );
    assert!(
        root.join(".config/workspace.json").exists(),
        ".config 로 이관"
    );

    // 4) 재시드되지 않았다 — 기존 설정이 그대로다(시드가 덮었으면 name 이 바뀐다).
    let ws = std::fs::read_to_string(root.join(".config/workspace.json")).unwrap();
    assert!(
        ws.contains("내 워크스페이스"),
        "재시드로 덮이면 안 된다: {ws}"
    );
    assert_eq!(
        std::fs::read_to_string(root.join(".config/spaces.json")).unwrap(),
        "[]",
        "빈 spaces.json 이 시드로 덮이면 안 된다"
    );

    // 5) 사용자 지식은 무사하다.
    assert_eq!(
        std::fs::read_to_string(root.join("운영체제/wiki/mine.md")).unwrap(),
        "내 지식"
    );

    let _ = std::fs::remove_dir_all(&tmp);
}
