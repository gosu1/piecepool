# 20-backend

Tauri + Rust 백엔드. 파일 I/O, PDF/OCR 텍스트 처리, Import 파이프라인, LLM 오케스트레이션, IPC 노출.

## 핵심 책임 (서준 명시)

| 영역 | 내용 |
|---|---|
| **Inbox 자동 요약** | Inbox에 들어온 자료를 LLM 호출로 자동 요약. 프롬프트 설계 인간이 직접 고민 |
| **데이터 병합/정리** | 여러 Source 간 중복·맥락 통합 |
| **노드 추출** | Concept (= graph node) 추출 |
| **노드 관계 매핑** | RelationType 분류 + Evidence 부착 |
| **인박스 중요도 판별** | 우선순위 결정 (시험 임박, 사용자 클릭 등) |
| **파인만(clarify)** | 입력이 불확실할 때 사용자에게 재질의. 기본 on(env 토글). 트리거 기준 설계 |

## 포함 문서 (작성 예정)

| 파일 | 내용 |
|---|---|
| `architecture.md` | Tauri + Rust 모듈 경계, 의존성 |
| `storage-io.md` | 파일 atomic write, 경로 해석, 외부 수정 감지 |
| `pdf-extraction.md` | PDF → text 추출 파이프라인 |
| `img-extraction.md` | 이미지 → text 변환 (백엔드 관점: vision LLM 위임, 파일 I/O·영속화) |
| `import-pipeline.md` | Inbox → archive → LLM(요약/추출/관계) → wiki/relations. 파인만/우선도 로직 포함 |
| `prompt-design.md` | 도메인 프롬프트 설계 노트 (한국어 학습, 파인만 문구). `30-llm/prompt-templates.md`와 짝 |
| `import-job-states.md` | `ImportJobStatus` 전이 다이어그램 (파인만 round-trip 포함) |
| `prioritization.md` | 인박스 중요도/우선도 알고리즘 |
| `ipc-api.md` | Frontend가 호출하는 Tauri command 목록 |
| `seed-data.md` | Seed 생성 절차/데이터 정의 |
| `error-handling.md` | PDF/LLM/저장/embed/relation 오류 처리 |

## Owner

Backend (@gosu1, @ChangSik88, @O6west)

## 의존

- [`../10-contracts/`](../10-contracts/) — 엔티티/layout/frontmatter 계약 (SSOT)
- [`../30-llm/`](../30-llm/) — LLM adapter 인터페이스. **`prompt-templates.md`는 Backend 주도** (공동 owner)
- [`../00-overview/pricing-model.md`](../00-overview/) — 단일 tier · 기능 토글(clarify/fact-check)

## 작성 일정

Phase 4. Tracking issue: [#1](https://github.com/gosu1/piecepool/issues/1)
