# Open Questions

구현 결정이 보류된 항목. **결정 시 본 문서에서 해당 항목을 삭제하고 결정 내용을 관련 문서로 옮긴다**.

> 본 문서는 [`docs/archive/PRD-v1.md`](../archive/PRD-v1.md) §18에서 분리하고, 리팩토링 과정에서 발견된 보류 항목을 추가한 결과다.

---

## 1. 라이브러리 / 도구 선택

| 항목 | 후보 | 책임자 | 결정 기한 |
|---|---|---|---|
| Markdown 편집기 라이브러리 | TipTap, Lexical, CodeMirror 6, Monaco | Frontend (#2) | Phase 4 시작 시 |
| Graph 렌더링 라이브러리 | D3, Cytoscape.js, Sigma.js, React Flow, vis.js | @gosu1 (Graph 전체 담당) | Phase 4 시작 시 |
| Tauri PDF 파싱 방식 | `pdfium`, `pdf-extract` (Rust), `pdf.js` (Frontend), 외부 CLI | Backend (#1) | Phase 4 `pdf-extraction.md` 작성 시 |
| **OCR 라이브러리** (신규) | Tesseract.js, Apple Vision, 외부 OCR API (Google Vision, Mathpix), 로컬 모델 | Frontend (#2) | Phase 4 `ocr-client.md` 작성 시 |
| 코드 사이닝 (macOS) | Apple Developer Program, ad-hoc, notarization 정책 | Frontend (#2) | `.dmg`/`.pkg` 빌드 도입 시 |

---

## 2. LLM / Provider

| 항목 | 옵션 | 책임자 | 결정 기한 |
|---|---|---|---|
| LLM provider 세부 schema 구현 | OpenAI Responses, Gemini `responseSchema`, Ollama `format: "json"` | LLM (#3) | Phase 4 `provider-config.md` |
| Relation 메타데이터 저장 위치 | 단일 `relations.json`, wiki frontmatter 병행, 하이브리드 | Backend (#1) + LLM (#3) | Phase 4 `import-pipeline.md` |
| Ollama 외 로컬 backend | MLX, llama.cpp 도입 시점·우선순위 | LLM (#3) | Phase 4 이후 검토 |
| **Gemini 결제/키 관리** (신규) | 사용자 자체 키 vs PiecePool 구독, BYOK 정책 | PM (@gosu1) | MVP+1 결제 시스템 설계 시 |
| **Premium fact-check 도구** (신규) | LLM 자체 web search 도구 vs 별도 검색 API (Brave, Tavily, SerpAPI) | LLM (#3) + Backend (#1) | Phase 4 `output-validation.md` |
| **되묻기 트리거 임계값** (신규) | `confidence < ?`, 입력 길이 임계값, Concept 일반성 판정 기준 | Backend (#1) | Phase 4 `import-pipeline.md` |

---

## 3. UX / 흐름

| 항목 | 옵션 | 책임자 | 결정 기한 |
|---|---|---|---|
| 첫 진입 INBOX UI | 빈 상태 / 시드 데모 / 튜토리얼 | Design (#4) + Frontend (#2) | Phase 4 `screens/inbox.md` |
| 되묻기 UI 모달 vs 인라인 | Source 단위 / Concept 단위 / batch | Design (#4) + Frontend (#2) | Phase 4 `component-states.md` |
| Fact-check 결과 표시 | suggest 패널 / inline diff / 별도 화면 | Design (#4) + Frontend (#2) | Phase 4 `screens/wiki-view.md` |
| Free/Premium 토글 위치 | 설정 화면 / 헤더 / 사이드바 | Design (#4) | Phase 4 `screens/workspace.md` |
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
| LLM provider 방향 | 3-provider hybrid (Local + OpenAI + Gemini) | 2026-05-28 | [pricing-model](pricing-model.md) |
| OCR MVP 포함 여부 | MVP 포함 (Frontend 책임) | 2026-05-28 | [scope-mvp §4](scope-mvp.md) |
| 프롬프트 설계 소유 | Backend 주도 + LLM adapter 분리 | 2026-05-28 | [30-llm/README](../30-llm/README.md) |
| Freemium 정보 위치 | 신규 `docs/00-overview/pricing-model.md` | 2026-05-28 | [pricing-model](pricing-model.md) |
| `mvp.md` 빈 파일 | 삭제 | 2026-05-28 | (파일 제거됨) |
| 로컬 LLM 기본 backend | Ollama | 2026-05-28 | [30-llm/README](../30-llm/README.md) |
| 협업 모델 | 실제 팀 (Backend 3인, Frontend 2인, LLM/Design 각 1인) | 2026-05-28 | [CODEOWNERS](../../.github/CODEOWNERS) |

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
- "신규" 표시 항목은 PRD-v1에 없던 보류 사항이다 (OCR, Gemini, 되묻기, fact-check, Branch protection, CI 등).
