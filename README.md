# PiecePool

[![code-check](https://github.com/gosu1/piecepool/actions/workflows/code-check.yml/badge.svg)](https://github.com/gosu1/piecepool/actions/workflows/code-check.yml)
[![docs-check](https://github.com/gosu1/piecepool/actions/workflows/docs-check.yml/badge.svg)](https://github.com/gosu1/piecepool/actions/workflows/docs-check.yml)
![license](https://img.shields.io/badge/license-proprietary-red)
![platform](https://img.shields.io/badge/platform-macOS-lightgrey)

**대학생용 로컬 우선(local-first) AI 지식 Workspace.** 강의 PDF·필기·요약을 한 Workspace에 모으면 LLM이 Concept 중심 Wiki와 타입 있는 지식 Graph로 재구성한다. 시간이 지날수록 Wiki/Graph가 **개인 전공 지식 지도**처럼 성장한다.

> Tauri + Rust · React/TypeScript · Tailwind · macOS

## 목차

- [핵심 기능](#핵심-기능)
- [빠른 시작](#빠른-시작)
- [아키텍처](#아키텍처)
- [문서](#문서)
- [진행 상태](#진행-상태)
- [협업 규칙](#협업-규칙)
- [추가 자료](#추가-자료)
- [라이선스](#라이선스)

---

## 핵심 기능

LLM이 하는 일 세 가지:

1. **Wiki 생성** — 사용자 원본 노트(`archive/`)를 Concept 중심 WikiPage로 재구성한다. 원문은 절대 덮어쓰지 않는다.
2. **타입 있는 Graph** — Wiki를 12종 RelationType(strength / confidence / 근거 evidence)으로 연결한다. 과목을 넘나드는 지식 지도가 자연히 생긴다.
3. **정보 간극 메우기 (label ↔ user)** — 교수 자료(정답=label)와 사용자 필기 사이의 간극을 LLM이 검증한다. 정답을 바로 주입하지 않고 1~3개 선택지 + 기타 칸으로 **소크라테스식·하브루타식**으로 되묻는다.

Obsidian(단순 링크)·Notion(SaaS DB)·Anki(고립 카드)와 달리 **LLM 재구성 Wiki + 타입 관계 + 누적 지식 지도**가 차별점이다.

<details>
<summary>정보 간극 메우기 상세</summary>

교수님이 주신 PDF에는 정답인 정보(**label**)가 들어 있다. 하지만 사용자가 필기노트를 작성할 때 틀리거나, 다르게 적거나, 잘못 이해한 부분이 생긴다. 여기서 **정보의 간극**이 발생한다.

LLM은 이 간극을 캐치하고 검증한 뒤, 사용자에게 최대 1~3개의 선택지로 _"이렇게 생각하신 게 맞나요?"_ 가이드를 주고, **기타** 칸으로 직접 설명하게 한다. Claude의 Plan 스킬과 같은 결로, 정답을 주입하지 않고 스스로 다시 생각하게 만든다.

</details>

---

## 빠른 시작

로컬 데스크톱 앱(Tauri v2) — 웹 서버가 아니라 네이티브 창으로 뜬다.

**요구사항**: macOS(aarch64 확인됨) · Node 22 (`.nvmrc`) · Rust(stable) + Cargo

```bash
npm install
(cd src-tauri && cargo fetch)
cp .env.example .env      # OPENAI_API_KEY 입력
npm run tauri dev         # Tauri 창 + Vite 개발 서버
```

- 첫 실행 시 `~/PiecePool`에 시드 데이터(운영체제·AI 딥러닝 공간, Wiki/Graph)가 생성된다.
- **OpenAI API Key**는 좌하단 계정 → 설정에서 입력한다(이 기기에만 저장). 키가 없으면 heuristic fallback으로 축소 동작한다.

빌드 · 미리보기 · 테스트:

```bash
npm run tauri build   # → src-tauri/target/release/bundle/{macos/*.app, dmg/*.dmg}
npm run dev           # 백엔드 없이 mock 데이터로 UI만 (localhost:5173)
npm run check         # tsc 타입 검사
npm test              # vitest 단위 테스트
npm run e2e           # Playwright e2e
(cd src-tauri && cargo test && cargo clippy -- -D warnings)
```

검증 게이트·기여 절차는 [CONTRIBUTING](CONTRIBUTING.md).

---

## 아키텍처

| 레이어 | 기술 |
|---|---|
| 앱 골격 | Tauri v2 |
| Frontend | React + TypeScript + Tailwind |
| Backend | Rust — 파일 I/O · PDF 추출 · import 파이프라인 · IPC |
| 저장 | 로컬 파일시스템 (Markdown + JSON), Obsidian 호환 `[[파일]]` / `![[파일]]` |
| LLM | OpenAI (`OPENAI_API_KEY`) |

파이프라인: **Inbox → `archive/`(원문 보존) → LLM Wiki → 타입 Graph**. 확정된 기술 결정과 근거는 [`docs/`](docs/) 트리를 참조한다.

### 컨셉 스케치

> 협업자 시각 자료. 정식 사양은 [`docs/00-overview/vision.md`](docs/00-overview/vision.md).

**아이디어 구조화**

<img width="800" height="800" alt="아이디어 구조화" src="https://github.com/user-attachments/assets/83bc4471-7813-4a4f-b4f1-ef7dac97073c" />

**LLM Wiki 정리** — "서울" Wiki 페이지 생성 예시

<img width="800" height="800" alt="Wiki 정리 예시" src="https://github.com/user-attachments/assets/ea948660-df86-43b9-898c-5fe5335ef6c9" />

**Graph View**

<img width="800" height="800" alt="Graph View" src="https://github.com/user-attachments/assets/34cc23df-9e77-4524-a74f-c807f9ff0c98" />

---

## 문서

전체 문서 트리: [`docs/`](docs/)

### 모든 역할 필독

- [`docs/00-overview/`](docs/00-overview/) — 비전 / MVP scope / 용어 / 가격 모델 / 열린 질문
- [`docs/adr/`](docs/adr/) — 확정된 기술 결정(ADR)

### 역할별

| 역할 | 폴더 | Owner |
|---|---|---|
| Backend | [`docs/20-backend/`](docs/20-backend/) | @gosu1 @ChangSik88 @O6west |
| Frontend | [`docs/40-frontend/`](docs/40-frontend/) | @gosu1 @dbstpgns789-eng |
| LLM | [`docs/30-llm/`](docs/30-llm/) | @gosu1 |
| Design (Figma) | [`docs/50-design/`](docs/50-design/) | @Black-Tiger-h |
| QA / PM | [`docs/60-qa/`](docs/60-qa/) · [`docs/70-roadmap/`](docs/70-roadmap/) | @gosu1 |

### 공유 계약 (SSOT 🔒)

[`docs/10-contracts/`](docs/10-contracts/) 6 문서에만 정의한다. 다른 문서·코드에 복붙 금지(CI `ssot-check`가 차단). 상세 규칙은 [CONTRIBUTING](CONTRIBUTING.md).

---

## 진행 상태

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | Skeleton (디렉토리 + archive) | ✅ |
| 2 | SSOT (10-contracts 6 문서) | ✅ |
| 3 | Overview (vision, scope, glossary, pricing-model, open-questions) | ✅ |
| 4 | Roles 병렬 작업 | ⏸ **진행 중** |
| 5 | QA (acceptance-criteria, e2e-scenarios) + Roadmap (post-mvp) | ✅ |

**Phase 4 분배** ([milestone](https://github.com/gosu1/piecepool/milestone/4)): 총 37 이슈(5 tracking + 32 sub) — Backend 11 / Frontend 14 / LLM 5 / Design 6 / Contracts 1. [Project board](https://github.com/users/gosu1/projects/2)에서 Phase/Role 자동 분류.

---

## 협업 규칙

전체 기여·브랜치·SSOT·커밋·모듈 경계 규칙은 **[CONTRIBUTING.md](CONTRIBUTING.md)** 를 따른다. 핵심만:

- `main` 직접 push **금지**. feature branch → PR → review → merge (merge 후 브랜치 삭제).
- 계약(`docs/10-contracts/`) 변경: `contracts-change` 라벨 + Backend/Frontend/LLM/Design 4역할 승인.
- CI(`docs-check` · `code-check`)가 red면 merge 금지.
- 리뷰어는 [`.github/CODEOWNERS`](.github/CODEOWNERS)가 자동 할당. 확정 결정은 [ADR](docs/adr/) 기록.

---

## 추가 자료

| 자료 | 설명 |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | 개발자 진입·기여 가이드 |
| [CHANGELOG.md](CHANGELOG.md) | 변경 이력 |
| [`docs/archive/PRD_REFACTOR_PLAN.md`](docs/archive/PRD_REFACTOR_PLAN.md) | 리팩토링 계획 (대부분 실행 완료) |
| [`docs/archive/PRD-v1.md`](docs/archive/PRD-v1.md) | 기존 PRD v1 보존본 |
| [GitHub Issues](https://github.com/gosu1/piecepool/issues) · [Project board](https://github.com/users/gosu1/projects/2) · [Milestones](https://github.com/gosu1/piecepool/milestones) | 작업 분배·추적 |

---

## 라이선스

독점 (All Rights Reserved). [`LICENSE`](LICENSE) 참조 — 무단 사용·복제·배포 금지. `package.json`은 `UNLICENSED`.
