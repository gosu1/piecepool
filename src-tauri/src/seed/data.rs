//! 시드 데이터 정의 — 공간(space)별 재료. 로직은 super::seed_space 가 담당.
//! 계약: docs/10-contracts/workspace-layout.md · relation-types.md
//! 크로스 과목 엣지는 같은 공간의 relations.json 안에 산다 — 공간을 넘는 엣지는 계약상 존재할 수 없다.

use super::{note, rel, subject, wiki, with_evidence, with_source, SpaceSeed};
use crate::models::*;
use crate::storage;

fn space(id: &str, name: &str, slug: &str, now: &str) -> KnowledgeSpace {
    KnowledgeSpace {
        id: id.into(),
        name: name.into(),
        slug: slug.into(),
        root_path: storage::space_dir(slug).to_string_lossy().to_string(),
        created_at: now.into(),
        updated_at: now.into(),
    }
}

/// 첫 실행 시 생성되는 데모 공간 전체.
pub(super) fn all(now: &str) -> Vec<SpaceSeed> {
    vec![
        os(now),
        ai(now),
        statistics(now),
        economics(now),
        physiology(now),
    ]
}

fn os(now: &str) -> SpaceSeed {
    let archive = format!("{}-os-overview.md", storage::today());
    let relations = vec![
        rel(
            "space-os",
            "thread",
            "process",
            RelationType::PartOf,
            0.9,
            0.95,
            "스레드는 프로세스의 실행 단위다.",
            now,
        ),
        rel(
            "space-os",
            "cpu-scheduling",
            "process",
            RelationType::UsedIn,
            0.8,
            0.9,
            "CPU 스케줄링은 프로세스에 CPU를 할당한다.",
            now,
        ),
        rel(
            "space-os",
            "synchronization",
            "process",
            RelationType::RelatedTo,
            0.6,
            0.8,
            "동기화는 프로세스/스레드 간 자원 접근을 조율한다.",
            now,
        ),
        rel(
            "space-os",
            "synchronization",
            "thread",
            RelationType::Prerequisite,
            0.5,
            0.7,
            "스레드 동시 실행을 다루려면 동기화 개념이 필요하다.",
            now,
        ),
        rel(
            "space-os",
            "synchronization",
            "deadlock",
            RelationType::Causes,
            0.85,
            0.9,
            "잘못된 동기화는 교착상태를 유발한다.",
            now,
        ),
    ];
    SpaceSeed {
        space: space("space-os", "운영체제", "운영체제", now),
        subjects: vec![
            subject("subject-os", "space-os", "운영체제론", "#0075de", now),
        ],
        notes: vec![(
            archive.clone(),
            note("space-os", "subject-os", "source-os-overview", "운영체제 개요 강의 노트", "# 운영체제 개요\n\n운영체제의 핵심 기능은 프로세스 관리, 메모리 관리, 동기화다.\n프로세스 스케줄링은 CPU 이용률을 극대화하기 위해 실행 가능한 프로세스들 사이에서 CPU를 할당한다.\n스레드는 프로세스 내부의 실행 단위이며, 동기화 문제를 잘못 다루면 교착상태가 발생한다.", now),
        )],
        wikis: with_source(
            vec![
            ("process.md".into(), wiki("space-os", "subject-os", "process", "프로세스", "# 프로세스\n\n프로세스는 실행 중인 프로그램의 인스턴스다. 코드, 데이터, 스택, 그리고 PCB(Process Control Block)로 구성된다.\n\n## 상태\n\n생성 → 준비 → 실행 → 대기 → 종료 의 생애주기를 가진다.\n\n## 관련 개념\n\n프로세스 내부의 실행 단위는 [[스레드]]이고, 실행 순서는 [[CPU 스케줄링]]이 결정한다.", now)),
            ("thread.md".into(), wiki("space-os", "subject-os", "thread", "스레드", "# 스레드\n\n스레드는 프로세스 내부의 실행 단위다. 같은 프로세스의 스레드들은 코드·데이터·힙을 공유하지만 각자의 스택과 레지스터를 가진다.", now)),
            ("cpu-scheduling.md".into(), wiki("space-os", "subject-os", "cpu-scheduling", "CPU 스케줄링", "# CPU 스케줄링\n\nCPU 스케줄링은 실행 가능한 프로세스들 사이에서 CPU를 할당하는 과정이다. 선점형(Preemptive)과 비선점형 알고리즘이 있다.\n\n- FCFS, SJF, Round Robin, Priority", now)),
            ("synchronization.md".into(), wiki("space-os", "subject-os", "synchronization", "동기화", "# 동기화\n\n동기화는 공유 자원에 대한 동시 접근을 조율한다. 임계 구역(critical section) 문제를 뮤텍스·세마포어·모니터로 해결한다.\n\n여러 [[스레드]]가 경쟁할 때 잘못 다루면 [[교착상태]]가 발생한다.", now)),
            ("deadlock.md".into(), wiki("space-os", "subject-os", "deadlock", "교착상태", "# 교착상태 (Deadlock)\n\n교착상태는 둘 이상의 프로세스가 서로의 자원을 기다리며 영원히 진행하지 못하는 상태다.\n\n## 발생 조건\n\n상호 배제, 점유와 대기, 비선점, 순환 대기 — 네 조건이 동시에 성립할 때 발생한다.", now)),
            ],
            "source-os-overview",
        ),
        relations: with_evidence(relations, "source-os-overview", &archive),
    }
}

fn ai(now: &str) -> SpaceSeed {
    let archive = format!("{}-transformer-notes.md", storage::today());
    let relations = vec![
        rel(
            "space-ai",
            "self-attention",
            "transformer",
            RelationType::PartOf,
            0.9,
            0.95,
            "셀프 어텐션은 트랜스포머의 핵심 구성요소다.",
            now,
        ),
        rel(
            "space-ai",
            "embedding",
            "transformer",
            RelationType::Prerequisite,
            0.7,
            0.85,
            "임베딩은 트랜스포머 입력의 전제다.",
            now,
        ),
        rel(
            "space-ai",
            "embedding",
            "self-attention",
            RelationType::UsedIn,
            0.6,
            0.8,
            "셀프 어텐션은 임베딩 벡터에 작용한다.",
            now,
        ),
    ];
    SpaceSeed {
        space: space("space-ai", "AI 딥러닝", "AI 딥러닝", now),
        subjects: vec![
            subject("subject-ai", "space-ai", "AI 딥러닝", "#2a9d99", now),
        ],
        notes: vec![(
            archive.clone(),
            note("space-ai", "subject-ai", "source-transformer", "트랜스포머 강의 노트", "# 트랜스포머\n\n트랜스포머는 self-attention 으로 시퀀스의 토큰 간 관계를 계산한다. 임베딩으로 토큰을 벡터화한 뒤 attention 으로 문맥을 합성한다.", now),
        )],
        wikis: with_source(
            vec![
            ("transformer.md".into(), wiki("space-ai", "subject-ai", "transformer", "트랜스포머", "# 트랜스포머\n\n트랜스포머는 RNN 없이 self-attention 만으로 시퀀스를 처리하는 신경망 구조다. 인코더-디코더로 구성된다.\n\n핵심 구성요소는 [[셀프 어텐션]]이며 입력은 [[임베딩]]으로 벡터화한다.", now)),
            ("self-attention.md".into(), wiki("space-ai", "subject-ai", "self-attention", "셀프 어텐션", "# 셀프 어텐션\n\nSelf-Attention은 시퀀스 안의 토큰들이 서로의 관계를 계산해 문맥 표현을 만드는 mechanism이다. Query·Key·Value 의 내적으로 가중치를 구한다.", now)),
            ("embedding.md".into(), wiki("space-ai", "subject-ai", "embedding", "임베딩", "# 임베딩\n\n임베딩은 토큰을 연속 벡터 공간으로 사상한다. 의미가 가까운 토큰은 가까운 벡터가 된다.", now)),
            ],
            "source-transformer",
        ),
        relations: with_evidence(relations, "source-transformer", &archive),
    }
}

fn statistics(now: &str) -> SpaceSeed {
    let archive = format!("{}-prob-stat-week3.md", storage::today());
    let relations = vec![
        rel("space-stats", "sampling-distribution", "probability-distribution", RelationType::Prerequisite, 0.9, 0.95, "표본분포는 통계량이 따르는 확률분포이므로, 확률분포 개념을 먼저 알아야 이해할 수 있다.", now),
        rel("space-stats", "hypothesis-testing", "sampling-distribution", RelationType::Prerequisite, 0.9, 0.95, "검정통계량의 기각역과 p-값은 표본분포를 알아야 계산할 수 있으므로 표본분포가 가설검정의 선수 개념이다.", now),
        rel("space-stats", "t-distribution", "hypothesis-testing", RelationType::UsedIn, 0.85, 0.9, "모분산을 모르는 평균 검정에서 검정통계량이 t-분포를 따르므로 가설검정에 t-분포가 활용된다.", now),
        rel("space-stats", "significance-level", "hypothesis-testing", RelationType::PartOf, 0.9, 0.95, "유의수준은 기각 기준을 정하는 가설검정 절차의 한 구성 요소다.", now),
        rel("space-stats", "p-value", "hypothesis-testing", RelationType::PartOf, 0.9, 0.95, "p-값은 유의수준과 비교해 기각 여부를 결정하는 가설검정 절차의 한 구성 요소다.", now),
        rel("space-stats", "hypothesis-testing", "regression-analysis", RelationType::UsedIn, 0.8, 0.85, "회귀분석에서 회귀계수의 유의성을 판단할 때 t-검정 형태의 가설검정이 그대로 활용된다.", now),
        rel("space-stats", "type-i-error", "type-ii-error", RelationType::Contrasts, 0.85, 0.9, "제1종 오류와 제2종 오류는 한쪽을 줄이면 다른 쪽이 커지는 트레이드오프 관계의 대비되는 개념이다.", now),
        rel("space-stats", "regression-analysis", "linear-regression", RelationType::RelatedTo, 0.85, 0.9, "통계학의 회귀분석과 머신러닝의 선형회귀는 사실상 같은 모형을 서로 다른 과목의 관점에서 다룬다.", now),
        rel("space-stats", "gradient-descent", "linear-regression", RelationType::UsedIn, 0.8, 0.9, "선형회귀의 가중치 학습에서 손실을 최소화하는 방법으로 경사하강법이 활용된다.", now),
    ];
    SpaceSeed {
        space: space("space-stats", "통계학", "통계학", now),
        subjects: vec![
            subject("subject-stats", "space-stats", "통계학", "#8a5cf6", now),
            subject("subject-ml", "space-stats", "머신러닝", "#0075de", now),
        ],
        notes: vec![(
            archive.clone(),
            note("space-stats", "subject-stats", "source-stats-lecture", "확률과 통계 3주차 — 가설검정", "가설검정 = 표본에서 얻은 증거로 모집단에 대한 주장을 판정하는 절차. 귀무가설 H₀ 세우고 유의수준 α(보통 0.05)를 미리 정함 — α는 제1종 오류(참인데 기각) 허용 확률이고, 제2종 오류(거짓인데 못 기각)랑은 트레이드오프!! p-값이 α보다 작으면 H₀ 기각. 검정통계량 계산하려면 표본분포를 알아야 하는데, 표본분포도 결국 통계량이 따르는 확률분포의 일종이고, 모분산 모르면 정규분포 대신 t-분포 씀(자유도 커지면 정규 근사). 교수님 왈: 회귀분석에서 회귀계수 유의성 따질 때도 이 가설검정을 그대로 쓴다 — 머신러닝 수업에서 배운 선형회귀랑 사실상 같은 모형인데, 거긴 같은 최소제곱 목적함수를 정규방정식 대신 경사하강법으로 최적화해서 파라미터를 학습한다고 함.", now),
        )],
        wikis: with_source(
            vec![
            ("hypothesis-testing.md".into(), wiki("space-stats", "subject-stats", "hypothesis-testing", "가설검정", "# 가설검정\n\n표본에서 얻은 증거로 모집단에 대한 주장을 통계적으로 판정하는 절차. 귀무가설을 세우고, 정한 유의수준 아래에서 기각 여부를 결정한다.", now)),
            ("probability-distribution.md".into(), wiki("space-stats", "subject-stats", "probability-distribution", "확률분포", "# 확률분포\n\n확률변수가 가질 수 있는 각 값(또는 구간)에 확률을 대응시키는 규칙. 이산형은 확률질량함수, 연속형은 확률밀도함수로 기술하며, 정규분포·이항분포 등이 대표적이다. [[표본분포]]를 비롯한 추론통계의 모든 계산이 확률분포 위에서 이루어진다.", now)),
            ("sampling-distribution.md".into(), wiki("space-stats", "subject-stats", "sampling-distribution", "표본분포", "# 표본분포\n\n표본평균 같은 통계량이 표본추출을 반복할 때 따르는 확률분포. 중심극한정리에 의해 모집단의 분산이 유한하면, 표본 크기가 클 때 표본평균의 분포는 모집단 분포의 형태와 무관하게 정규분포에 근사한다. [[가설검정]]과 신뢰구간 추정의 이론적 기반이 된다.", now)),
            ("significance-level.md".into(), wiki("space-stats", "subject-stats", "significance-level", "유의수준", "# 유의수준\n\n귀무가설이 참인데도 기각하는 오류, 즉 [[제1종 오류]]를 허용하는 최대 확률 α. 관례적으로 0.05나 0.01을 쓰며, 데이터를 보기 전에 미리 정해야 한다. [[p-값]]이 유의수준보다 작으면 귀무가설을 기각한다.", now)),
            ("p-value.md".into(), wiki("space-stats", "subject-stats", "p-value", "p-값", "# p-값\n\n귀무가설이 참이라는 가정 아래, 관측된 값 이상으로 극단적인 검정통계량이 나올 확률. [[유의수준]]보다 작으면 귀무가설을 기각한다. '귀무가설이 참일 확률'이 아니라는 점에 주의해야 한다.", now)),
            ("t-distribution.md".into(), wiki("space-stats", "subject-stats", "t-distribution", "t-분포", "# t-분포\n\n정규 모집단에서 모분산을 모를 때, 표본표준편차로 표준화한 통계량이 따르는 연속 확률분포. 자유도에 따라 모양이 달라지며 정규분포보다 꼬리가 두껍고, 자유도가 커지면 표준정규분포에 근사한다. 소표본에서의 평균 검정과 회귀계수 검정에 쓰인다.", now)),
            ("type-i-error.md".into(), wiki("space-stats", "subject-stats", "type-i-error", "제1종 오류", "# 제1종 오류\n\n귀무가설이 참인데도 기각하는 오류. 이 오류를 범할 확률의 상한이 [[유의수준]] α다. [[제2종 오류]]와는 한쪽을 줄이면 다른 쪽이 커지는 트레이드오프 관계에 있다.", now)),
            ("type-ii-error.md".into(), wiki("space-stats", "subject-stats", "type-ii-error", "제2종 오류", "# 제2종 오류\n\n귀무가설이 거짓인데도 기각하지 못하는 오류로, 그 확률을 β로 표기한다. 검정력은 1−β로 정의되며, 표본 크기를 키우면 β를 줄일 수 있다. [[제1종 오류]]와 트레이드오프 관계다.", now)),
            ("regression-analysis.md".into(), wiki("space-stats", "subject-stats", "regression-analysis", "회귀분석", "# 회귀분석\n\n독립변수(설명변수)와 종속변수(반응변수) 사이의 관계를 함수 형태로 모형화하고 추정하는 통계 기법. 보통 최소제곱법으로 회귀계수를 추정하며, 각 계수의 유의성은 [[t-분포]]를 이용한 [[가설검정]]으로 판단한다. 머신러닝의 [[선형회귀]]와 본질적으로 같은 모형이다.", now)),
            ("linear-regression.md".into(), wiki("space-stats", "subject-ml", "linear-regression", "선형회귀", "# 선형회귀\n\n입력 특성들의 선형결합으로 연속적인 목표값을 예측하는 지도학습 모델. 평균제곱오차(MSE) 손실을 최소화하도록 가중치를 학습하며, 정규방정식으로 닫힌 해를 구하거나 [[경사하강법]]으로 반복 최적화한다. 통계학의 [[회귀분석]]과 본질적으로 같은 모형을 다른 관점에서 다룬다.", now)),
            ("gradient-descent.md".into(), wiki("space-stats", "subject-ml", "gradient-descent", "경사하강법", "# 경사하강법\n\n손실함수의 기울기(gradient) 반대 방향으로 파라미터를 반복 갱신하여 최솟값을 찾아가는 최적화 알고리즘. 학습률이 한 번에 이동하는 스텝 크기를 결정한다. [[선형회귀]]부터 신경망까지 미분 가능한 모델의 학습에 널리 쓰인다.", now)),
            ],
            "source-stats-lecture",
        ),
        relations: with_evidence(relations, "source-stats-lecture", &archive),
    }
}

fn economics(now: &str) -> SpaceSeed {
    let archive = format!("{}-econ-market.md", storage::today());
    let relations = vec![
        rel(
            "space-econ",
            "price-elasticity",
            "supply-and-demand",
            RelationType::PartOf,
            0.8,
            0.9,
            "가격탄력성은 수요·공급 이론에서 가격 변화에 대한 반응 정도를 재는 한 부분이다.",
            now,
        ),
        rel(
            "space-econ",
            "market-equilibrium",
            "supply-and-demand",
            RelationType::Prerequisite,
            0.9,
            0.95,
            "수요·공급의 원리를 먼저 알아야 두 곡선이 만나 이루는 시장균형을 이해할 수 있다.",
            now,
        ),
        rel(
            "space-econ",
            "marginal-cost",
            "market-equilibrium",
            RelationType::UsedIn,
            0.7,
            0.8,
            "한계비용은 기업의 공급 결정(P=MC)을 통해 시장균형 분석에서 활용된다.",
            now,
        ),
        rel(
            "space-econ",
            "marginal-cost",
            "derivative",
            RelationType::Prerequisite,
            0.9,
            0.95,
            "미분(도함수)을 먼저 알아야 총비용을 미분해 얻는 한계비용(dTC/dQ)을 이해할 수 있다.",
            now,
        ),
        rel(
            "space-econ",
            "derivative",
            "price-elasticity",
            RelationType::UsedIn,
            0.6,
            0.8,
            "한 점에서의 점탄력성 계산은 도함수를 활용해 이루어진다.",
            now,
        ),
        rel(
            "space-econ",
            "base-rate",
            "investment",
            RelationType::Causes,
            0.8,
            0.85,
            "기준금리 변동은 자금 조달 비용을 바꿔 기업 투자의 증감을 일으킨다.",
            now,
        ),
        rel(
            "space-econ",
            "base-rate",
            "inflation",
            RelationType::Solves,
            0.85,
            0.9,
            "기준금리 인상은 총수요를 억제해 인플레이션을 잡는 대표적 통화정책 수단이다.",
            now,
        ),
        rel(
            "space-econ",
            "inflation",
            "deflation",
            RelationType::Contrasts,
            0.9,
            0.95,
            "인플레이션은 물가의 지속 상승, 디플레이션은 지속 하락으로 서로 대비되는 개념이다.",
            now,
        ),
        rel(
            "space-econ",
            "investment",
            "gdp",
            RelationType::PartOf,
            0.85,
            0.9,
            "투자는 국내총생산의 지출 구성(C+I+G+NX) 가운데 한 항목이다.",
            now,
        ),
        rel(
            "space-econ",
            "nominal-gdp",
            "gdp",
            RelationType::Prerequisite,
            0.8,
            0.9,
            "국내총생산 개념을 먼저 알아야 그것을 경상가격으로 잰 명목GDP를 이해할 수 있다.",
            now,
        ),
    ];
    SpaceSeed {
        space: space("space-econ", "경제학", "경제학", now),
        subjects: vec![
            subject("subject-econ", "space-econ", "경제원론", "#e8590c", now),
            subject("subject-calculus", "space-econ", "미적분학", "#0075de", now),
        ],
        notes: vec![(
            archive.clone(),
            note("space-econ", "subject-econ", "source-econ-lecture", "경제원론 2장 — 시장의 작동 (강의 필기)", "수요곡선이랑 공급곡선이 만나는 점에서 **시장균형** — 균형가격에선 초과수요·초과공급 0. 가격이 변하면 수요량이 얼마나 반응하는지가 **가격탄력성**(수요량 변화율 ÷ 가격 변화율), 이게 수요·공급 이론의 핵심 파트라고 하심. **한계비용** MC는 총비용을 생산량으로 미분한 값 dTC/dQ — 미적분학에서 배운 **미분(도함수)** 그대로 나와서 놀람, 탄력성 계산도 점탄력성은 도함수 쓴다고. 거시 맛보기: **기준금리** 올리면 자금 비용 올라서 **투자** 줄고, 그걸로 **인플레이션** 잡는다 — **디플레이션**은 반대로 물가가 계속 떨어지는 거니까 헷갈리지 말 것. **국내총생산** GDP = C+I+G+NX 라서 투자도 그 한 항목이고, **명목GDP**는 그 해 가격으로 잰 거라 실질GDP랑 구분해야 함.", now),
        )],
        wikis: with_source(
            vec![
            ("supply-and-demand.md".into(), wiki("space-econ", "subject-econ", "supply-and-demand", "수요·공급", "# 수요·공급\n\n시장에서 가격과 거래량이 결정되는 기본 원리. 수요곡선과 공급곡선이 만나는 점에서 시장이 균형에 이르고, 그 반응 정도를 탄력성으로 잰다.", now)),
            ("market-equilibrium.md".into(), wiki("space-econ", "subject-econ", "market-equilibrium", "시장균형", "# 시장균형\n\n수요량과 공급량이 일치하여 가격이 더 움직일 유인이 없는 상태. 이때의 가격을 균형가격, 거래량을 균형거래량이라 하며 초과수요와 초과공급이 모두 0이다. 가격이 균형보다 높으면 초과공급으로 하락 압력이, 낮으면 초과수요로 상승 압력이 생겨 시장은 균형으로 수렴한다. [[수요·공급]]의 틀 위에서 정의되는 개념이다.", now)),
            ("price-elasticity.md".into(), wiki("space-econ", "subject-econ", "price-elasticity", "가격탄력성", "# 가격탄력성\n\n가격이 1% 변할 때 수요량(또는 공급량)이 몇 % 변하는지를 나타내는 지표. 수요의 가격탄력성은 수요량 변화율을 가격 변화율로 나눈 값으로, 절댓값이 1보다 크면 탄력적, 작으면 비탄력적이라 한다. [[수요·공급]] 이론에서 시장이 가격 변화에 얼마나 민감하게 반응하는지를 재는 도구이며, 기업의 가격 전략이나 조세 부담의 귀착 분석에 쓰인다. 한 점에서의 점탄력성은 [[미분(도함수)]]를 이용해 계산한다.", now)),
            ("marginal-cost.md".into(), wiki("space-econ", "subject-econ", "marginal-cost", "한계비용", "# 한계비용\n\n생산량을 한 단위 더 늘릴 때 추가로 드는 비용. 총비용함수 TC(Q)를 생산량 Q로 미분한 값 MC = dTC/dQ 로 정의되며, 수학적으로는 [[미분(도함수)]] 그 자체다. 완전경쟁시장에서 기업은 가격과 한계비용이 같아지는(P = MC) 수준까지 생산하여 이윤을 극대화하며, 이 조건이 개별 기업의 공급곡선과 [[시장균형]] 분석의 토대가 된다.", now)),
            ("base-rate.md".into(), wiki("space-econ", "subject-econ", "base-rate", "기준금리", "# 기준금리\n\n중앙은행이 금융기관과 자금을 거래할 때 기준으로 삼는 정책금리로, 한국에서는 한국은행 금융통화위원회가 결정한다. 기준금리를 올리면 시중금리가 따라 올라 가계 소비와 기업 [[투자]]가 위축되고 총수요가 줄어 물가 상승 압력이 낮아진다. 반대로 내리면 돈을 빌리기 쉬워져 경기를 부양하는 효과가 있어, [[인플레이션]] 대응의 대표적 통화정책 수단으로 쓰인다.", now)),
            ("inflation.md".into(), wiki("space-econ", "subject-econ", "inflation", "인플레이션", "# 인플레이션\n\n물가수준이 지속적으로 상승하는 현상. 같은 돈으로 살 수 있는 재화가 줄어들므로 화폐의 구매력이 떨어진다. 총수요가 늘어 생기는 수요견인 인플레이션과, 원자재 가격 등 생산비 상승으로 생기는 비용인상 인플레이션으로 구분하며, 중앙은행은 [[기준금리]] 인상으로 대응한다. 물가가 지속적으로 하락하는 [[디플레이션]]과 반대되는 개념이다.", now)),
            ("deflation.md".into(), wiki("space-econ", "subject-econ", "deflation", "디플레이션", "# 디플레이션\n\n물가수준이 지속적으로 하락하는 현상으로, [[인플레이션]]의 반대 개념이다. 물가가 더 떨어질 것이라는 기대가 소비와 투자를 미루게 만들고, 이것이 다시 수요 감소와 물가 하락으로 이어지는 악순환(디플레이션 소용돌이)을 일으킬 수 있다. 실질 채무 부담을 키워 경기침체를 깊게 만들기 때문에 인플레이션 못지않게 경계 대상이다.", now)),
            ("investment.md".into(), wiki("space-econ", "subject-econ", "investment", "투자", "# 투자\n\n거시경제학에서 투자는 기업의 설비·건설 지출과 재고 변동 등 미래의 생산능력을 늘리기 위한 지출을 뜻하며, 금융자산 매매와는 구별된다. [[국내총생산]]을 지출 측면에서 분해한 C + I + G + NX 가운데 I 에 해당한다. 자금을 빌려 이루어지는 경우가 많아 이자율, 특히 [[기준금리]] 변동에 민감하게 반응한다.", now)),
            ("gdp.md".into(), wiki("space-econ", "subject-econ", "gdp", "국내총생산", "# 국내총생산\n\n일정 기간 동안 한 나라 안에서 생산된 모든 최종 재화와 서비스의 시장가치를 합한 값(GDP). 한 경제의 생산 규모를 나타내는 대표적 지표다. 지출 측면에서는 소비(C) + [[투자]](I) + 정부지출(G) + 순수출(NX)로 구성되며, 어느 해의 가격으로 평가하느냐에 따라 [[명목GDP]]와 실질GDP로 나뉜다.", now)),
            ("nominal-gdp.md".into(), wiki("space-econ", "subject-econ", "nominal-gdp", "명목GDP", "# 명목GDP\n\n해당 연도의 시장가격(경상가격)으로 계산한 [[국내총생산]]. 생산량 변화와 물가 변화가 함께 섞여 있어, 물가가 오르기만 해도 커질 수 있다. 그래서 실제 생산의 변화를 보려면 기준연도 가격으로 계산한 실질GDP와 비교해야 하며, 두 값의 비율(명목GDP ÷ 실질GDP × 100)이 물가지표인 GDP 디플레이터가 된다.", now)),
            ("derivative.md".into(), wiki("space-econ", "subject-calculus", "derivative", "미분(도함수)", "# 미분(도함수)\n\n함수의 순간 변화율을 나타내는 개념. 도함수 f′(x)는 x가 아주 조금 변할 때 f(x)가 얼마나 변하는지의 극한값으로 정의된다. 경제학의 '한계(marginal)' 개념 — [[한계비용]], 한계수입, 한계효용 — 은 모두 해당 함수의 도함수이며, [[가격탄력성]] 같은 반응도 지표 계산에도 쓰인다. 미적분학에서 배우지만 경제 분석 전반의 수학적 언어 역할을 한다.", now)),
            ],
            "source-econ-lecture",
        ),
        relations: with_evidence(relations, "source-econ-lecture", &archive),
    }
}

fn physiology(now: &str) -> SpaceSeed {
    let archive = format!("{}-physio-endocrine.md", storage::today());
    let relations = vec![
        rel(
            "space-physio",
            "cell",
            "tissue",
            RelationType::PartOf,
            0.9,
            0.95,
            "세포는 조직을 이루는 한 부분이에요.",
            now,
        ),
        rel(
            "space-physio",
            "tissue",
            "organ",
            RelationType::PartOf,
            0.9,
            0.95,
            "조직은 기관을 이루는 한 부분이에요.",
            now,
        ),
        rel(
            "space-physio",
            "organ",
            "organ-system",
            RelationType::PartOf,
            0.9,
            0.95,
            "기관은 기관계를 이루는 한 부분이에요.",
            now,
        ),
        rel(
            "space-physio",
            "insulin",
            "hyperglycemia",
            RelationType::Solves,
            0.9,
            0.95,
            "인슐린으로 높아진 혈당인 고혈당을 낮춰 해결할 수 있어요.",
            now,
        ),
        rel(
            "space-physio",
            "insulin",
            "glucagon",
            RelationType::Contrasts,
            0.85,
            0.9,
            "인슐린과 글루카곤은 혈당을 낮추고 올리는 서로 대비되는 길항 호르몬이에요.",
            now,
        ),
        rel(
            "space-physio",
            "concentration-gradient",
            "diffusion",
            RelationType::Causes,
            0.85,
            0.9,
            "농도 기울기가 입자를 이동시켜 확산을 일으켜요.",
            now,
        ),
        rel(
            "space-physio",
            "concentration-gradient",
            "osmosis",
            RelationType::Causes,
            0.8,
            0.85,
            "농도 기울기가 물의 이동을 일으켜 삼투를 만들어요.",
            now,
        ),
        rel(
            "space-physio",
            "diffusion",
            "osmosis",
            RelationType::ConfusedWith,
            0.75,
            0.85,
            "확산과 삼투는 물질 이동 방식이라 서로 헷갈리기 쉬워요.",
            now,
        ),
        rel(
            "space-physio",
            "sympathetic-nerve",
            "parasympathetic-nerve",
            RelationType::Contrasts,
            0.85,
            0.9,
            "교감신경과 부교감신경은 긴장과 안정으로 서로 대비되는 자율신경이에요.",
            now,
        ),
    ];
    SpaceSeed {
        space: space("space-physio", "생리학", "생리학", now),
        subjects: vec![
            subject("subject-physio", "space-physio", "인체생리학", "#2a9d99", now),
            subject("subject-chem", "space-physio", "일반화학", "#0075de", now),
        ],
        notes: vec![(
            archive.clone(),
            note("space-physio", "subject-physio", "source-physio-endocrine", "인체생리학 7장 내분비 · 세포 구성단계 필기", "7/10 생리학 7장 내분비\n- 몸 구성 단계: 세포 → 조직 → 기관 → 기관계 (작은 게 모여 큰 거 이룸!). 조직 = 비슷한 세포들 모임, 기관 = 여러 조직, 기관계 = 여러 기관.\n- 인슐린: 이자 β세포에서 분비. 포도당을 세포 안으로 넣어서 혈당 낮춤. 반대로 글루카곤(α세포)은 혈당 올림 → 둘이 길항!!\n- 인슐린 부족/작용저하 → 고혈당 → 당뇨. 그래서 인슐린으로 고혈당을 잡는다.\n- 물질 이동: 확산 = 농도 높은 데→낮은 데, 에너지 필요 X. 화학 시간에 배운 '농도 기울기'가 확산의 원인. 삼투는 물(용매) 버전 (반투막) — 확산이랑 헷갈리지 말기!\n- 자율신경: 교감(긴장·투쟁도피) vs 부교감(안정·휴식) 서로 반대로 작용.", now),
        )],
        wikis: with_source(
            vec![
            ("organ-system.md".into(), wiki("space-physio", "subject-physio", "organ-system", "기관계", "# 기관계\n공통된 생리 기능을 수행하기 위해 여러 [[기관]]이 모여 이룬 상위 구조 단위다. 소화계·순환계·내분비계처럼 하나의 통합된 기능을 담당한다. 인체는 여러 기관계가 서로 협력하며 항상성을 유지한다.", now)),
            ("organ.md".into(), wiki("space-physio", "subject-physio", "organ", "기관", "# 기관\n서로 다른 [[조직]]들이 모여 특정 기능을 수행하는 구조 단위다. 위·심장·이자처럼 뚜렷한 형태와 기능을 가진다. 여러 기관이 모여 [[기관계]]를 이룬다.", now)),
            ("tissue.md".into(), wiki("space-physio", "subject-physio", "tissue", "조직", "# 조직\n비슷한 형태와 기능을 가진 [[세포]]들이 모여 이룬 단위다. 상피·결합·근육·신경 조직의 네 가지 기본 유형으로 나뉜다. 조직이 모여 [[기관]]을 구성한다.", now)),
            ("cell.md".into(), wiki("space-physio", "subject-physio", "cell", "세포", "# 세포\n생명체의 구조적·기능적 기본 단위다. 세포막으로 둘러싸여 있으며 물질대사·증식 등 생명 활동을 수행한다. 같은 종류의 세포가 모여 [[조직]]을 이룬다.", now)),
            ("insulin.md".into(), wiki("space-physio", "subject-physio", "insulin", "인슐린", "# 인슐린\n이자의 β세포에서 분비되는 호르몬. 혈중 포도당을 세포 안으로 흡수시켜 높아진 혈당을 낮춘다. 혈당을 올리는 [[글루카곤]]과 길항적으로 작용한다.", now)),
            ("glucagon.md".into(), wiki("space-physio", "subject-physio", "glucagon", "글루카곤", "# 글루카곤\n이자의 α세포에서 분비되는 호르몬. 간에 저장된 글리코겐을 포도당으로 분해해 혈당을 높인다. 혈당을 낮추는 [[인슐린]]과 길항적으로 작용하여 혈당 항상성을 유지한다.", now)),
            ("hyperglycemia.md".into(), wiki("space-physio", "subject-physio", "hyperglycemia", "고혈당", "# 고혈당\n혈중 포도당 농도가 정상 범위보다 높은 상태다. [[인슐린]] 분비 부족이나 작용 저하로 발생하며, 지속되면 당뇨병의 주요 지표가 된다.", now)),
            ("diffusion.md".into(), wiki("space-physio", "subject-physio", "diffusion", "확산", "# 확산\n입자가 농도가 높은 곳에서 낮은 곳으로 스스로 퍼져 나가는 현상이다. [[농도 기울기]]를 따라 일어나며 별도의 에너지가 필요 없다. 세포막을 사이에 둔 산소·이산화탄소 이동이 대표적 예다.", now)),
            ("osmosis.md".into(), wiki("space-physio", "subject-physio", "osmosis", "삼투", "# 삼투\n반투과성 막을 사이에 두고 용매인 물이 용질 농도가 낮은 쪽에서 높은 쪽으로 이동하는 현상이다. 물이 [[농도 기울기]]를 따라 확산하는 특수한 경우로, [[확산]]과 자주 혼동된다.", now)),
            ("sympathetic-nerve.md".into(), wiki("space-physio", "subject-physio", "sympathetic-nerve", "교감신경", "# 교감신경\n자율신경계의 한 갈래로, 몸을 긴장·활동 상태로 만드는 '투쟁-도피' 반응을 담당한다. 심박수를 올리고 동공을 확대하며 소화를 억제한다. [[부교감신경]]과 길항적으로 작용해 내부 환경을 조절한다.", now)),
            ("parasympathetic-nerve.md".into(), wiki("space-physio", "subject-physio", "parasympathetic-nerve", "부교감신경", "# 부교감신경\n자율신경계의 한 갈래로, 몸을 안정·휴식 상태로 만든다. 심박수를 낮추고 소화를 촉진하는 '휴식-소화' 반응을 담당한다. [[교감신경]]과 길항적으로 작용한다.", now)),
            ("concentration-gradient.md".into(), wiki("space-physio", "subject-chem", "concentration-gradient", "농도 기울기", "# 농도 기울기\n공간에 따라 물질의 농도가 달라지는 정도를 뜻한다. 입자는 농도가 높은 쪽에서 낮은 쪽으로 이동하려는 경향을 가지며, 이것이 [[확산]]과 [[삼투]]를 일으키는 근본 원인이다. 화학·물리에서 물질 이동을 설명하는 기본 개념이다.", now)),
            ],
            "source-physio-endocrine",
        ),
        relations: with_evidence(relations, "source-physio-endocrine", &archive),
    }
}
