# Import 파이프라인

Inbox 자료 한 건이 **archive → LLM 재구성 → wiki/relations 영속화**까지 흐르는 전체 파이프라인.
`import/` 모듈이 단계 실행과 `ImportJob` 상태를 조율한다.

> 경계 / SSOT 링크 (본 문서에 규칙 복붙 금지 — 링크만):
> - 상태 **전이 다이어그램** = [`import-job-states.md`](import-job-states.md) (Cooperative)
> - 인박스 **우선도** = `prioritization.md`(작성 예정)
> - LLM 호출·검증·재시도·되묻기 = [`../30-llm/output-validation.md`](../30-llm/output-validation.md), 변환 스키마 = [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md)
> - PDF 추출 = [`pdf-extraction.md`](pdf-extraction.md), 파일 I/O·저장 = [`storage-io.md`](storage-io.md)
> - 오류 `kind`·`Outcome` 모델 = [`error-handling.md`](error-handling.md), 엔티티 = [`../10-contracts/entities.md`](../10-contracts/entities.md)

---

## 1. 책임 & 경계

`import/`는 **각 단계 실행(파일 I/O) + `ImportJob` 상태 기록**을 담당한다. 상태머신 **시퀀싱 소유는 TS 서비스층**이다([ADR-0007](../adr/0007-importjob-orchestration-ts.md), §2).

| 다루는 것 | 다루지 않는 것 (위임) |
|---|---|
| 각 단계 실행(파싱·저장 등) | 파일 읽기/쓰기 → `storage/` · 시퀀싱 주도 → TS `useImportStore` |
| `ImportJob` 상태 전이 기록 | PDF→텍스트 변환 → `pdf/` |
| warn·partial 수집(`Outcome`) | LLM 요약/개념추출/관계생성 → TS `src/llm/` |
| 동시 쓰기 직렬화(§6) | 상태 **다이어그램 정의** → `import-job-states.md` |
| dedup/merge 트리거(§7) | 인박스 **우선도 산정** → `prioritization.md` |

> **LLM 로직은 Rust가 소유하지 않는다.** `import/`는 TS 어댑터 산출(`LlmWikiResult`)을 받아 영속화만 조율한다 (CLAUDE.md §LLM, [architecture.md §2](architecture.md)).

---

## 2. 오케스트레이션 주도 (✅ 결정: TS 주도)

- TS 서비스층(`useImportStore`)이 상태머신 **시퀀싱**을 주도하고, 각 단계에서 Rust의 원자적 IPC command를 호출한다 ([ipc-api.md §4](ipc-api.md)).
- Rust `import/`는 각 단계 **실행**(파싱·저장 등 파일 I/O)을 담당하고, LLM 호출은 TS 어댑터가 수행한다. 시퀀싱 **트리거는 TS**가 소유한다 (option A).

> ✅ **결정 (2026-07-01)**: 시퀀싱 주체 = **TS 서비스층**(option A). 근거·대안은 [ADR-0007](../adr/0007-importjob-orchestration-ts.md), 전이 다이어그램은 [`import-job-states.md`](import-job-states.md). `architecture.md`·CLAUDE.md의 "import/ 상태머신 소유" 표현은 후속 동기화 대상.

---

## 3. 파이프라인 단계

`ImportJobStatus`([entities.md](../10-contracts/entities.md)) 순서를 **건너뛰거나 재정렬하지 않는다**.

```
idle → parsing → archiving → llm_processing → writing → completed
                                   │ (Premium only)
                                   ▼
                            clarify_pending ── 사용자 응답 ─► llm_processing(2차) → writing → completed
                                   │           사용자 무시 ─► writing(1차 결과 저장) → completed
                            (어느 단계든) 치명적 오류 ─► failed
```

| 단계 | 하는 일 | 호출 / 산출 |
|---|---|---|
| **parsing** | 입력 해석. PDF면 텍스트 추출 | `pdf/` → `PdfExtractResult { page_count, pages }` ([pdf-extraction.md §2](pdf-extraction.md)). text 입력은 그대로 통과 |
| **archiving** | 원문을 archive에 보존 | `storage/` `save_source` → `Source` + `ArchiveNote`(`archive/*.md`) + 원본(`sources/original-files/`). **기존 archive 덮어쓰기 금지**([storage-io.md §3.5](storage-io.md)) |
| **llm_processing** | 요약·개념추출·관계생성 | **TS `src/llm/`** 수행 → `LlmWikiResult`. 입력 = archive 텍스트. 검증/재시도 = [output-validation §3~4](../30-llm/output-validation.md) |
| **writing** | 결과 영속화 | `storage/` `save_wiki_page`(dedup §7) + `save_relations`(`relations/relations.json`) |
| **completed** | 종료 | warn·partial 있으면 `Outcome.warnings` 동봉(§4) |

> parsing 입력은 `Source.type`(`text`/`pdf`/`summary_text`/`image`)에 따라 분기한다. `image`(OCR)는 본 MVP 범위 밖.

---

## 4. warn / partial 수집 (`Outcome`)

LLM/검증/저장 단계의 **비치명적** 결과는 실패가 아니다. `?`로 중단하지 않고 `Outcome { value, warnings }`로 모아 **`completed`로 종료**한다 ([error-handling.md §4](error-handling.md)).

- 부분 drop(`relation_invalid`·`sourceref_invalid`) → 유효분만 저장, drop 내역을 `ImportJob.errorMessage`에 기록 ([output-validation §5.2](../30-llm/output-validation.md)).
- 경고(`embed_unresolved` 등) → 저장 허용, 표시만.
- **fatal**만 `failed`로 전이 + `errorMessage`.

---

## 5. Premium 되묻기 (clarify) round-trip

1차 `LlmWikiResult`가 불확실 임계치를 넘으면 `clarify_pending`으로 사용자에게 재질의한다. 트리거 조건·흐름·1회 제한은 [output-validation §6](../30-llm/output-validation.md) SSOT.

- **되묻기 토글 off면 되묻기 없음** — `llm_processing` → 바로 `writing` (단일 tier, [ADR-0002](../adr/0002-single-tier-pricing.md)).
- `clarify_pending`은 [`entities.md`](../10-contracts/entities.md) `ImportJobStatus` enum에 **정의됨**(2026-05-29 `contracts-change` 추가). 전이는 [`import-job-states.md`](import-job-states.md) 참조.

---

## 6. 동시성 — 쓰기 직렬화

`storage/`는 잠금을 소유하지 않으므로([storage-io.md §2.3](storage-io.md)) **동일 파일 동시 쓰기 직렬화는 `import/`가 책임진다.**

- 한 `ImportJob`의 `writing` 단계는 대상 파일별로 순차 실행한다.
- wiki 덮어쓰기 전 `storage/`가 노출하는 `last_known_mtime`으로 **외부 수정 충돌을 먼저 확인**한다. 충돌 시 덮어쓰지 않고 경고 ([storage-io.md §3.5](storage-io.md)).

---

## 7. dedup / merge

`save_wiki_page`는 `Concept.normalizedTitle`(소문자·공백정규화)이 이미 있으면 **새 WikiPage를 만들지 않고 기존에 merge**한다 (CLAUDE.md §LLM Output, [llm-output-schema.md](../10-contracts/llm-output-schema.md)). 이것이 "자료가 쌓일수록 지식 지도가 성장"하는 핵심 동작이다. 응답 내 중복 `normalizedTitle`은 마지막 1개만 유지 ([output-validation §3.7](../30-llm/output-validation.md)).

---

## 8. 관련 문서

| 문서 | 내용 |
|---|---|
| [`import-job-states.md`](import-job-states.md) | `ImportJobStatus` 전이 다이어그램 (되묻기 round-trip) |
| `prioritization.md`(작성 예정) | 인박스 중요도/우선도 |
| [`pdf-extraction.md`](pdf-extraction.md) · [`storage-io.md`](storage-io.md) | parsing·저장 단계가 호출하는 모듈 |
| [`error-handling.md`](error-handling.md) | `Outcome` 모델 · 오류 `kind` |
| [`../30-llm/output-validation.md`](../30-llm/output-validation.md) | LLM 검증·재시도·부분실패·되묻기 |
| [`ipc-api.md`](ipc-api.md) | `extract_pdf_text`·`save_source`·`save_wiki_page`·`save_relations` |

---

## 9. 변경 이력 노트

- 신규 작성 (@O6west). storage-io·pdf-extraction 인터페이스에 맞춰 단계별 호출을 정의.
- §2 오케스트레이션 주도 = **TS 주도(option A) 결정** ([ADR-0007](../adr/0007-importjob-orchestration-ts.md), [`import-job-states.md`](import-job-states.md)).
- `clarify_pending`은 enum 미존재 — `contracts-change` 선행 필요.
