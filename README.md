# PiecePool

대학생용 로컬 우선 AI 지식 Workspace. 단일 Workspace에 강의 자료를 모으고 LLM이 Concept 중심 Wiki와 타입 있는 Graph로 재구성한다.

> 핵심: 시간이 지날수록 Wiki/Graph가 개인 전공 지식 지도처럼 성장한다.

---

## 📚 문서 진입

### 모든 역할 필독
- [`docs/00-overview/`](docs/00-overview/) — 비전 / MVP scope / 용어 / 플랜 / 열린 질문 (5 문서)

### 역할별
| 역할 | 폴더 | Owner |
|---|---|---|
| Backend | [`docs/20-backend/`](docs/20-backend/) | @gosu1 @ChangSik88 @O6west |
| Frontend | [`docs/40-frontend/`](docs/40-frontend/) | @gosu1 @dbstpgns789-eng |
| LLM | [`docs/30-llm/`](docs/30-llm/) | @gosu1 (Backend 공동: `prompt-templates.md`) |
| Design (Figma) | [`docs/50-design/`](docs/50-design/) | @Black-Tiger-h |
| QA / PM | [`docs/60-qa/`](docs/60-qa/), [`docs/70-roadmap/`](docs/70-roadmap/) | @gosu1 |

### 공유 계약 (SSOT 🔒)
모든 역할이 참조. 변경은 4역할 review 필수.

[`docs/10-contracts/`](docs/10-contracts/)
- `workspace-layout.md` — Workspace 폴더 트리
- `entities.md` — TypeScript 타입 11종
- `relation-types.md` — RelationType enum 12종
- `markdown-frontmatter.md` — archive/wiki frontmatter
- `wikilink-embed.md` — `[[...]]` / `![[...]]` 규약
- `llm-output-schema.md` — LlmWikiResult JSON Schema

---

## 🗺️ 진행 상태

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | Skeleton (디렉토리 + archive) | ✅ |
| 2 | SSOT (10-contracts 6 문서) | ✅ |
| 3 | Overview (vision, scope, glossary, pricing-model, open-questions) | ✅ |
| 4 | Roles 병렬 작업 | ⏸ **진행 중** |
| 5 | QA (acceptance-criteria, e2e-scenarios) + Roadmap (post-mvp) | ✅ |

**Phase 4 분배** ([milestone](https://github.com/gosu1/piecepool/milestone/4)):
- 총 **37 이슈** (5 tracking + 32 sub)
- Backend 11 / Frontend 14 / LLM 5 / Design 6 / Contracts 1
- [Project board](https://github.com/users/gosu1/projects/2): Phase / Role 필드 자동 분류

---

## 협업 규칙

### 1. SSOT (Single Source of Truth)

`docs/10-contracts/` 안에서만 정의. 다른 문서는 link로 참조. **TS 코드 / JSON Schema 복붙 금지**.

| 자산 | 파일 |
|---|---|
| 엔티티 TypeScript 타입 | `entities.md` |
| RelationType enum 12종 | `relation-types.md` |
| Workspace 폴더 트리 | `workspace-layout.md` |
| Markdown frontmatter | `markdown-frontmatter.md` |
| Wikilink/embed 규약 | `wikilink-embed.md` |
| LLM 출력 JSON Schema | `llm-output-schema.md` |

### 2. 계약 변경 절차

`docs/10-contracts/` 수정 PR:
- 라벨 `contracts-change` 부착
- Backend / Frontend / LLM / Design 4역할 owner review 모두 승인
- 의존 문서 동기화 PR을 issue로 trace

### 3. LLM Provider (3-provider hybrid)

| 플랜 | Provider | 환경변수 |
|---|---|---|
| Free (기본) | Local Ollama 무제한 | `PIECEPOOL_LLM_PROVIDER=local` |
| Premium | OpenAI GPT | `OPENAI_API_KEY` |
| Premium | Gemini | `GEMINI_API_KEY` |

Premium 추가 기능: 되묻기 + fact-check + 웹 검색 비교 + suggest. 자세히: [`docs/00-overview/pricing-model.md`](docs/00-overview/pricing-model.md)

### 4. 문서 규약

- 한 문서 200줄 이하 (스키마/표 위주 예외 명시)
- 본문 한국어, 식별자/타입명/enum 값 영문
- Obsidian 호환 `[[파일]]` / `![[파일]]`

### 5. CI 자동 검증

`.github/workflows/docs-check.yml`:
- **link-check** (lychee) — 깨진 내부 link 차단
- **ssot-check** (grep) — TS 타입 / JSON Schema 누출 차단
- **prettier** (advisory) — 포맷 제안

PR 또는 main push마다 자동 실행.

### 6. CODEOWNERS

`.github/CODEOWNERS`가 폴더별 review 자동 할당.

---

## 컨셉 스케치

(협업자 시각 자료. 정식 사양은 [`docs/00-overview/vision.md`](docs/00-overview/vision.md))

### 아이디어 구조화

<img width="800" height="800" alt="image" src="https://github.com/user-attachments/assets/83bc4471-7813-4a4f-b4f1-ef7dac97073c" />

### Inbox

inbox에 들어오는 것:

- PDF, 이미지, 음성, 웹

MVP 단계에서는 mock text까지만 다룬다.

### LLM 내용정리

예시:

```
Semaphore Wiki Page
Deadlock Wiki Page
Mutex Wiki Page
Race Condition Wiki Page
```

"서울"이라는 Wiki 페이지를 만든다면 다음 형태로 생성될 수 있다.

<img width="800" height="800" alt="image" src="https://github.com/user-attachments/assets/ea948660-df86-43b9-898c-5fe5335ef6c9" />

이런 방식으로 계속해서 Wiki 페이지를 업데이트한다.

### 그래프 뷰

<img width="800" height="800" alt="스크린샷 2026-05-29 오전 10 18 24" src="https://github.com/user-attachments/assets/34cc23df-9e77-4524-a74f-c807f9ff0c98" />


---

## 추가 자료

| 자료 | 설명 |
|---|---|
| [`PRD_REFACTOR_PLAN.md`](PRD_REFACTOR_PLAN.md) | 리팩토링 계획 (대부분 실행 완료) |
| [`DEVELOPER_HANDOFF.md`](DEVELOPER_HANDOFF.md) | 개발자 진입 가이드 |
| [`docs/archive/PRD-v1.md`](docs/archive/PRD-v1.md) | 기존 PRD v1 보존본 |
| [GitHub Issues](https://github.com/gosu1/piecepool/issues) | Phase 4 작업 분배 |
| [Project board](https://github.com/users/gosu1/projects/2) | Roadmap 시각 추적 |
| [Milestones](https://github.com/gosu1/piecepool/milestones) | Phase 1~5 진행 |

---

## 라이선스

별도 명시 전까지 비공개 작업물.
