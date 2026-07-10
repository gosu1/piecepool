# Scope (MVP)

PiecePool MVP 포함/제외 범위와 완료 기준. **모든 역할 필독**.

> 본 문서는 [`docs/archive/PRD-v1.md`](../archive/PRD-v1.md) §4~§5에서 분리·정렬하고, 이후 서준의 결정사항을 반영한 결과다.

---

## 1. MVP 정의

MVP는 **실제로 동작하는 로컬 앱**이어야 한다. 가짜 화면이나 발표용 정적 데모는 MVP가 아니다.

---

## 2. MVP 포함 (필수)

### 2.1 앱 골격
- Tauri + React + TypeScript + Tailwind 기반 macOS 로컬 앱
- **.dmg / .pkg 설치형 파일 배포** (Frontend 책임)

### 2.2 Workspace
- 단일 로컬 Workspace
- `<space>/{inbox, archive, wiki, relations, sources, config}` 구조 ([workspace-layout](../10-contracts/workspace-layout.md))
- 앱 재실행 후 상태 복원

### 2.3 Inbox 입력
- 사용자가 inbox의 글, 이미지를 쓰고 project에 넣는 화면을 고른다
- 글의 페이지 하나당 note로 표현한다. 그리고 note는 node가 된다.
- 제목, resource, project, 고정하기, 연결된 node들이 화면에 표시된다.
- note는 Markdown 문법을 따른다.
- 이미지를 넣을수있다.
- 사용자 첫 진입 화면 = **Inbox**
    - **Wiki 구성**: 원본(사용자 입력 텍스트·이미지·txt) + LLM 정리본(짧은 Concept 요약·관련 이미지) 이중 레이어
예시 화면
<img width="625" height="570" alt="스크린샷 2026-06-23 오전 12 20 19" src="https://github.com/user-attachments/assets/b4d67f22-9a8b-479a-a213-595d71225c6a" />

### 2.4 저장
- 원문 → `<space>/archive/*.md` 실제 파일
- LLM 정리 → `<space>/wiki/*.md` 실제 파일
- Relation → `<space>/relations/relations.json`
- 원본 PDF/이미지 → `<space>/sources/original-files/`

### 2.5 LLM (Gemini) + 출처 검색 (Liner)
- **Google Gemini** — `GEMINI_API_KEY` 필요
- **Liner API** — `LINER_API_KEY` 필요 (feature 3 정보 간극 메우기·fact-check 출처 검색)
- 되묻기, fact-check 기본 흐름
- 자세한 매트릭스: [`pricing-model.md`](pricing-model.md)

### 2.6 Markdown
- 편집기 (archive/wiki 둘 다)
- `[[파일]]` 링크 렌더링
- `![[파일]]` inline embed (PDF page, 이미지)
- Frontmatter 스키마 ([markdown-frontmatter](../10-contracts/markdown-frontmatter.md))

### 2.7 Wiki View
- Concept 중심 탐색
- Subject 필터
- 관련 source / relation / 헷갈리는 개념 / 관련 질문 섹션

### 2.8 Graph View (MVP 핵심)
- `<space>/wiki/` + `<space>/relations/` 메타데이터 기반 렌더링
- node 클릭 → 문서 열기
- edge 클릭 → 관계 타입/강도/신뢰도/설명/근거 패널
- Subject 필터 + 검색 + RelationType 필터
- 시각 표현: 타입별 색상, 강도별 두께·거리

### 2.9 Seed
- 첫 실행용 데모 데이터 (AI/운영체제/자료구조)
- 실제 Markdown 파일 + 메타데이터로 구성 (UI 하드코딩 금지)

### 2.10 검증
- 기본 테스트 + E2E smoke test

---

## 3. MVP 제외

| 항목 | 비고 |
|---|---|
| 로그인/계정 | 후속 |
| 클라우드 동기화 | 후속 |
| 모바일 앱 | 후속 |
| Today Task 화면 | [post-mvp](../70-roadmap/) (작성 예정) |
| Project Flow 화면 | [post-mvp](../70-roadmap/) |
| 결제/구독 시스템 | MVP는 환경변수 토글만. 결제 UI는 후속 |
| fact-check 정밀화 | MVP는 기본 흐름만. 정밀화는 후속 |
| 협업 기능 | 후속 |
| 고급 relation 강도 자동 점수화 | MVP는 LLM 부여 값 사용. 후속에 가중 합산 ([post-mvp](../70-roadmap/)) |

---

## 4. 기존 PRD 대비 변경 사항

| 항목 | PRD-v1 | 현재 | 결정 |
|---|---|---|---|
| OCR | MVP+1 (§17.1) | **MVP 포함** | 서준 명시: 어떤 input 타입이든 텍스트화 |
| LLM provider | OpenAI 단일 | **Gemini + Liner** | 단일 tier, Gemini(LLM) + Liner(feature 3 출처 검색). [ADR-0009](../adr/0009-llm-provider-gemini.md)가 OpenAI 결정(ADR-0001) 대체 |
| 프롬프트 설계 소유 | 명시 안 됨 | **Backend 주도** | [20-backend](../20-backend/), [30-llm](../30-llm/) 분리 |
| Graph view 구현 담당 | 명시 안 됨 | **@gosu1 직접** | Frontend tracking #2 명시 |
| .dmg/.pkg 배포 | 명시 안 됨 | **MVP 포함** | Frontend 책임 |

---

## 5. MVP 완료 기준 요약

다음이 모두 통과해야 MVP 완료다. 자세한 항목은 [`../60-qa/acceptance-criteria.md`](../60-qa/) (작성 예정).

- 앱이 하나의 로컬 Workspace를 열거나 생성한다
- 텍스트/PDF/이미지 입력이 `<space>/archive/*.md` 생성한다
- 실제 LLM 호출이 `<space>/wiki/*.md` + `<space>/relations/relations.json` 생성한다
- Markdown 편집기로 wiki 수정·저장 가능, 재실행 후 복원
- Graph View가 relation 메타데이터로 렌더링, 클릭/필터/검색 동작
- Seed 데이터가 실제 파일 + 메타데이터로 존재
- Gemini 실제 호출이 작동 입증
- OCR이 이미지/필기/스크린샷 입력을 텍스트로 변환
- `.dmg` 또는 `.pkg` 빌드 산출물 생성

`npm test`, `npm run build`, `npm run e2e`, `cargo test`, `cargo check` 통과.

---

## 6. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §4 (line 39-58) + §5 (line 60-73) + §16 (line 1014-1062)에서 분리·정렬한 결과다.
- §4 (기존 PRD 대비 변경)는 본 리팩토링과 서준 결정사항을 반영한 신규 표다.
- OCR/Graph 담당자 명시는 모두 신규 결정사항이다.
- 2026-06-30: 단일 tier 확정 — LLM은 OpenAI, feature 3(정보 간극 메우기·fact-check) 출처 검색은 Liner API.
- 2026-07-10: LLM provider를 OpenAI → **Google Gemini 단일**로 교체 ([ADR-0009](../adr/0009-llm-provider-gemini.md)). 키 `GEMINI_API_KEY`, Gemini의 OpenAI 호환 Chat Completions 규격. Liner 역할 무변경.
