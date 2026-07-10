# PiecePool 문서

PiecePool 프로젝트의 단일 문서 허브. 번호 순서대로 읽으면 개요 → 계약 → 구현 영역 → QA → 로드맵으로 이어진다.

> **SSOT 원칙**: 공유 계약(엔티티·RelationType·layout·frontmatter·wikilink·LLM schema)은 [`10-contracts/`](10-contracts/)**에만** 정의한다. 다른 문서·코드에 복붙 금지 (CI `ssot-check`가 grep으로 차단). 다른 문서는 **링크로만** 참조한다.

## 문서 맵

| 폴더 | 내용 |
|---|---|
| [`00-overview/`](00-overview/) | 비전 · MVP 범위 · 용어 · 가격 모델 · 공모전 계획 · [열린 질문](00-overview/open-questions.md) |
| [`10-contracts/`](10-contracts/) | **SSOT** — 엔티티, RelationType, 워크스페이스 layout, frontmatter, wikilink/embed, LLM 출력 schema |
| [`adr/`](adr/) | 아키텍처 결정 기록(ADR) — 확정된 기술 결정과 근거 |
| [`20-backend/`](20-backend/) | Tauri + Rust — 저장 I/O, PDF 추출, import 파이프라인, IPC, 오류 처리 |
| [`30-llm/`](30-llm/) | Gemini 어댑터, 프롬프트, 출력 검증, eval |
| [`40-frontend/`](40-frontend/) | React/TS — 화면, 컴포넌트, OCR 클라이언트, 패키징 |
| [`50-design/`](50-design/) | Figma 기반 UI/UX 디자인 |
| [`60-qa/`](60-qa/) | 인수 기준 · E2E 시나리오 |
| [`70-roadmap/`](70-roadmap/) | post-MVP 로드맵 |
| [`archive/`](archive/) | 이전 PRD 등 역사적 문서 |

## 역할별 진입점

| 역할 | 먼저 볼 곳 |
|---|---|
| 신규 합류자 | [저장소 README](../README.md) → [`00-overview/`](00-overview/) |
| Backend | [`20-backend/`](20-backend/) + [`10-contracts/`](10-contracts/) |
| LLM | [`30-llm/`](30-llm/) + [`10-contracts/llm-output-schema.md`](10-contracts/llm-output-schema.md) |
| Frontend | [`40-frontend/`](40-frontend/) + [`50-design/`](50-design/) |
| Design | [`50-design/`](50-design/) + [`00-overview/vision.md`](00-overview/vision.md) |

## 결정 이력

확정된 기술·아키텍처 결정은 [`adr/`](adr/)에 ADR로 기록한다. 보류 중인 항목은 [`00-overview/open-questions.md`](00-overview/open-questions.md).
