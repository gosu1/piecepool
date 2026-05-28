# 20-backend

Tauri + Rust 백엔드. 파일 I/O, PDF 추출, Import 파이프라인, IPC 노출.

## 포함 문서 (작성 예정)

| 파일 | 내용 |
|---|---|
| `architecture.md` | Tauri + Rust 모듈 경계, 의존성 |
| `storage-io.md` | 파일 atomic write, 경로 해석, 외부 수정 감지 |
| `pdf-extraction.md` | PDF → text 추출 파이프라인 |
| `import-pipeline.md` | Inbox → archive → LLM → wiki/relations 흐름 |
| `import-job-states.md` | `ImportJobStatus` 전이 다이어그램 |
| `ipc-api.md` | Frontend가 호출하는 Tauri command 목록 |
| `seed-data.md` | Seed 생성 절차 및 데이터 정의 |
| `error-handling.md` | PDF/LLM/저장/embed/relation 오류 처리 |

## Owner

Backend (@gosu1, @ChangSik88, @O6west)

## 의존

- [`../10-contracts/`](../10-contracts/) — 엔티티/layout/frontmatter 계약
- [`../30-llm/output-validation.md`](../30-llm/) — LLM 호출 결과 검증 (조합)

## 작성 일정

Phase 4 (PRD_REFACTOR_PLAN 참조). Phase 2 (10-contracts) 완료 후 시작.
