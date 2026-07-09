use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::commands::space_by_slug;
use crate::models::{Relation, RelationType, WikiPage};
use crate::priority::{compute_priorities, RawFactors};
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
        Prerequisite | PartOf | UsedIn | Causes | Solves | Contrasts | ConfusedWith => {
            s == Concept && t == Concept
        }
        RelatedTo => matches!(s, Concept | WikiPage),
        TestedIn => s == Concept && matches!(t, Source | Concept),
        ReviewNeeded => s == Concept && t == Concept, // 자동 경로에서는 별도로 거부됨
    }
}

/// 그래프 노드 DTO. 프론트 ConceptGraph 입력.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String, // concept id (= relation 의 node id)
    pub title: String,
    pub kind: String, // "core" | "result"
    pub subject_ids: Vec<String>,
    pub path: String,  // wiki 파일명 (node 클릭 → 문서 열기)
    pub priority: f32, // 파생 우선도 0~1 (prioritization.md §5). entities 아님 → 계약 변경 아님.
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub relations: Vec<Relation>,
}

pub(crate) fn read_relations(space: &str) -> Result<Vec<Relation>, String> {
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

    // 개념별 in/out 차수 + 인접 엣지 품질(strength·confidence 합) — 우선도 팩터 1·2.
    let mut outdeg: HashMap<String, u32> = HashMap::new();
    let mut indeg: HashMap<String, u32> = HashMap::new();
    let mut edge_quality: HashMap<String, f32> = HashMap::new();
    for r in &relations {
        *outdeg.entry(r.source_node_id.clone()).or_default() += 1;
        *indeg.entry(r.target_node_id.clone()).or_default() += 1;
        let w = r.strength * r.confidence;
        *edge_quality.entry(r.source_node_id.clone()).or_default() += w;
        *edge_quality.entry(r.target_node_id.clone()).or_default() += w;
    }

    // wiki 파일 → 노드. 같은 순서로 RawFactors 를 모아 우선도를 일괄 산정한다.
    let dir = storage::space_subdir(&space, "wiki");
    let files = storage::list_files(&dir, ".md").map_err(|e| e.to_string())?;
    let mut nodes = vec![];
    let mut raws: Vec<RawFactors> = vec![];
    for f in files {
        let md = storage::read_text(&dir.join(&f)).map_err(|e| e.to_string())?;
        let page: WikiPage = match frontmatter::md_to_wiki(&sp.id, &f, &md) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let id = page.concept_id.clone();
        let out = *outdeg.get(&id).unwrap_or(&0);
        let inn = *indeg.get(&id).unwrap_or(&0);
        let kind = if out == 0 && inn > 0 {
            "result"
        } else {
            "core"
        };

        raws.push(RawFactors {
            centrality: (inn + out) as f32,
            edge_quality: *edge_quality.get(&id).unwrap_or(&0.0),
            // 클릭은 app-local node-stats(§4) 미배선 상태 → 콜드스타트 0. 후속 단계에서 주입.
            clicks: 0,
            // updatedAt 상대 신선도(§5.1 factor 4). 파싱 실패 시 0(=가장 오래됨 취급).
            recency: storage::iso_to_epoch_days(&page.updated_at).unwrap_or(0) as f32,
            // 근거 탄탄함(§5.1 factor 5): sourceIds + sourceRefs 개수.
            source_backing: (page.source_ids.len() + page.source_refs.len()) as f32,
        });
        nodes.push(GraphNode {
            id,
            title: page.title,
            kind: kind.to_string(),
            subject_ids: page.subject_ids,
            path: f,
            priority: 0.0,
        });
    }

    // 파생 우선도 산정 후 각 노드에 주입(§5.3). raws 와 nodes 는 동일 순서.
    for (node, p) in nodes.iter_mut().zip(compute_priorities(&raws)) {
        node.priority = p;
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
        .map(|r| {
            (
                r.source_node_id.clone(),
                r.target_node_id.clone(),
                r.relation_type,
            )
        })
        .collect();

    for r in relations {
        let edge = format!("{}→{}", r.source_node_id, r.target_node_id);
        if !(0.0..=1.0).contains(&r.strength) || !(0.0..=1.0).contains(&r.confidence) {
            return Err(format!(
                "[relation_invalid] strength/confidence 는 0~1 이어야 함: {edge}"
            ));
        }
        if r.relation_type == RelationType::ReviewNeeded {
            return Err(
                "[relation_invalid] review_needed 는 사용자만 지정 가능(자동 부여 금지)".into(),
            );
        }
        if !compat(
            node_kind(&r.source_node_id),
            node_kind(&r.target_node_id),
            r.relation_type,
        ) {
            return Err(format!(
                "[relation_invalid] 노드 호환성 위반: {:?} {edge}",
                r.relation_type
            ));
        }
        if r.evidence.is_empty() {
            return Err(format!(
                "[relation_invalid] 모든 관계는 evidence ≥ 1: {edge}"
            ));
        }
        let key = (
            r.source_node_id.clone(),
            r.target_node_id.clone(),
            r.relation_type,
        );
        if seen.insert(key) {
            existing.push(r); // 동일 엣지는 중복 저장 안 함
        }
    }

    let total = existing.len();
    let related = existing
        .iter()
        .filter(|r| r.relation_type == RelationType::RelatedTo)
        .count();
    if total > 0 && related * 100 / total > 30 {
        eprintln!(
            "[review] related_to 비율 {}% (>30%) — 저장됨, 관계 타입 재검토 권장",
            related * 100 / total
        );
    }

    let path = storage::space_subdir(&space, "relations").join("relations.json");
    storage::write_json(&path, &existing).map_err(|e| e.to_string())?;
    Ok(existing.len())
}

fn write_relations(space: &str, rels: &[Relation]) -> Result<usize, String> {
    let path = storage::space_subdir(space, "relations").join("relations.json");
    storage::write_json(&path, &rels.to_vec()).map_err(|e| e.to_string())?;
    Ok(rels.len())
}

fn is_review_self_loop(r: &Relation, concept_id: &str) -> bool {
    r.relation_type == RelationType::ReviewNeeded
        && r.source_node_id == concept_id
        && r.target_node_id == concept_id
}

/// 사용자가 "아직 모르겠어요" 를 선언했을 때 review_needed self-loop 를 기록한다.
///
/// [`append_relations`] 의 **거울상**이다. 저쪽은 review_needed 만 거부하고,
/// 이쪽은 review_needed 만 허용한다. 두 커맨드가 나뉘어 있다는 사실 자체가
/// "LLM 은 못 붙이고 사용자만 붙인다"(relation-types.md §review_needed) 의 구조적 증명이다.
///
/// `quotes` = 사용자가 실제로 쓴 설명 시도. 그 자체가 "아직 못 한다" 의 근거다.
#[tauri::command]
pub fn mark_review_needed(
    space: String,
    concept_id: String,
    source_id: String,
    quotes: Vec<String>,
) -> Result<usize, String> {
    if node_kind(&concept_id) != NodeKind::Concept {
        return Err(format!(
            "[relation_invalid] review_needed 는 Concept 에만 붙는다: {concept_id}"
        ));
    }
    if source_id.trim().is_empty() {
        return Err("[relation_invalid] source_id 필수".into());
    }
    let quotes: Vec<String> = quotes
        .into_iter()
        .map(|q| q.trim().to_string())
        .filter(|q| !q.is_empty())
        .collect();
    if quotes.is_empty() {
        return Err("[relation_invalid] 모든 관계는 evidence ≥ 1: 설명 시도가 곧 근거다".into());
    }

    let mut existing = read_relations(&space)?;
    if existing.iter().any(|r| is_review_self_loop(r, &concept_id)) {
        return Ok(existing.len()); // 이미 표시됨 — 멱등
    }

    let now = storage::now_iso();
    let space_id = space_by_slug(&space)?.id;
    existing.push(Relation {
        id: storage::gen_id("rel"),
        space_id,
        source_node_id: concept_id.clone(),
        target_node_id: concept_id,
        relation_type: RelationType::ReviewNeeded,
        strength: 1.0,
        confidence: 1.0,
        explanation: "사용자가 아직 자기 말로 설명하지 못한다고 표시한 개념".into(),
        evidence: quotes
            .into_iter()
            .map(|q| crate::models::Evidence {
                source_id: source_id.clone(),
                source_ref_id: None,
                archive_path: None,
                original_file_path: None,
                page: None,
                quote: Some(q),
                location: None,
                reason: "파인만 되묻기에서 사용자가 '아직 모르겠어요' 선택".into(),
            })
            .collect(),
        created_at: now.clone(),
        updated_at: now,
    });
    write_relations(&space, &existing)
}

/// 사용자가 복습 표시를 거둔다(= 이제 설명할 수 있다). 없으면 멱등하게 no-op.
#[tauri::command]
pub fn unmark_review_needed(space: String, concept_id: String) -> Result<usize, String> {
    let existing = read_relations(&space)?;
    let kept: Vec<Relation> = existing
        .into_iter()
        .filter(|r| !is_review_self_loop(r, &concept_id))
        .collect();
    write_relations(&space, &kept)
}
