# Developer Handoff

PiecePool 신규 합류자 진입 문서. README는 전체 nav, 본 문서는 작업 시작 절차.

> 리팩토링 후 갱신본. 최신 상세는 `docs/` 트리.

---

## 1. 읽는 순서

1. **[README.md](README.md)** — 전체 nav, Phase 상태, 협업 규칙
2. **[`docs/00-overview/`](docs/00-overview/)** — 비전 / MVP scope / 용어 / 플랜 / 열린 질문 (5 문서)
3. **본인 역할 폴더** — Backend / Frontend / LLM / Design / QA
4. **[`docs/10-contracts/`](docs/10-contracts/)** — 공유 계약 6 문서 (SSOT)
5. **[GitHub Issues](https://github.com/gosu1/piecepool/issues)** — 본인 할당 Phase 4 작업

---

## 2. 작업 시작 절차

### 2.1 환경 요구사항
- macOS (Apple Silicon 권장)
- Node.js 20+
- Rust + cargo (Tauri 빌드)
- Ollama (Free 플랜 테스트용)

### 2.2 환경변수

```bash
# 공통
export PIECEPOOL_LLM_PROVIDER=local                  # local|openai|gemini (기본 local=Free)
export PIECEPOOL_LLM_MODEL=...                       # provider별 기본값

# Free (local Ollama)
export PIECEPOOL_LOCAL_LLM_ENDPOINT=http://localhost:11434
export PIECEPOOL_LOCAL_LLM_BACKEND=ollama            # MVP 기본 (MLX/llamacpp는 후속)

# Premium 옵션 (택 1)
export OPENAI_API_KEY="..."                          # OpenAI GPT
export GEMINI_API_KEY="..."                          # Google Gemini

# Premium 기능 토글
export PIECEPOOL_PREMIUM_FACT_CHECK=true
export PIECEPOOL_PREMIUM_CLARIFY=true
```

### 2.3 본인 sub-issue claim
1. [Phase 4 milestone](https://github.com/gosu1/piecepool/milestone/4) 진입
2. 본인 `role:*` 라벨로 필터
3. 작업 sub-issue 선택
4. Parent tracking issue (#1~#5)의 체크박스 옆 `(담당: @핸들)` 표기
5. Feature branch 생성 → 작업 → PR

### 2.4 PR 생성
- PR template이 자동 등장 (영향 영역 / Phase / SSOT 체크 / 검증 절차)
- `docs/10-contracts/` 수정 시 `contracts-change` 라벨 부착 + 4역할 review 요청
- CI docs-check 자동 실행 (link / SSOT / prettier). 통과 확인

---

## 3. 작업 규약 (절대 변경 금지)

서준 결정사항. PR에서 변경 시도 시 거부.

- 단일 로컬 Workspace
- `deeplearning/` 등은 **KnowledgeSpace 폴더**. Workspace 분리 아님
- 과목 / 학기 / 시험 = 메타데이터. 폴더 분리 기준 아님
- 원문 = `<space>/archive/`에 보존. LLM이 덮어쓰지 X
- LLM 정리 = `<space>/wiki/`. 사용자 친화 + 구조화 메타데이터 동시
- Graph View MVP 핵심. 정적 시각화 X, 실제 클릭/필터/검색
- RelationType 명확. `related_to` 남발 금지
- 실제 LLM 호출. 정적 데모 X
- PDF 텍스트 추출 MVP 범위
- **OCR MVP 범위** (PRD-v1 §17.1에서 MVP로 이동)
- **3-provider hybrid** (Local / OpenAI / Gemini)
- **`.dmg` / `.pkg` 배포 MVP 범위**
- Premium 흐름은 `LlmWikiResult` schema 무변경 원칙 유지

---

## 4. SSOT 원칙

[`docs/10-contracts/`](docs/10-contracts/) 6 문서에만 정의. 다른 곳 복붙 금지.

| 자산 | 파일 |
|---|---|
| 엔티티 TS 타입 | `entities.md` |
| RelationType enum | `relation-types.md` |
| 폴더 트리 | `workspace-layout.md` |
| Frontmatter | `markdown-frontmatter.md` |
| Wikilink/embed | `wikilink-embed.md` |
| LLM 출력 schema | `llm-output-schema.md` |

CI `ssot-check`가 grep으로 누출 자동 차단.

변경 절차:
1. `contracts-change` 라벨 PR
2. Backend / Frontend / LLM / Design 4역할 review 모두 승인
3. 의존 문서 동기화 PR을 issue로 trace

---

## 5. 핵심 기술 스택

| 영역 | 기술 | 결정 상태 |
|---|---|---|
| 앱 골격 | Tauri | ✅ 확정 |
| Frontend | React + TypeScript + Tailwind | ✅ 확정 |
| Backend | Rust | ✅ 확정 |
| 저장 | 로컬 파일 시스템 (Markdown + JSON) | ✅ 확정 |
| LLM provider | Ollama (local) / OpenAI / Gemini | ✅ 확정 (3-provider hybrid) |
| OCR | Tesseract.js / Apple Vision / 외부 API | ⏸ 결정 대기 |
| PDF 파싱 | pdfium / pdf-extract / pdf.js | ⏸ 결정 대기 |
| Markdown 편집기 | TipTap / Lexical / CodeMirror 6 | ⏸ 결정 대기 |
| Graph 렌더링 | D3 / Cytoscape / React Flow | ⏸ 결정 대기 |
| 배포 | macOS `.dmg` / `.pkg` | ✅ 확정 |

대기 항목 자세히: [`docs/00-overview/open-questions.md`](docs/00-overview/open-questions.md)

---

## 6. CODEOWNERS

`.github/CODEOWNERS`가 PR review 자동 할당.

| 폴더 | Owner |
|---|---|
| `/docs/00-overview/` | @gosu1 |
| `/docs/10-contracts/` | @gosu1 @ChangSik88 @O6west @dbstpgns789-eng @Black-Tiger-h (5명, SSOT) |
| `/docs/20-backend/` | @gosu1 @ChangSik88 @O6west |
| `/docs/30-llm/` | @gosu1 |
| `/docs/30-llm/prompt-templates.md` | @gosu1 @ChangSik88 @O6west (Backend 주도, LLM 공동) |
| `/docs/40-frontend/` | @gosu1 @dbstpgns789-eng |
| `/docs/50-design/` | @Black-Tiger-h |
| `/docs/60-qa/`, `/docs/70-roadmap/`, `/docs/archive/` | @gosu1 |
| `/.github/` | @gosu1 |
| 기본 (catch-all) | @gosu1 |

---

## 7. 완료 기준 (MVP)

자세히: [`docs/60-qa/acceptance-criteria.md`](docs/60-qa/acceptance-criteria.md)

요약:
- 단일 로컬 Workspace 생성/열기
- 텍스트 / PDF / OCR 이미지 → archive 노트
- 실제 LLM 호출 → wiki + relations
- Markdown 편집기 작동 + 재실행 복원
- Graph View 클릭 / 필터 / 검색
- Free (Ollama) + Premium (GPT 또는 Gemini) 둘 다 동작
- Premium 되묻기 + fact-check 기본 흐름
- `.dmg` 또는 `.pkg` 빌드 산출물
- `npm test`, `npm run build`, `npm run e2e`, `cargo test`, `cargo check` 통과
- CI docs-check 통과

E2E 시나리오 12개: [`docs/60-qa/e2e-scenarios.md`](docs/60-qa/e2e-scenarios.md)

---

## 8. 도구 / 인프라

| 자산 | 위치 |
|---|---|
| Issues | https://github.com/gosu1/piecepool/issues |
| Project board | https://github.com/users/gosu1/projects/2 |
| Milestones | https://github.com/gosu1/piecepool/milestones |
| CI workflow | [`.github/workflows/docs-check.yml`](.github/workflows/docs-check.yml) |
| Issue templates | [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) (5종) |
| PR template | [`.github/pull_request_template.md`](.github/pull_request_template.md) |
| CODEOWNERS | [`.github/CODEOWNERS`](.github/CODEOWNERS) |

라벨 (12종): `role:backend`, `role:frontend`, `role:llm`, `role:design`, `role:qa`, `role:pm`, `phase:1`~`phase:5`, `contracts-change`

---

## 9. 외부 자료

- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- Gemini API: https://ai.google.dev/api
- Ollama: https://ollama.com/
- Tauri: https://tauri.app/

---

## 10. 권장 next step (역할별)

| 역할 | 첫 PR 후보 |
|---|---|
| Backend | [#6 architecture.md](https://github.com/gosu1/piecepool/issues/6) (모듈 경계 잡기, 다른 sub-task의 기준이 됨) |
| Frontend | [#16 architecture.md](https://github.com/gosu1/piecepool/issues/16) (라우팅 + 상태 관리 기준) |
| LLM | [#29 provider-config.md](https://github.com/gosu1/piecepool/issues/29) (3-provider adapter 인터페이스 확정) |
| Design | [#33 screen-inventory.md](https://github.com/gosu1/piecepool/issues/33) (5화면 카드, Frontend 의존 unblock) |

---

## 11. 변경 이력 노트

- 본 문서는 PRD-v1 시절 기준에서 현재 구조 (Phase 1~3, 5 완료 + Phase 4 진행)로 전면 재작성한 결과다.
- 환경변수 (3-provider), CODEOWNERS, CI, Project board, 라벨 / 템플릿 / 마일스톤 등 인프라는 본 리팩토링에서 신규 추가했다.
- 기존 reference (`PRD.md`, `docs/superpowers/plans/tasks`)는 제거. 새 reference는 `docs/00-overview/`와 `docs/10-contracts/`.
