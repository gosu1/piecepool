# PiecePool

[![code-check](https://github.com/gosu1/piecepool/actions/workflows/code-check.yml/badge.svg)](https://github.com/gosu1/piecepool/actions/workflows/code-check.yml)
[![docs-check](https://github.com/gosu1/piecepool/actions/workflows/docs-check.yml/badge.svg)](https://github.com/gosu1/piecepool/actions/workflows/docs-check.yml)
![license](https://img.shields.io/badge/license-proprietary-red)
![platform](https://img.shields.io/badge/platform-macOS-lightgrey)

**대학생용 로컬 우선(local-first) AI 지식 Workspace.** 강의 PDF·필기·요약을 한 Workspace에 모으면 LLM이 Concept 중심 Wiki와 타입 있는 지식 Graph로 재구성한다. 시간이 지날수록 Wiki/Graph가 **개인 전공 지식 지도**처럼 성장한다.

> Tauri + Rust · React/TypeScript · Tailwind · macOS · Windows

> 🏃 **바로 실행해 보려면 → [RUN_GUIDE.md](RUN_GUIDE.md)** — 설치 파일 다운로드 · 실행 · 5분 데모 시나리오

## 목차

- [핵심 기능](#핵심-기능)
- [빠른 시작](#빠른-시작)
- [아키텍처](#아키텍처)
- [문서](#문서)
- [진행 상태](#진행-상태)
- [협업 규칙](#협업-규칙)
- [추가 자료](#추가-자료)
- [기술 스택 및 오픈소스](#기술-스택-및-오픈소스)
- [라이선스](#라이선스)

---

## 핵심 기능

LLM이 하는 일 네 가지:

1. **Wiki 생성** — 사용자 원본 노트(`archive/`)를 Concept 중심 WikiPage로 재구성한다. 원문은 절대 덮어쓰지 않는다.
2. **타입 있는 Graph** — Wiki를 12종 RelationType(strength / confidence / 근거 evidence)으로 연결한다. 과목을 넘나드는 지식 지도가 자연히 생긴다.
3. **정보 간극 메우기 (label ↔ user)** — **Liner API**(주)가 권위 있는 출처를 검색해 정답 기준(label)을 세우고 사용자 필기 사이의 간극을 검증·보강한다(fact-check·출처 provenance). Liner 미가용 시 **Gemini**(보조)가 정답을 바로 주입하지 않고 1~3개 선택지 + 기타 칸으로 **소크라테스식·하브루타식** 되묻기 질문을 생성한다.
4. **파인만** — 개념을 자기 말로 설명하게 하고, LLM은 정답을 알려주지 않은 채 그 설명의 구멍 하나만 짚어 되묻는다. 이해했는지는 **오직 사용자가** 판정하며(LLM은 채점하지 않는다), 사용자가 남긴 설명이 Wiki의 재료가 된다.

단순 링크형 노트앱·SaaS 문서 DB·Anki(고립 카드)와 달리 **LLM 재구성 Wiki + 타입 관계 + 누적 지식 지도**가 차별점이다.

<details>
<summary>정보 간극 메우기 상세</summary>

교수님이 주신 PDF에는 정답인 정보(**label**)가 들어 있다. 하지만 사용자가 필기노트를 작성할 때 틀리거나, 다르게 적거나, 잘못 이해한 부분이 생긴다. 여기서 **정보의 간극**이 발생한다.

Liner API가 권위 있는 출처를 검색해 이 간극을 검증한 뒤, 사용자에게 최대 1~3개의 선택지로 _"이렇게 생각하신 게 맞나요?"_ 가이드를 주고, **기타** 칸으로 직접 설명하게 한다. Claude의 Plan 스킬과 같은 결로, 정답을 주입하지 않고 스스로 다시 생각하게 만든다.

</details>

---

## 빠른 시작

로컬 데스크톱 앱(Tauri v2) — 웹 서버가 아니라 네이티브 창으로 뜬다.

**요구사항**: macOS(aarch64 확인됨) · Node 22 (`.nvmrc`) · Rust(stable) + Cargo

```bash
npm install
(cd src-tauri && cargo fetch)
npm run tauri dev         # Tauri 창 + Vite 개발 서버
```

- 첫 실행 시 `~/PiecePool`에 시드 데이터(운영체제·AI 딥러닝·통계학·경제학·생리학 공간, Wiki/Graph)가 생성된다.
- **API Key는 앱을 띄운 뒤 좌하단 계정 → 설정**에서 입력한다(이 기기에만 저장). [Gemini 키 발급](https://aistudio.google.com/apikey) · Liner 키는 정보 간극 메우기용(선택).

### API 키는 두 군데다

혼동이 잦은 지점이다. 앱과 CLI는 키를 **서로 다른 곳**에서 읽는다.

| 실행 대상 | 키 위치 | 비고 |
|---|---|---|
| 데스크톱 앱 (`npm run tauri dev`) | 설정 모달 → 브라우저 `localStorage` | **`.env`를 읽지 않는다** |
| CLI 스크립트 (`npm run eval:feynman`, `chunk` 등) | `.env` 또는 셸 환경변수 | `cp .env.example .env` 후 `GEMINI_API_KEY` 입력 |

키가 없으면 앱은 죽지 않고 휴리스틱 폴백으로 내려간다 — 파인만 패널이 뜨지 않으면 키부터 확인할 것.

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
| 저장 | 로컬 파일시스템 (Markdown + JSON), 외부 에디터 호환 `[[파일]]` / `![[파일]]` |
| LLM | Google Gemini (`gemini-2.5-flash`, OpenAI 호환 엔드포인트) — Wiki 생성 · 파인만 · 타입 Graph |
| 출처 검색 | Liner API (`LINER_API_KEY`) — 정보 간극 메우기(fact-check · provenance) |

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
- 계약(`docs/10-contracts/`) 변경: `contracts-change` 라벨 + 계약 담당 1인 승인.
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

## 기술 스택 및 오픈소스

PiecePool 은 아래 오픈소스 위에 구축되었습니다. 각 구성요소는 원 저작권자의 라이선스를 따릅니다.

| 영역 | 구성요소 | 라이선스 |
|---|---|---|
| 앱 프레임워크 | Tauri v2 (Rust + WebView), tauri-plugin-opener, tauri-plugin-drag | MIT / Apache-2.0 |
| 백엔드 (Rust) | serde · serde_json · ts-rs · pdf-extract · lopdf · windows-sys | MIT / Apache-2.0 |
| 프론트엔드 | React 19 · react-dom · react-router-dom · Vite · TypeScript | MIT |
| 스타일 | Tailwind CSS v4 | MIT |
| 상태 관리 | Zustand | MIT |
| 지식 그래프 | Cytoscape.js · d3-force | MIT |
| 마크다운·수식 | react-markdown · remark-gfm · remark-math · rehype-katex · KaTeX | MIT |
| 코드 에디터 | CodeMirror 6 (`@codemirror/*`) · @uiw/react-codemirror · @lezer/highlight | MIT |
| PDF | react-pdf (pdf.js) · pdf-extract | MIT / Apache-2.0 |
| 검증·테스트 | Ajv · Vitest · Playwright | MIT / Apache-2.0 |
| LLM (외부 API) | Google Gemini (OpenAI 호환 엔드포인트) · Liner API | 각 서비스 이용약관 |

**라이선스 고지**

- 전체 의존성(npm 약 290개, Cargo 약 525개)은 **MIT · Apache-2.0 · BSD · ISC · Zlib · Unicode-3.0** 등 허용형(permissive) 라이선스입니다. **GPL/AGPL 등 강한 카피레프트 라이선스는 사용하지 않았습니다.**
- 일부 빌드 도구는 **MPL-2.0**(예: `lightningcss`, `cssparser`/`selectors`)입니다 — 파일 단위의 약한 카피레프트로, 수정 없이 사용하며 최종 배포 번들에는 포함되지 않습니다.
- 브라우저 호환성 데이터 `caniuse-lite` 는 **CC-BY-4.0** 이며 빌드 시에만 사용됩니다(데이터 출처: caniuse.com).
- 각 패키지의 전체 라이선스 전문은 해당 패키지 저장소 및 `node_modules` / Cargo 레지스트리에서 확인할 수 있습니다.

## 라이선스

독점 (All Rights Reserved). [`LICENSE`](LICENSE) 참조 — 무단 사용·복제·배포 금지. `package.json`은 `UNLICENSED`.

> 위 오픈소스 구성요소는 각자의 라이선스를 따르며, 본 독점 라이선스는 **PiecePool 자체 코드**에 적용됩니다.
