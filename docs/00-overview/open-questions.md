# Open Questions

구현 결정이 보류된 항목. **결정 시 본 문서에서 해당 항목을 삭제하고 결정 내용을 관련 문서로 옮긴다**.

> 본 문서는 [`docs/archive/PRD-v1.md`](../archive/PRD-v1.md) §18에서 분리하고, 리팩토링 과정에서 발견된 보류 항목을 추가한 결과다.

---

## 1. 라이브러리 / 도구 선택

| 항목 | 후보 | 책임자 | 결정 기한 |
|---|---|---|---|
| 코드 사이닝 (macOS) | Apple Developer Program, ad-hoc, notarization 정책 | Frontend (#2) | `.dmg`/`.pkg` 빌드 도입 시 |
| **OCR 보강 옵션** (신규, post-MVP) | Apple Vision (네이티브), Google Vision API, Mathpix — 오프라인 제약·플랫폼 분기 비용 때문에 MVP는 vision LLM 단일 경로로 결정. 후속 검토용 후보만 기록 | Frontend (#2) | post-MVP |

---

## 2. LLM / Provider

| 항목 | 옵션 | 책임자 | 결정 기한 |
|---|---|---|---|
| Relation 메타데이터 저장 위치 | 단일 `relations.json`, wiki frontmatter 병행, 하이브리드 | Backend (#1) + LLM (#3) | Phase 4 `import-pipeline.md` |
| **fact-check 도구** | Liner 출처 검색 API(feature 3 주 해결책) + Gemini 소크라테스식 되묻기(보조) 결정 ✅. 추가 외부 검색 API 도입 여부는 보류 | LLM (#3) + Backend (#1) | MVP+1 |
| **되묻기 트리거 임계값** | `confidence < 0.5` 기본 명시 ([output-validation §6.1](../30-llm/output-validation.md)). 입력 길이 / 일반성 기준은 Backend `prompt-design.md`에서 구체화 | Backend (#1) | Phase 4 `import-pipeline.md` / `prompt-design.md` |
| **JSON Schema 검증 라이브러리** (신규) | `ajv` / `zod` / json-schema-to-zod | LLM (#3) | Phase 4 코드 작성 시 |
| **similarity 측정 모델** (신규) | Gemini `gemini-embedding-001` / Cohere | LLM (#3) | Concept 중복 판정 구현 시 |
| **되묻기 timeout** (신규) | 5분 기본 가정. 실제 UX 검증 후 조정 | Backend (#1) + Design (#4) | Phase 4 `screens/import.md` |
| **eval-baseline-change 라벨** (신규) | 골든 케이스 기대 결과 변경 PR에 부착할 라벨 신설 | @gosu1 | evals fixtures 실제 작성 PR 직전 |

---

## 3. UX / 흐름

| 항목 | 옵션 | 책임자 | 결정 기한 |
|---|---|---|---|
| 첫 진입 INBOX UI | 빈 상태 / 시드 데모 / 튜토리얼 | Design (#4) + Frontend (#2) | Phase 4 `screens/inbox.md` |
| 되묻기 UI 모달 vs 인라인 | Source 단위 / Concept 단위 / batch | Design (#4) + Frontend (#2) | Phase 4 `component-states.md` |
| Fact-check 결과 표시 | suggest 패널 / inline diff / 별도 화면 | Design (#4) + Frontend (#2) | Phase 4 `screens/wiki-view.md` |
| Subject 즉시 생성 위치 | Import 화면 inline / 모달 / 사이드바 dropdown | Design (#4) + Frontend (#2) | Phase 4 |

---

## 4. 인프라 / 운영

| 항목 | 옵션 | 책임자 | 결정 기한 |
|---|---|---|---|
| **Branch protection rule** (신규) | `require Code Owners review`, 최소 approval 수 | @gosu1 | 즉시 (GitHub Settings에서 수동) |
| **CI 자동 검증** (신규) | `markdown-link-check`, `prettier`, SSOT grep, `cargo check`, `npm test` 통합 | @gosu1 | Phase 5 |
| **자동 릴리즈** | tag → `.dmg`/`.pkg` 빌드 자동화 (GitHub Actions, Tauri Action) | Frontend (#2) | MVP 출시 직전 |
| **에러 로깅** | Sentry vs 로컬 파일 vs 자체 서버 | Backend (#1) | Phase 4 `error-handling.md` |

---

## 5. 데이터 / 모델

| 항목 | 옵션 | 책임자 | 결정 기한 |
|---|---|---|---|
| Relation `strength` 자동 점수화 | LLM 부여 값 vs 가중 합산 (`semanticSimilarity` + `coOccurrence` + `llmConfidence` + `userInteraction` + `goalRelevance`) | LLM (#3) | MVP 이후 ([post-mvp](../70-roadmap/) 참조) |
| Concept 중복 판정 threshold | `normalizedTitle` 완전 일치 vs 임베딩 유사도 | LLM (#3) + Backend (#1) | Phase 4 `import-pipeline.md` |
| WikiPage 본문 LLM 재생성 정책 | 매번 덮어쓰기 vs 사용자 편집 보존 vs 3-way merge | Backend (#1) | Phase 4 `import-pipeline.md` |

---

## 6. 결정된 항목 (참고)

이미 결정된 항목은 본 문서에서 제거했지만 추적용으로 일부 기록한다.

| 항목 | 결정 | 결정 일자 | 위치 |
|---|---|---|---|
| LLM provider 방향 | OpenAI 단일 LLM provider | 2026-05-28 | [pricing-model](pricing-model.md) |
| OCR MVP 포함 여부 | MVP 포함 (Frontend 책임) | 2026-05-28 | [scope-mvp §4](scope-mvp.md) |
| 프롬프트 설계 소유 | Backend 주도 + LLM adapter 분리 | 2026-05-28 | [30-llm/README](../30-llm/README.md) |
| LLM tier 구조 | 단일 tier (OpenAI LLM + Liner 출처 검색) | 2026-06-30 | [pricing-model](pricing-model.md) |
| evals 실행 도구 | TS 자체 스크립트 + tsx 실행 | 2026-06-29 | [30-llm/evals §4.4](../30-llm/evals.md) |
| `mvp.md` 빈 파일 | 삭제 | 2026-05-28 | (파일 제거됨) |
| 협업 모델 | 실제 팀 (Backend 3인, Frontend 2인, LLM/Design 각 1인) | 2026-05-28 | [CODEOWNERS](../../.github/CODEOWNERS) |
| LLM provider 세부 schema 구현 | OpenAI Responses (`response_format: json_schema strict`) + adapter 검증 | 2026-05-29 | [provider-config §3](../30-llm/provider-config.md) |
| LLM 호출 재시도 정책 | 매트릭스 (시나리오별 재시도 여부), schema 위반 시 prompt 보강 | 2026-05-29 | [output-validation §4](../30-llm/output-validation.md) |
| LLM 출력 부분 실패 처리 | 유효 부분만 저장 + `ImportJob.errorMessage`에 정량 기록 | 2026-05-29 | [output-validation §5](../30-llm/output-validation.md) |
| 되묻기 round-trip 구조 | 최대 1회, 트리거 매트릭스 정의, 사용자 timeout 시 1차 결과 저장 | 2026-05-29 | [output-validation §6](../30-llm/output-validation.md) |
| 골든 케이스 카탈로그 MVP | 7건 (case-001 ~ case-007) | 2026-05-29 | [evals §3](../30-llm/evals.md) |
| LLM 오류 메시지 한국어 표준 | 6 분류 (`auth`/`network`/`rate_limit`/`schema`/`empty`/`partial`) | 2026-05-29 | [output-validation §7](../30-llm/output-validation.md) |
| OCR 라이브러리 | 별도 OCR 엔진 없음 — vision-capable LLM 호출(GPT vision) 단일 경로 | 2026-06-22 | [ocr-client.md](../40-frontend/ocr-client.md) |
| Markdown 편집기 라이브러리 | CodeMirror 6 (`@uiw/react-codemirror`). 미리보기는 분리, wikilink-embed 커스텀 렌더링과 충돌하는 올인원/WYSIWYG 계열 제외 | 2026-06-25 | [40-frontend/screens/markdown-editor.md §2](../40-frontend/screens/markdown-editor.md) |
| Graph 렌더링 라이브러리 | Cytoscape.js | 2026-07-01 | [ADR-0006](../adr/0006-graph-rendering-cytoscape.md) |
| PDF 텍스트 추출 | `pdf-extract` 0.10.0 (Rust) | 2026-07-01 | [ADR-0005](../adr/0005-pdf-extract-crate.md) · [pdf-extraction.md](../20-backend/pdf-extraction.md) |
| LLM provider 전환 | **Google Gemini 단일** (OpenAI 대체) — OpenAI 호환 Chat Completions(`response_format`, `strict:false`), Responses API·GPT vision 폐기 | 2026-07-10 | [ADR-0009](../adr/0009-llm-provider-gemini.md) |

---

## 7. 결정 절차

1. 본 문서에서 해당 항목 항 클릭하여 issue 생성
2. issue에서 토론 + 결정
3. 결정 내용을 관련 문서(`10-contracts/`, `20-backend/`, `30-llm/`, `40-frontend/`, `50-design/`, `pricing-model.md` 등)에 반영
4. 본 문서에서 해당 항목 제거, §6 결정된 항목 표에 1줄 기록

SSOT 관련 결정(`10-contracts/` 영향)은 `contracts-change` 라벨 + 4역할 review 필수.

---

## 8. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §18 (line 1142-1152)을 분리·확장한 결과다.
- 라이브러리/도구 선택(§1), LLM/Provider(§2), UX(§3), 인프라/운영(§4), 데이터/모델(§5)로 구조화는 본 리팩토링에서 신규 정리했다.
- "신규" 표시 항목은 PRD-v1에 없던 보류 사항이다 (OCR, 되묻기, fact-check, Branch protection, CI 등).
