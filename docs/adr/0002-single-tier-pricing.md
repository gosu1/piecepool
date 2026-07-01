# ADR-0002: 단일 tier — freemium 폐기

- 상태: 채택 (Accepted)
- 일자: 2026-06-30
- 관련: [pricing-model](../00-overview/pricing-model.md) · [ADR-0001](0001-llm-provider-openai.md)

## 배경

초기에는 Free / Premium 2-tier를 검토했으나, provider를 OpenAI 단일([ADR-0001](0001-llm-provider-openai.md))로 확정하고 경진대회 출품 범위로 좁히면서 tier를 나눌 근거가 사라졌다.

## 결정

가격 구조를 **단일 tier**로 한다(경진대회 출품, 과금 없음). Free/Premium 플랜 구분·과금 UI 없음. 되묻기(clarify)·fact-check는 유료 플랜이 아니라 **기본 on, env 토글**로 제어하는 기능이다(`PIECEPOOL_PREMIUM_*`는 레거시 이름의 기능 토글, 유료 tier 아님, 기본 true).

## 결과

- (+) 플랜 분기 코드·UI 제거.
- (−) 기존 문서의 "Premium" 표현이 잔재로 남음 → 점진 정리 필요(레거시 env 이름 포함).

## 대안

- 2-tier 유지: 단일 provider·경진대회 범위에서 Free/Premium을 나눌 실익이 없어 기각.
