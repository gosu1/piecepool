//! 쿼리바 창 — 메인 앱과 별개로 뜨는 두 번째 창. 계약: workspace-layout.md §3.10, 설계 문서 §1.
//!
//! 창을 여는 것만 여기서 한다. 대화 파일 읽고 쓰기는 아직 없다(설계 §6.3에서 추가).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::storage;

/// 쿼리바 창의 이름표. 화면 코드(main.tsx)가 이 값을 보고 어느 화면을 그릴지 고른다.
/// `capabilities/default.json` 의 windows 목록에도 같은 이름이 있어야 IPC 가 통한다.
pub const QUERY_WINDOW: &str = "query";

/// 목업 기준 창 크기. 좌측 대화 목록 216 + 대화 영역.
const WIDTH: f64 = 860.0;
const HEIGHT: f64 = 720.0;

/// 쿼리바 창을 연다. 이미 떠 있으면 새로 만들지 않고 앞으로 가져온다.
///
/// **async 여야 한다.** 동기 명령은 메인 스레드에서 도는데, 그 스레드가 곧 이벤트 루프다.
/// 거기서 `build()` 를 부르면 WebView2 초기화에 필요한 메시지 펌프가 이 함수 안에 갇혀
/// 창 껍데기만 생기고 웹뷰는 영원히 초기화되지 않는다(= 백지 창 + 앱 멈춤). 실측으로 확인했다.
/// async 로 두면 명령이 비동기 런타임에서 돌고 창 생성만 메인 스레드로 넘어가므로 루프가 안 막힌다.
#[tauri::command]
pub async fn open_query_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(QUERY_WINDOW) {
        // 최소화돼 있으면 되살리고 앞으로. 실패해도 창은 살아 있으므로 에러로 올리지 않는다.
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, QUERY_WINDOW, WebviewUrl::App("index.html".into()))
        .title("PiecePool 쿼리바")
        .inner_size(WIDTH, HEIGHT)
        .min_inner_size(520.0, 480.0)
        .build()
        .map_err(|e| format!("쿼리바 창을 열지 못했습니다: {e}"))?;
    Ok(())
}

/// 메인 창이 닫히면 쿼리바도 같이 닫는다 — 메인 없이 쿼리바만 남는 것은 이상하다.
///
/// 반대 방향은 아무것도 하지 않는다. 쿼리바를 닫아도 메인은 그대로 산다.
/// 마지막 창이 사라지면 Tauri 기본 동작으로 앱이 종료된다.
pub fn close_query_with_main(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if !matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
        return;
    }
    if let Some(q) = window.app_handle().get_webview_window(QUERY_WINDOW) {
        let _ = q.close();
    }
}

// ── 대화 기록 ───────────────────────────────────────────────
//
// `queries/sessions/<id>.json` — 대화 1건 = 파일 1개. 계약: workspace-layout.md §3.10.
// entities.md 계약 대상이 아니다(understanding.json 사이드카와 같은 결).
//
// 대화가 오갈 때마다 파일을 통째로 다시 쓴다. 줄 단위로 덧붙이는 방식(jsonl)은 대화가 아주
// 커질 때 이득이 있는데, 위키에 묻는 대화는 그 정도로 커지지 않는다.

/// 대화 한 마디.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryTurn {
    pub role: String, // "user" | "assistant"
    pub text: String,
    pub at: String, // ISO 8601
    /// 이 답을 만들며 실제로 열어 본 위키 — "폴더/파일명" 꼴. 사용자 말에는 없다.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cited_wiki: Vec<String>,
}

/// 대화 한 건.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuerySession {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub turns: Vec<QueryTurn>,
}

/// 목록에 쓸 요약. 본문(turns)을 안 실어 목록이 커져도 가볍다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuerySessionMeta {
    pub id: String,
    pub title: String,
    pub updated_at: String,
    /// 주고받은 횟수 — 목록 한 줄에 "마지막 시각 · N" 으로 뜬다(설계 §3).
    pub turn_count: usize,
}

fn sessions_dir() -> PathBuf {
    storage::workspace_root()
        .join(storage::QUERIES_DIR)
        .join("sessions")
}

/// 파일명이 곧 id 다. 경로 문자를 막아 `..` 이나 하위 폴더로 새지 않게 한다.
fn session_path(id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.contains(['/', '\\', ':']) || id.contains("..") {
        return Err(format!("잘못된 대화 id: {id}"));
    }
    Ok(sessions_dir().join(format!("{id}.json")))
}

/// 대화 목록 — 최근 순. 깨진 파일은 건너뛴다(대화 하나가 목록 전체를 막으면 안 된다).
#[tauri::command]
pub fn list_query_sessions() -> Result<Vec<QuerySessionMeta>, String> {
    let dir = sessions_dir();
    if !storage::exists(&dir) {
        return Ok(Vec::new());
    }
    let mut out: Vec<QuerySessionMeta> = storage::list_files(&dir, "json")?
        .into_iter()
        .filter_map(|name| {
            let s: QuerySession = storage::read_json(&dir.join(&name)).ok()?;
            Some(QuerySessionMeta {
                id: s.id,
                title: s.title,
                updated_at: s.updated_at,
                turn_count: s.turns.len(),
            })
        })
        .collect();
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[tauri::command]
pub fn read_query_session(id: String) -> Result<QuerySession, String> {
    Ok(storage::read_json(&session_path(&id)?)?)
}

/// 통째로 다시 쓴다. `updatedAt` 은 저장하는 쪽이 정하지 않고 여기서 찍는다 —
/// 목록 정렬의 기준이라 화면마다 다르게 찍히면 순서가 흔들린다.
#[tauri::command]
pub fn save_query_session(session: QuerySession) -> Result<QuerySession, String> {
    let path = session_path(&session.id)?;
    storage::ensure_dir(&sessions_dir())?;
    let saved = QuerySession {
        updated_at: storage::now_iso(),
        ..session
    };
    storage::write_json(&path, &saved)?;
    Ok(saved)
}

/// 없는 대화를 지워도 성공으로 본다 — 두 번 눌러도 오류가 뜨면 안 된다.
#[tauri::command]
pub fn delete_query_session(id: String) -> Result<(), String> {
    let path = session_path(&id)?;
    if storage::exists(&path) {
        storage::remove_file(&path)?;
    }
    Ok(())
}
