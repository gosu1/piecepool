# ADR-0001: LLM provider — OpenAI 단일

- 상태: 채택 (Accepted)
- 일자: 2026-06-30
- 관련: [pricing-model](../00-overview/pricing-model.md) · [provider-config](../30-llm/provider-config.md) · [ADR-0002](0002-single-tier-pricing.md)

## 배경

LLM은 Wiki 생성·타입 그래프 관계 추출·일반 추론에 쓰인다. provider를 하나로 고정해 어댑터·검증·eval 경로를 단일화할 필요가 있었다. 한편 feature 3(정보 간극 메우기, label↔user)은 권위 있는 출처를 검색해 정답 기준(label)을 세우는 별도 역량이 필요하다.

## 결정

LLM provider를 **OpenAI 단일**로 확정한다. 출력은 OpenAI Responses API의 structured output(`json_schema`, `strict: true`)으로 받아 [`LlmWikiResult`](../10-contracts/llm-output-schema.md)로 정규화한다. feature 3(정보 간극 메우기, label↔user)의 출처 기반 검색·답변·fact-check는 **Liner API**를 주 해결책으로 두고, OpenAI는 Liner 미가용 시 소크라테스식 되묻기 질문 생성으로 보조한다.

## 결과

- (+) 어댑터·검증·eval 경로가 단일화되어 유지비 감소.
- (+) structured output strict로 스키마 준수 강제.
- (−) 클라우드 API 전제 — 키를 설정에 입력해 사용한다.
- 환경변수: `OPENAI_API_KEY`(필수), `PIECEPOOL_LLM_MODEL`(override), `LINER_API_KEY`(feature 3 출처 검색; 필요 시 `LINER_API_ENDPOINT`).

## 대안

- feature 3을 OpenAI만으로 처리: 출처(provenance)·fact-check 근거가 약해 기각. Liner를 주 해결책으로, OpenAI를 보조로 둔다.
