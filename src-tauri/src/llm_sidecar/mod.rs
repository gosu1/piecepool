//! 로컬 추론 서버(llama.cpp `llama-server`) 프로세스 lifecycle.
//! 이건 LLM 오케스트레이션이 아니다 — 그건 TS(src/llm/). 여기는 sidecar spawn/health/종료만 책임.
//! 바이너리/GGUF 전달(자동 다운로드)은 후속 슬라이스. 지금은 경로를 env로 주입받는다.
//! SSOT: docs/30-llm/provider-config.md §2(env), §3.1(local backend).

use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::error::AppError;

const HOST: &str = "127.0.0.1"; // 로컬 추론 — loopback 고정
const DEFAULT_PORT: u16 = 8080; // llama-server 기본 (provider-config.md §2)
const READY_TIMEOUT: Duration = Duration::from_secs(120); // 최초 모델 로드 여유
const POLL_INTERVAL: Duration = Duration::from_millis(500);

/// spawn 입력. 경로 둘 다 있어야 sidecar 활성 — 없으면 Disabled.
#[derive(Debug, Clone)]
pub struct SidecarConfig {
    binary: String, // llama-server 실행 파일 (PIECEPOOL_LOCAL_LLM_BIN)
    model: String,  // GGUF 경로 (PIECEPOOL_LOCAL_LLM_MODEL_PATH)
    port: u16,
}

impl SidecarConfig {
    fn from_env() -> Option<Self> {
        let binary = std::env::var("PIECEPOOL_LOCAL_LLM_BIN").ok()?;
        let model = std::env::var("PIECEPOOL_LOCAL_LLM_MODEL_PATH").ok()?;
        let port = std::env::var("PIECEPOOL_LOCAL_LLM_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(DEFAULT_PORT);
        Some(Self { binary, model, port })
    }

    fn addr(&self) -> String {
        format!("{HOST}:{}", self.port)
    }

    fn endpoint(&self) -> String {
        format!("http://{HOST}:{}", self.port)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SidecarStatus {
    Disabled, // 경로 미설정 — 수동/후속 다운로드 전까지 비활성
    Starting,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarState {
    pub status: SidecarStatus,
    pub endpoint: Option<String>,
    pub message: Option<String>,
}

/// sidecar 프로세스 핸들 + 상태. Tauri managed state로 공유.
pub struct SidecarManager {
    child: Mutex<Option<Child>>,
    state: Mutex<SidecarState>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            state: Mutex::new(SidecarState {
                status: SidecarStatus::Disabled,
                endpoint: None,
                message: None,
            }),
        }
    }

    pub fn snapshot(&self) -> SidecarState {
        self.lock_state().clone()
    }

    /// 앱 종료 시 호출 — 자식 프로세스 정리. Child는 drop으로 죽지 않으므로 명시 kill.
    pub fn shutdown(&self) {
        if let Some(mut child) = self.lock_child().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn set_state(&self, status: SidecarStatus, endpoint: Option<String>, message: Option<String>) {
        *self.lock_state() = SidecarState {
            status,
            endpoint,
            message,
        };
    }

    // poison 시 패닉 대신 inner 회수 (unwrap 금지 규칙).
    fn lock_state(&self) -> std::sync::MutexGuard<'_, SidecarState> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn lock_child(&self) -> std::sync::MutexGuard<'_, Option<Child>> {
        self.child.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 앱 시작 시 호출. env 경로 있으면 백그라운드 thread에서 spawn + ready 대기.
/// 경로 없으면 Disabled 유지 (조용히 no-op).
pub fn launch(manager: Arc<SidecarManager>) {
    let Some(config) = SidecarConfig::from_env() else {
        return;
    };
    thread::spawn(move || {
        let child = match spawn(&config) {
            Ok(c) => c,
            Err(e) => {
                manager.set_state(SidecarStatus::Failed, Some(config.endpoint()), Some(e.message));
                return;
            }
        };
        *manager.lock_child() = Some(child);
        manager.set_state(SidecarStatus::Starting, Some(config.endpoint()), None);

        match wait_ready(&config) {
            Ok(()) => manager.set_state(SidecarStatus::Ready, Some(config.endpoint()), None),
            Err(e) => {
                manager.set_state(SidecarStatus::Failed, Some(config.endpoint()), Some(e.message))
            }
        }
    });
}

fn spawn(config: &SidecarConfig) -> Result<Child, AppError> {
    Command::new(&config.binary)
        .arg("--host")
        .arg(HOST)
        .arg("--port")
        .arg(config.port.to_string())
        .arg("--model")
        .arg(&config.model)
        .spawn()
        .map_err(|e| AppError {
            kind: "llm_sidecar_spawn".into(),
            message: format!("llama-server 실행 실패 ({}): {e}", config.binary),
        })
}

// ready 판정 = 포트 accept. 전체 /health HTTP 검증은 호출측 TS LocalProvider 책임 (provider-config.md §2.1).
fn wait_ready(config: &SidecarConfig) -> Result<(), AppError> {
    let addr = config.addr();
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if TcpStream::connect(&addr).is_ok() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(AppError {
                kind: "llm_sidecar_timeout".into(),
                message: format!("llama-server {addr} ready 대기 timeout"),
            });
        }
        thread::sleep(POLL_INTERVAL);
    }
}
