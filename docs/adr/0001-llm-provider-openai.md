# ADR-0001: LLM provider — OpenAI 단일

- 상태: 채택 (Accepted)
- 일자: 2026-06-30
- 관련: [pricing-model](../00-overview/pricing-model.md) · [provider-config](../30-llm/provider-config.md) · [ADR-0002](0002-single-tier-pricing.md)

## 배경

초기에는 OpenAI + 로컬 llama.cpp(Gemma) + Gemini 하이브리드를 검토했다. 로컬 provider는 sidecar 수명주기·GGUF 배포·품질 편차·플랫폼 분기 비용이 컸고, Gemini는 `responseSchema`가 OpenAPI subset이라 변환 부담이 있었다.

## 결정

LLM provider를 **OpenAI 단일**로 확정한다. 로컬(Gemma)·Gemini 어댑터를 제거한다. 출력은 OpenAI Responses API의 structured output(`json_schema`, `strict: true`)으로 받아 [`LlmWikiResult`](../10-contracts/llm-output-schema.md)로 정규화한다.

## 결과

- (+) 어댑터·검증·eval 경로가 단일화되어 유지비 감소.
- (+) structured output strict로 스키마 준수 강제.
- (−) 오프라인 동작 불가 — 키 없을 때는 heuristic fallback(마크다운 `##` 분할)로만 축소 동작.
- 환경변수: `OPENAI_API_KEY`(필수), `PIECEPOOL_LLM_MODEL`(override).

## 대안

- 하이브리드 유지: 운영 복잡도·품질 편차로 기각.
- Gemini 단독: structured output 호환성·생태계 성숙도로 기각.
