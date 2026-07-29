//! 이해 상태 사이드카 — `<space>/config/understanding.json` (conceptId → 항목).
//! 이해지표(그래프 안개)의 파생 상태 저장소다. entities.md 계약 대상이 아니다
//! (GraphNode.priority 와 같은 파생값 전례 — 계약 변경 아님).
//! 설계: docs/superpowers/specs/2026-07-26-facet-coverage-design.md.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::commands::space_by_slug;
use crate::storage;

/// 사이드카 항목. 상태 없음(맵에 키 없음) = hazy(안개)가 기본값이다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnderstandingEntry {
    pub state: String,      // "hazy" | "clear"
    pub updated_at: String, // ISO 8601
}

fn sidecar_path(space: &str) -> PathBuf {
    storage::space_subdir(space, "config").join("understanding.json")
}

/// 사이드카 읽기 — 없거나 깨졌으면 빈 맵. *지표가 거짓으로 맑아지는 것이 최악*이므로
/// 손상 시에도 전부 안개(fail-closed)로 떨어진다.
fn read_map(space: &str) -> HashMap<String, UnderstandingEntry> {
    let p = sidecar_path(space);
    if !storage::exists(&p) {
        return HashMap::new();
    }
    storage::read_json(&p).unwrap_or_default()
}

#[tauri::command]
pub fn get_understanding(space: String) -> Result<HashMap<String, UnderstandingEntry>, String> {
    space_by_slug(&space)?;
    Ok(read_map(&space))
}

/// 상태 기록(read-modify-write) 후 갱신된 맵 전체를 돌려준다 — 프론트 메모리 사본 교체용.
#[tauri::command]
pub fn set_understanding(
    space: String,
    concept_id: String,
    state: String,
) -> Result<HashMap<String, UnderstandingEntry>, String> {
    space_by_slug(&space)?;
    if state != "hazy" && state != "clear" {
        return Err(format!("unknown understanding state: {state}"));
    }
    if !concept_id.starts_with("concept-") {
        return Err(format!("이해 상태는 Concept 에만 붙는다: {concept_id}"));
    }
    let mut map = read_map(&space);
    map.insert(
        concept_id,
        UnderstandingEntry {
            state,
            updated_at: storage::now_iso(),
        },
    );
    storage::write_json(&sidecar_path(&space), &map)?;
    Ok(map)
}
