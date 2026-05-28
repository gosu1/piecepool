# PiecePool

대학생용 로컬 우선 AI 지식 Workspace. 단일 Workspace에 강의 자료를 모으고 LLM이 Concept 중심 Wiki와 타입 있는 Graph로 재구성한다.

> 핵심: 시간이 지날수록 Wiki/Graph가 개인 전공 지식 지도처럼 성장한다.

---

## 🚧 문서 리팩토링 진행 중

기존 `PRD.md` (1152줄 단일 파일)을 역할별 다중 문서 구조로 재편 중이다.

- 진행 계획: [PRD_REFACTOR_PLAN.md](PRD_REFACTOR_PLAN.md)
- 대상 구조: `docs/{00-overview, 10-contracts, 20-backend, 30-llm, 40-frontend, 50-design, 60-qa, 70-roadmap}/`
- 리팩토링 완료 전 진입점: [docs/archive/PRD-v1.md](docs/archive/PRD-v1.md), [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md)

---

## 협업 규칙

신규 합류자/협업자는 본 절을 먼저 읽는다.

### 1. 역할별 진입 경로 (리팩토링 완료 후 적용)

| 역할 | 필독 폴더 |
|---|---|
| Backend | `docs/00-overview/`, `docs/10-contracts/`, `docs/20-backend/` |
| LLM | `docs/00-overview/`, `docs/10-contracts/`, `docs/30-llm/` |
| Frontend | `docs/00-overview/`, `docs/10-contracts/`, `docs/40-frontend/`, `docs/50-design/` |
| Figma 디자이너 | `docs/00-overview/` (vision/scope만), `docs/50-design/` |
| QA / PM | `docs/00-overview/`, `docs/60-qa/`, `docs/70-roadmap/` |

각 역할은 본인 폴더 + `00-overview` + `10-contracts`만 알면 작업 착수 가능하다.

### 2. Single Source of Truth (SSOT)

다음 5개는 `docs/10-contracts/` 안에서만 정의한다. 다른 문서는 link로 참조하며 사본·재정의를 금지한다.

| 자산 | 파일 |
|---|---|
| 엔티티 TypeScript 타입 | `entities.md` |
| RelationType enum 12종 | `relation-types.md` |
| Workspace 폴더 트리 | `workspace-layout.md` |
| Markdown frontmatter 스키마 | `markdown-frontmatter.md` |
| LLM 출력 JSON Schema | `llm-output-schema.md` |

본문에 TS 코드블록 복붙은 계약 표류의 1순위 원인이므로 금지한다.

### 3. 계약 변경 절차

`docs/10-contracts/` 수정 PR은 아래를 모두 만족해야 머지한다.

- PR 라벨 `contracts-change` 부착
- Backend, Frontend, LLM, Design 4개 역할 owner 모두 review 승인
- 의존 문서(`20-backend`, `30-llm`, `40-frontend`, `50-design`) 동기화 PR을 issue로 trace

### 4. LLM Provider (하이브리드)

OpenAI + 로컬 모델 두 어댑터를 동시 지원한다. 환경변수:

```bash
PIECEPOOL_LLM_PROVIDER=openai|local                  # 기본 openai
PIECEPOOL_LLM_MODEL=...                              # provider별 기본값
OPENAI_API_KEY=...                                   # openai일 때만
PIECEPOOL_LOCAL_LLM_ENDPOINT=http://localhost:11434  # local일 때만, Ollama 기본
PIECEPOOL_LOCAL_LLM_BACKEND=ollama|mlx|llamacpp      # 기본 ollama
```

어댑터 인터페이스/프롬프트/스키마 검증은 `docs/30-llm/`에서 정의한다 (작성 예정).

### 5. 파일 크기 가이드

- 한 문서 200줄 이하 목표
- 한 화면 = 한 파일
- 스키마/매핑 표 위주 파일은 예외 명시 가능

### 6. 문서 언어

- 본문 설명: 한국어
- 식별자, 타입명, enum 값, 코드, 환경변수명: 영문 원형 유지
- 표 머리글: 한국어
- 외부 인용/사양 문서 URL: 원문 그대로

### 7. Markdown 규약

- Frontmatter 스키마는 `docs/10-contracts/markdown-frontmatter.md` 단일 정의
- Obsidian 호환 문법: `[[파일명]]` (링크), `![[파일명]]` (inline embed)
- PDF page embed: `![[파일.pdf#page=N]]`
- 자세한 규약: `docs/10-contracts/wikilink-embed.md`

---

## 컨셉 스케치

제품 아이디어와 시각 자료. 정식 사양은 `PRD.md` 및 향후 `docs/00-overview/`에서 관리한다.

### 아이디어 구조화

<img width="1096" height="1098" alt="image" src="https://github.com/user-attachments/assets/83bc4471-7813-4a4f-b4f1-ef7dac97073c" />

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

<img width="1004" height="1032" alt="image" src="https://github.com/user-attachments/assets/ea948660-df86-43b9-898c-5fe5335ef6c9" />

이런 방식으로 계속해서 Wiki 페이지를 업데이트한다.

### 그래프 뷰

<img width="142" height="150" alt="image" src="https://github.com/user-attachments/assets/169628d6-3179-49cf-9a6f-6425a2f3c055" />

---

## 기존 문서 (리팩토링 완료 시 `docs/archive/`로 이동 예정)

- [docs/archive/PRD-v1.md](docs/archive/PRD-v1.md) — 제품 요구사항 (v1, archive)
- [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md) — 개발자 진입 가이드
- `docs/superpowers/plans/tasks` — 작업 단위 구현 계획

---

## 라이선스 / 기여

별도 명시 전까지 비공개 작업물로 간주.
