use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::commands::space_by_slug;
use crate::models::{Relation, RelationType, WikiPage};
use crate::storage::{self, frontmatter};

// 노드 종류(id 접두사로 판별) + 12행 node-compat 매트릭스.
// 규약 참조: docs/10-contracts/relation-types.md (enum 은 models 미러, 매트릭스는 로직).
#[derive(PartialEq, Clone, Copy)]
enum NodeKind {
    Concept,
    WikiPage,
    Source,
}
fn node_kind(id: &str) -> NodeKind {
    if id.starts_with("wiki-") {
        NodeKind::WikiPage
    } else if id.starts_with("source-") {
        NodeKind::Source
    } else {
        NodeKind::Concept
    }
}
fn compat(s: NodeKind, t: NodeKind, rt: RelationType) -> bool {
    use NodeKind::*;
    use RelationType::*;
    match rt {
        ExtractedFrom => matches!(s, Concept | WikiPage) && t == Source,
        ExplainedBy => s == Concept && t == WikiPage,
        Prerequisite | PartOf | UsedIn | Causes | Solves | Contrasts | ConfusedWith => s == Concept && t == Concept,
        RelatedTo => matches!(s, Concept | WikiPage),
        TestedIn => s == Concept && matches!(t, Source | Concept),
        ReviewNeeded => s == Concept && t == Concept, // 자동 경로에서는 별도로 거부됨
    }
}

/// 그래프 노드 DTO. 프론트 ConceptGraph 입력.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,        // concept id (= relation 의 node id)
    pub title: String,
    pub kind: String,      // "core" | "result"
    pub subject_ids: Vec<String>,
    pub path: String,      // wiki 파일명 (node 클릭 → 문서 열기)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub relations: Vec<Relation>,
}

fn read_relations(space: &str) -> Result<Vec<Relation>, String> {
    let path = storage::space_subdir(space, "relations").join("relations.json");
    if !storage::exists(&path) {
        return Ok(vec![]);
    }
    storage::read_json(&path).map_err(|e| e.to_string())
}

/// wiki(노드) + relations(엣지) 를 합쳐 그래프 데이터 반환.
/// node.kind: 들어오는 엣지만 있고 나가는 엣지가 없으면 "result"(결과 개념), 그 외 "core".
#[tauri::command]
pub fn get_graph(space: String) -> Result<GraphData, String> {
    let sp = space_by_slug(&space)?;
    let relations = read_relations(&space)?;

    // 개념별 in/out 차수
    let mut outdeg: HashMap<String, u32> = HashMap::new();
    let mut indeg: HashMap<String, u32> = HashMap::new();
    for r in &relations {
        *outdeg.entry(r.source_node_id.clone()).or_default() += 1;
        *indeg.entry(r.target_node_id.clone()).or_default() += 1;
    }

    // wiki 파일 → 노드
    let dir = storage::space_subdir(&space, "wiki");
    let files = storage::list_files(&dir, ".md").map_err(|e| e.to_string())?;
    let mut nodes = vec![];
    for f in files {
        let md = storage::read_text(&dir.join(&f)).map_err(|e| e.to_string())?;
        let page: WikiPage = match frontmatter::md_to_wiki(&sp.id, &f, &md) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let id = page.concept_id.clone();
        let out = *outdeg.get(&id).unwrap_or(&0);
        let inn = *indeg.get(&id).unwrap_or(&0);
        let kind = if out == 0 && inn > 0 { "result" } else { "core" };
        nodes.push(GraphNode {
            id,
            title: page.title,
            kind: kind.to_string(),
            subject_ids: page.subject_ids,
            path: f,
        });
    }

    Ok(GraphData { nodes, relations })
}

/// LLM 결과 등으로 만들어진 relation 들을 검증 후 relations.json 에 병합(append).
/// 검증: strength/confidence∈[0,1], node-compat 매트릭스, review_needed 자동 거부, evidence≥1, 동일 엣지 dedup.
/// 저장 후 related_to 비율 > 30% 이면 검토 플래그 로그(응답당 50% 경고와 별개 층).
#[tauri::command]
pub fn append_relations(space: String, relations: Vec<Relation>) -> Result<usize, String> {
    let mut existing = read_relations(&space)?;
    let mut seen: HashSet<(String, String, RelationType)> = existing
        .iter()
        .map(|r| (r.source_node_id.clone(), r.target_node_id.clone(), r.relation_type))
        .collect();

    for r in relations {
        let edge = format!("{}→{}", r.source_node_id, r.target_node_id);
        if !(0.0..=1.0).contains(&r.strength) || !(0.0..=1.0).contains(&r.confidence) {
            return Err(format!("[relation_invalid] strength/confidence 는 0~1 이어야 함: {edge}"));
        }
        if r.relation_type == RelationType::ReviewNeeded {
            return Err("[relation_invalid] review_needed 는 사용자만 지정 가능(자동 부여 금지)".into());
        }
        if !compat(node_kind(&r.source_node_id), node_kind(&r.target_node_id), r.relation_type) {
            return Err(format!("[relation_invalid] 노드 호환성 위반: {:?} {edge}", r.relation_type));
        }
        if r.evidence.is_empty() {
            return Err(format!("[relation_invalid] 모든 관계는 evidence ≥ 1: {edge}"));
        }
        let key = (r.source_node_id.clone(), r.target_node_id.clone(), r.relation_type);
        if seen.insert(key) {
            existing.push(r); // 동일 엣지는 중복 저장 안 함
        }
    }

    let total = existing.len();
    let related = existing.iter().filter(|r| r.relation_type == RelationType::RelatedTo).count();
    if total > 0 && related * 100 / total > 30 {
        eprintln!("[review] related_to 비율 {}% (>30%) — 저장됨, 관계 타입 재검토 권장", related * 100 / total);
    }

    let path = storage::space_subdir(&space, "relations").join("relations.json");
    storage::write_json(&path, &existing).map_err(|e| e.to_string())?;
    Ok(existing.len())
}
