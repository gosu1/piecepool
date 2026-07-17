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

/// 대칭 관계 — (A,B) 와 (B,A) 는 같은 관계 하나다. 규약: relation-types.md §7.1.
fn is_symmetric(rt: RelationType) -> bool {
    use RelationType::*;
    matches!(rt, Contrasts | ConfusedWith | RelatedTo)
}

/// 이 관계를 우선도 팩터(centrality·edge_quality)와 kind 판정에 셈하는가. (prioritization.md §5.1 factor 1)
///
/// 두 가지를 뺀다:
/// - `review_needed` — 사용자가 "아직 모르겠다" 고 붙인 마커이지 지식 구조가 아니다. factor 1 의 정의는
///   "허브 개념"이고, 표시했다는 사실은 그 개념이 허브라는 근거가 못 된다.
/// - self-loop — source·target 이 같아 한 노드의 in/out 을 동시에 올리고 edge_quality 를 두 번 더한다.
///
/// 빼지 않으면 표시하는 행위가 그 노드를 키우고(`size = 6 + priority*30`), `out == 0 && inn > 0` 로
/// 판정하던 result 노드를 core 로 뒤집는다 — 크기·색이 사용자 표시로 오염돼 "크다 = 중요하다" 가 깨진다.
/// 관계 자체는 그대로 반환한다(프런트가 빨간 테두리를 그리는 근거).
fn counts_toward_priority(r: &Relation) -> bool {
    r.relation_type != RelationType::ReviewNeeded && r.source_node_id != r.target_node_id
}

/// 중복 판정 키. 대칭 타입은 (source,target) 을 정렬해 방향 차이를 지운다.
/// 방향성 타입(part_of·prerequisite 등)은 정렬하면 계층축(DAG)이 무너지므로 그대로 둔다.
fn dedup_key(r: &Relation) -> (String, String, RelationType) {
    let (a, b) = (r.source_node_id.clone(), r.target_node_id.clone());
    if is_symmetric(r.relation_type) && a > b {
        (b, a, r.relation_type)
    } else {
        (a, b, r.relation_type)
    }
}

/// self-loop 는 review_needed 에만 허용된다(relation-types.md §7.2). 나머지는 무의미.
fn is_invalid_self_loop(r: &Relation) -> bool {
    r.source_node_id == r.target_node_id && r.relation_type != RelationType::ReviewNeeded
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
    let rels: Vec<Relation> = storage::read_json(&path).map_err(|e| e.to_string())?;
    // 저장 게이트를 우회해 들어온 과거 오염(대칭 중복·무효 self-loop)을 읽는 시점에 접는다.
    // 비파괴적 — 다음 write 때 정리본이 디스크에 영속된다.
    let mut seen = HashSet::new();
    Ok(rels
        .into_iter()
        .filter(|r| !is_invalid_self_loop(r) && seen.insert(dedup_key(r)))
        .collect())
}

/// wiki(노드) + relations(엣지) 를 합쳐 그래프 데이터 반환.
/// node.kind: 들어오는 엣지만 있고 나가는 엣지가 없으면 "result"(결과 개념), 그 외 "core".
/// 단 대칭 관계(§7.1)는 방향이 없으므로 "받기만 한다" 는 판정에서 제외한다.
#[tauri::command]
pub fn get_graph(space: String) -> Result<GraphData, String> {
    let sp = space_by_slug(&space)?;
    let relations = read_relations(&space)?;

    // 개념별 in/out 차수 + 인접 엣지 품질(strength·confidence 합) — 우선도 팩터 1·2.
    let mut outdeg: HashMap<String, u32> = HashMap::new();
    let mut indeg: HashMap<String, u32> = HashMap::new();
    let mut edge_quality: HashMap<String, f32> = HashMap::new();
    // 대칭 엣지가 닿은 노드. 대칭 관계는 한 방향만 저장되므로(§7.1) 차수만 보면
    // 저장된 방향의 target 이 "받기만 하는" 노드로 오분류된다.
    let mut symmetric_touched: HashSet<&str> = HashSet::new();
    for r in &relations {
        if !counts_toward_priority(r) {
            continue;
        }
        *outdeg.entry(r.source_node_id.clone()).or_default() += 1;
        *indeg.entry(r.target_node_id.clone()).or_default() += 1;
        if is_symmetric(r.relation_type) {
            symmetric_touched.insert(&r.source_node_id);
            symmetric_touched.insert(&r.target_node_id);
        }
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
        let kind = if out == 0 && inn > 0 && !symmetric_touched.contains(id.as_str()) {
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
/// 검증: strength/confidence∈[0,1], node-compat 매트릭스, review_needed 자동 거부, evidence≥1,
/// 동일 엣지 dedup(대칭 타입은 방향 무시), 무효 self-loop skip.
/// 저장 후 related_to 비율 > 30% 이면 검토 플래그 로그(응답당 50% 경고와 별개 층).
#[tauri::command]
pub fn append_relations(space: String, relations: Vec<Relation>) -> Result<usize, String> {
    let mut existing = read_relations(&space)?;
    let mut seen: HashSet<(String, String, RelationType)> =
        existing.iter().map(dedup_key).collect();

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
        // 무효 self-loop 는 배치 전체를 실패시키지 않고 건너뛴다 — 지금까지 통과하던 임포트를 깨지 않는다.
        if is_invalid_self_loop(&r) {
            continue;
        }
        if seen.insert(dedup_key(&r)) {
            existing.push(r); // 동일 엣지는 중복 저장 안 함 (대칭 타입은 방향 무시)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn rel(source: &str, target: &str, rt: RelationType) -> Relation {
        Relation {
            id: "rel-1".into(),
            space_id: "sp-1".into(),
            source_node_id: source.into(),
            target_node_id: target.into(),
            relation_type: rt,
            strength: 0.9,
            confidence: 0.9,
            explanation: String::new(),
            evidence: vec![],
            created_at: "2026-07-17T00:00:00+09:00".into(),
            updated_at: "2026-07-17T00:00:00+09:00".into(),
        }
    }

    // 회귀: "아직 모르겠다" 표시(review_needed self-loop)가 우선도 팩터에 섞여 들어가면
    // outdeg·indeg 가 같은 노드에 +1 씩(centrality +2), edge_quality 가 +2w 되어
    // 표시하는 행위만으로 노드가 커졌다(size = 6 + priority*30). 크기 채널의 의미가 깨진다.
    #[test]
    fn review_marker_is_not_a_priority_factor() {
        assert!(!counts_toward_priority(&rel(
            "concept-a",
            "concept-a",
            RelationType::ReviewNeeded
        )));
    }

    // self-loop 는 타입과 무관하게 한 노드의 in/out 을 동시에 올려 이중 계산된다.
    #[test]
    fn self_loop_is_not_a_priority_factor() {
        assert!(!counts_toward_priority(&rel(
            "concept-a",
            "concept-a",
            RelationType::RelatedTo
        )));
    }

    // 진짜 지식 관계는 그대로 센다 — 우선도가 죽으면 안 된다.
    #[test]
    fn real_relation_counts() {
        assert!(counts_toward_priority(&rel(
            "concept-a",
            "concept-b",
            RelationType::Prerequisite
        )));
        assert!(counts_toward_priority(&rel(
            "concept-a",
            "concept-b",
            RelationType::RelatedTo
        )));
    }
}
