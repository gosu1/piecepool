//! 실제로 터진 사고의 회귀 테스트.
//!
//! 2026-07-17, 사용자 워크스페이스에서 발생: 신버전이 `config` → `.config` 이관 → 구버전 앱이
//! 실행돼 `.config` 를 모른 채 `config/workspace.json` 을 못 찾음 → **첫 실행으로 오인해 재시드** →
//! 사용자 공간이 데모 데이터로 덮이고 `config/` 가 되살아남. 그 뒤 신버전은 "둘 다 존재"로
//! 이관을 건너뛰어 피해가 무증상으로 굳었다.
//!
//! 여기서 지키는 계약: **이관이 성사되지 않았는데 레거시에 시드 마커가 있으면 절대 시드하지 않는다.**
//! 시드 대신 오류를 올려 사용자가 상황을 알고 손쓰게 한다(데이터 보존 > 편의).
//! HOME 을 바꾸므로 별도 테스트 바이너리로 격리한다.
use piecepool_lib::{seed, storage};

#[test]
fn never_reseeds_when_legacy_marker_survives() {
    let tmp = std::env::temp_dir().join(format!("pp-reseed-guard-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    std::env::set_var("HOME", &tmp);

    let root = storage::workspace_root();

    // 사고 상태 재현: 이관이 성사되지 않아 legacy·신규 설정 폴더가 공존한다.
    // (rename 실패, 또는 구버전 앱이 재시드해 config/ 를 되살린 뒤의 모습)
    std::fs::create_dir_all(root.join("config")).unwrap();
    std::fs::create_dir_all(root.join(".config")).unwrap();
    std::fs::write(
        root.join("config/workspace.json"),
        r#"{"name":"내 워크스페이스"}"#,
    )
    .unwrap();
    std::fs::write(root.join("config/spaces.json"), r#"[{"name":"자료구조"}]"#).unwrap();

    // 사용자 지식 — 재시드가 덮으면 안 되는 것.
    std::fs::create_dir_all(root.join("운영체제/wiki")).unwrap();
    std::fs::write(root.join("운영체제/wiki/process.md"), "내가 쓴 위키").unwrap();
    std::fs::create_dir_all(root.join("운영체제/relations")).unwrap();
    std::fs::write(
        root.join("운영체제/relations/relations.json"),
        r#"["내 관계"]"#,
    )
    .unwrap();

    // 앱 시작 — `.config/workspace.json` 이 없으니 옛 코드라면 "첫 실행"으로 보고 재시드했다.
    let r = seed::ensure_seed();

    assert!(
        r.is_err(),
        "레거시 마커가 살아 있으면 시드하지 않고 오류를 올려야 한다"
    );

    // 사용자 데이터가 전부 그대로다 — 이것이 이 테스트의 존재 이유다.
    assert_eq!(
        std::fs::read_to_string(root.join("운영체제/wiki/process.md")).unwrap(),
        "내가 쓴 위키",
        "재시드가 사용자 위키를 덮었다"
    );
    assert_eq!(
        std::fs::read_to_string(root.join("운영체제/relations/relations.json")).unwrap(),
        r#"["내 관계"]"#,
        "재시드가 사용자 관계를 덮었다"
    );
    assert_eq!(
        std::fs::read_to_string(root.join("config/spaces.json")).unwrap(),
        r#"[{"name":"자료구조"}]"#,
        "레거시 설정을 건드리면 안 된다"
    );

    let _ = std::fs::remove_dir_all(&tmp);
}
