# PiecePool

대학생용 로컬 우선 AI 지식 Workspace. 단일 Workspace에 강의 자료를 모으고 LLM이 Concept 중심 Wiki와 타입 있는 Graph로 재구성한다.

> 핵심: 시간이 지날수록 Wiki/Graph가 개인 전공 지식 지도처럼 성장한다.

---

## ✨ LLM이 하는 일 3가지

PiecePool의 핵심 특징. LLM은 세 가지 일을 한다.

1. **LLM Wiki 생성** — 사용자가 작성한 원본 노트(`archive/`)를 기반으로 Concept 중심 WikiPage를 만든다.
2. **Graph View** — 생성된 LLM Wiki를 기반으로 타입 있는 관계 그래프를 그린다.
3. **정보 간극 메우기 (label ↔ user)** — 교수님 자료(정답=label)와 사용자 필기 사이의 간극을 LLM이 검증하고 메운다.

### 정보 간극 메우기 상세

교수님이 주신 PDF에는 정답인 정보(**label**)가 들어 있다. 하지만 사용자가 필기노트를 작성할 때 틀리거나, 다르게 적거나, 잘못 이해한 부분이 생긴다. 여기서 **정보의 간극**이 발생한다.

LLM은 이 간극을 캐치하고 검증한 뒤, 사용자에게 선택지를 준다.

- 최대 **1~3개**의 선택지로 _"이렇게 생각하신 게 맞나요?"_ 가이드라인을 제공한다.
- **기타** 칸을 하나 더 주어, 사용자가 직접 말로 설명할 수 있게 한다.

이 방식은 Claude의 Plan 스킬과 같은 결로, **소크라테스식 · 하브루타식** 공부법을 따른다. 정답을 바로 주입하지 않고 사용자가 스스로 다시 생각하게 만든다.

---

## 🚀 실행 방법

로컬 데스크톱 앱(Tauri v2)이다. 웹 서버가 아니라 네이티브 창으로 뜬다.

### 요구사항

- **Node.js** 18+
- **Rust** (stable) + Cargo — Tauri 빌드 전제
- **macOS** (현재 `aarch64` 번들 확인됨). PDF 미리보기·번들은 OS 도구 사용

### 설치

```bash
npm install                 # 프론트엔드 의존성
(cd src-tauri && cargo fetch)   # Rust 의존성
```

### 개발 실행 (데스크톱 앱)

```bash
npm run tauri dev
```

- Tauri 창 + Vite 개발 서버가 함께 뜬다.
- **첫 실행 시 `~/PiecePool`에 시드 데이터**(운영체제·AI 딥러닝 공간, Wiki/Graph)가 생성된다.
- **OpenAI API Key**: 좌하단 계정 → **설정**에서 입력. 없으면 오프라인 **휴리스틱 엔진**으로 동작한다(키는 이 기기에만 저장).

### 빌드 (배포용)

```bash
npm run tauri build
# → src-tauri/target/release/bundle/macos/PiecePool.app
#    src-tauri/target/release/bundle/dmg/PiecePool_<ver>_aarch64.dmg
```

> 서명·notarization·Gatekeeper 통과는 Apple Developer 인증서가 있는 환경에서 별도로 수행한다.

### 브라우저로 UI만 미리보기 (백엔드 없이)

```bash
npm run dev      # http://localhost:5173 — mock 데이터로 UI 확인
```

### 검사 · 테스트

```bash
npm run check    # tsc 타입 검사
npm test         # vitest 단위 테스트
npm run e2e      # Playwright e2e (build + preview 대상)
(cd src-tauri && cargo test)               # Rust 통합 테스트
(cd src-tauri && cargo clippy -- -D warnings)
```

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

> **브랜치 / 머지 (명예 규칙)**
> - `main` 직접 push **금지**. feature branch → PR → review → merge.
> - branch protection **미적용** (private + free plan). 기술 강제 없음 → **각자 지킨다**.
> - 일반 변경: 최소 1명 review 후 merge. CI(`docs-check`) red면 merge 금지.
> - 계약 변경(`docs/10-contracts/`): 4역할 review (아래 §2).
> - merge 후 feature branch 삭제.

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

### 3. LLM Provider (OpenAI 단일)

| Provider | 환경변수 |
|---|---|
| OpenAI GPT | `OPENAI_API_KEY` |

추가 기능: 되묻기 + fact-check + 웹 검색 비교 + suggest. 자세히: [`docs/00-overview/pricing-model.md`](docs/00-overview/pricing-model.md)

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
| [`docs/archive/PRD_REFACTOR_PLAN.md`](docs/archive/PRD_REFACTOR_PLAN.md) | 리팩토링 계획 (대부분 실행 완료) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 개발자 진입·기여 가이드 |
| [`docs/archive/PRD-v1.md`](docs/archive/PRD-v1.md) | 기존 PRD v1 보존본 |
| [GitHub Issues](https://github.com/gosu1/piecepool/issues) | Phase 4 작업 분배 |
| [Project board](https://github.com/users/gosu1/projects/2) | Roadmap 시각 추적 |
| [Milestones](https://github.com/gosu1/piecepool/milestones) | Phase 1~5 진행 |

---

## 라이선스

별도 명시 전까지 비공개 작업물.
