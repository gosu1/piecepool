//! 노드 우선도(priority) 산정 — 순수 계산. SSOT: docs/20-backend/prioritization.md §5.
//! 파생값이므로 저장하지 않고 매 get_graph 조회 시 계산한다(§1).
//! 파일 I/O·네트워크·외부 crate 무관 — std 전용이라 픽스처만으로 단위 테스트가 완결된다.

/// §5.1 팩터 가중치. 합 = 1.00. 실제 그래프로 튜닝하는 초기값.
const W_CENTRALITY: f32 = 0.35;
const W_EDGE_QUALITY: f32 = 0.15;
const W_CLICK: f32 = 0.25;
const W_RECENCY: f32 = 0.15;
const W_SOURCE: f32 = 0.10;

/// 노드 1개의 팩터 원시값(정규화 전). space 안에서 상대 비교하므로 raw 로 담는다.
#[derive(Debug, Clone)]
pub struct RawFactors {
    /// in_deg + out_deg — 허브 개념일수록 큼 (§5.1 factor 1)
    pub centrality: f32,
    /// 인접 엣지의 strength·confidence 합 (factor 2)
    pub edge_quality: f32,
    /// 사용자 클릭 수. 정규화 전에 ln(1+clicks) 로그스케일 (factor 3)
    pub clicks: u32,
    /// updatedAt 기반 신선도 decay [0,1] (factor 4)
    pub recency: f32,
    /// sourceIds/sourceRefs 개수 — 근거 탄탄함 (factor 5)
    pub source_backing: f32,
}

/// space 내 노드들의 우선도(0–1)를 산정한다(§5.2).
/// 팩터별로 space 내 min-max 정규화 후 가중 합산하고 clamp 한다.
/// clicks 만 정규화 전에 ln(1+c) 로그스케일을 적용해 핫 노드 1개의 지배를 막는다.
/// 입력 순서와 출력 순서는 1:1 대응한다.
pub fn compute_priorities(raw: &[RawFactors]) -> Vec<f32> {
    if raw.is_empty() {
        return Vec::new();
    }
    let centrality = normalize(&column(raw, |r| r.centrality));
    let edge_quality = normalize(&column(raw, |r| r.edge_quality));
    let clicks = normalize(&column(raw, |r| (1.0 + r.clicks as f32).ln()));
    let recency = normalize(&column(raw, |r| r.recency));
    let source = normalize(&column(raw, |r| r.source_backing));

    (0..raw.len())
        .map(|i| {
            let score = W_CENTRALITY * centrality[i]
                + W_EDGE_QUALITY * edge_quality[i]
                + W_CLICK * clicks[i]
                + W_RECENCY * recency[i]
                + W_SOURCE * source[i];
            score.clamp(0.0, 1.0)
        })
        .collect()
}

/// 팩터 1개의 노드별 원시값 열을 뽑는다.
fn column(raw: &[RawFactors], f: impl Fn(&RawFactors) -> f32) -> Vec<f32> {
    raw.iter().map(f).collect()
}

/// space 내 min-max 정규화. 모든 값이 같으면(max==min) 전부 0.0 (§5.2 규약 — 0/0 방지).
fn normalize(values: &[f32]) -> Vec<f32> {
    let min = values.iter().copied().fold(f32::INFINITY, f32::min);
    let max = values.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let range = max - min;
    if range <= 0.0 {
        return vec![0.0; values.len()];
    }
    values.iter().map(|&v| (v - min) / range).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// pass 조건: 출력 ∈ [0,1]; 모든 팩터 최대 노드 ≈ 1, 최소 노드 ≈ 0, 랭킹 보존.
    #[test]
    fn ranks_and_clamps() {
        let raw = vec![
            RawFactors { centrality: 10.0, edge_quality: 5.0, clicks: 100, recency: 1.0, source_backing: 3.0 },
            RawFactors { centrality: 1.0,  edge_quality: 0.0, clicks: 0,   recency: 0.0, source_backing: 0.0 },
            RawFactors { centrality: 5.0,  edge_quality: 2.0, clicks: 10,  recency: 0.5, source_backing: 1.0 },
        ];
        let p = compute_priorities(&raw);
        assert_eq!(p.len(), 3);
        assert!(p.iter().all(|&x| (0.0..=1.0).contains(&x)), "clamp [0,1]");
        assert!(p[0] > p[2] && p[2] > p[1], "지배 > 중간 > 최약 랭킹");
        assert!((p[0] - 1.0).abs() < 1e-6, "모든 팩터 최대 노드 ≈ 1");
        assert!(p[1].abs() < 1e-6, "모든 팩터 최소 노드 ≈ 0");
    }

    /// max==min 분모 0 처리 규약을 강제하는 가드: 동일 입력은 전부 0, NaN 없음.
    #[test]
    fn degenerate_all_equal_no_nan() {
        let raw = vec![RawFactors { centrality: 3.0, edge_quality: 3.0, clicks: 5, recency: 0.5, source_backing: 2.0 }; 4];
        let p = compute_priorities(&raw);
        assert!(p.iter().all(|&x| x.is_finite()), "0/0 NaN 방지");
        assert!(p.iter().all(|&x| x == 0.0), "동일 입력 → 전부 0");
    }

    /// 로그스케일: 클릭만 다를 때 100 vs 10 의 기여 격차가 선형(10배)보다 압축돼야 한다.
    #[test]
    fn clicks_log_scale_compresses() {
        let raw = vec![
            RawFactors { centrality: 1.0, edge_quality: 1.0, clicks: 0,   recency: 0.0, source_backing: 0.0 },
            RawFactors { centrality: 1.0, edge_quality: 1.0, clicks: 10,  recency: 0.0, source_backing: 0.0 },
            RawFactors { centrality: 1.0, edge_quality: 1.0, clicks: 100, recency: 0.0, source_backing: 0.0 },
        ];
        let p = compute_priorities(&raw);
        // 구조 팩터는 전부 동일 → 0. 오직 클릭항만 기여. ratio = ln(11)/ln(101) ≈ 0.52.
        let ratio = p[1] / p[2];
        assert!(ratio > 0.4 && ratio < 0.6, "로그스케일 압축(ratio={ratio}, 선형이면 0.1)");
    }

    #[test]
    fn empty_input() {
        assert!(compute_priorities(&[]).is_empty());
    }
}
