use crate::models::Workspace;

/// IPC 왕복 검증용 stub. 실제 구현 시 <workspaceRoot>/config/workspace.json 읽기.
/// 경로 해석: docs/10-contracts/workspace-layout.md, 저장 계층: storage/ (storage-io.md 작성 예정).
#[tauri::command]
pub fn get_workspace() -> Workspace {
    Workspace {
        id: "ws-demo".into(),
        name: "PiecePool Workspace".into(),
        root_path: String::new(),
        created_at: "1970-01-01T00:00:00Z".into(),
        updated_at: "1970-01-01T00:00:00Z".into(),
    }
}
