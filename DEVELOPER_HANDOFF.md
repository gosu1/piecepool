# PiecePool 개발자 전달 문서

## 전달 목적

PiecePool MVP 개발을 시작하기 위한 전달 문서다. 개발자는 아래 문서를 순서대로 읽고 구현 계획에 따라 작업하면 된다.

읽는 순서:

1. `PRD.md`
2. `docs/superpowers/plans/2026-05-28-piecepool-mvp.md`
3. 이 전달 문서

## 제품 핵심

PiecePool은 대학생을 위한 로컬 우선 AI 지식 Workspace다.

핵심 컨셉:

> 시간이 지날수록 Wiki/Graph가 개인 전공 지식 지도처럼 성장한다.

사용자가 넣은 원문은 `archive/`에 보존한다. LLM이 정리한 개념 중심 문서는 `wiki/`에 저장한다. Graph View는 `wiki/`와 `relations/relations.json`을 기반으로 렌더링한다.

## 절대 바꾸지 말아야 할 핵심 결정

- Workspace는 단일 로컬 Workspace다.
- 과목, 학기, 시험, 프로젝트는 Workspace 분리 기준이 아니라 메타데이터/필터다.
- 사용자가 입력한 원문은 `archive/`에 실제 `.md` 파일로 저장한다.
- LLM 정리 결과는 `wiki/`에 실제 `.md` 파일로 저장한다.
- Graph View는 MVP 핵심 기능이다.
- Relation은 타입이 명확해야 한다.
- Edge 클릭 시 관계 타입, 설명, 근거가 보여야 한다.
- 실제 LLM 호출을 한다.
- PDF 텍스트 추출은 MVP 범위다.
- OCR은 제품 요구사항에 포함하되 MVP+1로 분리한다.

## MVP 필수 범위

- Tauri + React + TypeScript + Tailwind 기반 Mac 로컬 앱
- Markdown 편집기
- 로컬 파일 시스템 저장
- 텍스트 가져오기
- 수업 정리 텍스트 가져오기
- PDF 가져오기 + 텍스트 추출
- LLM 구조화 출력
- Concept/WikiPage/Relation/Evidence 생성
- `archive/*.md` 저장
- `wiki/*.md` 저장
- `relations/relations.json` 저장
- Wiki View
- Graph View
- Seed 데이터
- 기본 테스트와 E2E smoke test

## MVP 제외

- 로그인/계정
- 클라우드 동기화
- 모바일 앱
- Today Task
- Project Flow
- 실제 OCR 완성 구현
- 협업 기능

## 구현 계획

구현 계획 파일:

`docs/superpowers/plans/2026-05-28-piecepool-mvp.md`

계획은 작업 단위로 나뉘어 있다. 각 작업은 테스트 작성, 실패 확인, 구현, 통과 확인, 커밋 순서로 진행한다.

권장 작업 방식:

1. 작업 1부터 순서대로 진행한다.
2. 각 작업 완료 후 테스트를 실행한다.
3. 작업 단위로 커밋한다.
4. 작업 10까지 완료하면 최소 수직 기능 단면이 나온다.
5. 작업 13까지 완료하면 데모 가능한 Wiki/Graph UI가 나온다.
6. 작업 15까지 완료하면 MVP 검증 기준이 갖춰진다.

## 환경 변수

LLM 기능에는 다음 환경 변수가 필요하다.

```bash
export OPENAI_API_KEY="..."
export PIECEPOOL_LLM_MODEL="gpt-5-mini"
```

`PIECEPOOL_LLM_MODEL`은 기본값을 둘 수 있다. `OPENAI_API_KEY`가 없으면 LLM import는 실패 메시지와 재시도 흐름을 보여줘야 한다.

## 저장 구조

권장 Workspace 구조:

```text
PiecePool Workspace/
  archive/
  wiki/
  relations/
    relations.json
  sources/
    original-files/
  config/
    workspace.json
    subjects.json
  seed/
    demo-data.json
```

## 완료 기준

완료 조건:

- 앱이 하나의 로컬 Workspace를 열거나 생성한다.
- 텍스트 입력이 `archive/*.md`를 생성한다.
- PDF 가져오기가 텍스트를 추출하고 `archive/*.md`를 생성한다.
- 실제 LLM 호출 결과가 `wiki/*.md`와 `relations/relations.json`을 생성한다.
- Markdown 편집기에서 wiki 파일을 수정하고 저장할 수 있다.
- 앱 재실행 후 저장 내용이 복원된다.
- Graph View가 relation 메타데이터에서 렌더링된다.
- Graph node 클릭 시 연결 문서가 열린다.
- Graph edge 클릭 시 근거 패널이 열린다.
- Seed 데이터가 실제 파일과 메타데이터로 존재한다.
- `npm test`, `npm run build`, `npm run e2e`, `cargo test`, `cargo check`가 통과한다.

## 구현 중 결정할 항목

아래는 개발 중 결정 가능하다. 단, PRD의 제품 동작은 바꾸면 안 된다.

- Markdown 편집기 라이브러리
- Graph 렌더링 라이브러리
- Tauri PDF 파싱 방식
- LLM provider 세부 schema
- Relation 메타데이터를 단일 JSON으로 둘지 wiki frontmatter와 병행할지

## 관련 문서

- `PRD.md`
- `docs/superpowers/plans/2026-05-28-piecepool-mvp.md`
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
