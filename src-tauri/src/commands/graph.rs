//! 그래프 IPC 표면 — 검증·조립 로직은 crate::graph 도메인 모듈에 있다.

use crate::commands::space_by_slug;
use crate::graph::{self, GraphData};
use crate::models::Relation;

/// wiki(노드) + relations(엣지) 를 합쳐 그래프 데이터 반환.
#[tauri::command]
pub fn get_graph(space: String) -> Result<GraphData, String> {
    let sp = space_by_slug(&space)?;
    Ok(graph::load_graph(&space, &sp.id)?)
}

/// LLM 결과 등으로 만들어진 relation 들을 검증 후 relations.json 에 병합(append).
#[tauri::command]
pub fn append_relations(space: String, relations: Vec<Relation>) -> Result<usize, String> {
    Ok(graph::append_validated(&space, relations)?)
}

/// 사용자가 "아직 모르겠어요" 를 선언했을 때 review_needed self-loop 를 기록한다(사용자 전용).
#[tauri::command]
pub fn mark_review_needed(
    space: String,
    concept_id: String,
    source_id: String,
    quotes: Vec<String>,
) -> Result<usize, String> {
    let space_id = space_by_slug(&space)?.id;
    Ok(graph::mark_review(
        &space, space_id, concept_id, source_id, quotes,
    )?)
}

/// 사용자가 복습 표시를 거둔다(= 이제 설명할 수 있다). 없으면 멱등하게 no-op.
#[tauri::command]
pub fn unmark_review_needed(space: String, concept_id: String) -> Result<usize, String> {
    Ok(graph::unmark_review(&space, &concept_id)?)
}
