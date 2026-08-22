//! 쿼리바 창 — 메인 앱과 별개로 뜨는 두 번째 창. 계약: workspace-layout.md §3.10, 설계 문서 §1.
//!
//! 창을 여는 것만 여기서 한다. 대화 파일 읽고 쓰기는 아직 없다(설계 §6.3에서 추가).

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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
