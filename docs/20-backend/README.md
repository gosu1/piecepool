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
| **핵심 주제 게이트** | Gemini가 노트의 핵심 주제(`##` 섹션)를 판별하고, 사용자가 파인만에 답하고 "이해했다"고 선언한 것만 위키로 보낸다. 노트(`archive/`)는 언제나 저장 — 막는 것은 위키뿐. 키 없음·판별 실패 시 fail-open. (파인만 자체는 파이프라인 단계가 아니라 **에디터 도구** — 자동 재질의 트리거 없음) |

## 포함 문서 (작성 예정)

| 파일 | 내용 |
|---|---|
| `architecture.md` | Tauri + Rust 모듈 경계, 의존성 |
| `storage-io.md` | 파일 atomic write, 경로 해석, 외부 수정 감지 |
| `pdf-extraction.md` | PDF → text 추출 파이프라인 |
| `img-extraction.md` | 이미지 → text 변환 (백엔드 관점: vision LLM 위임, 파일 I/O·영속화) |
| `import-pipeline.md` | Inbox → archive → LLM(요약/추출/관계) → wiki/relations. 핵심 주제 게이트/우선도 로직 포함 |
| `prompt-design.md` | 도메인 프롬프트 설계 노트 (한국어 학습, 파인만 되물음 문구). `30-llm/prompt-templates.md`와 짝 |
| `import-job-states.md` | `ImportJobStatus` 전이 다이어그램 (핵심 주제 게이트 포함) |
| `prioritization.md` | 인박스 중요도/우선도 알고리즘 |
| `ipc-api.md` | Frontend가 호출하는 Tauri command 목록 |
| `seed-data.md` | Seed 생성 절차/데이터 정의 |
| `error-handling.md` | PDF/LLM/저장/embed/relation 오류 처리 |

## Owner

Backend (@gosu1, @ChangSik88, @O6west)

## 의존

- [`../10-contracts/`](../10-contracts/) — 엔티티/layout/frontmatter 계약 (SSOT)
- [`../30-llm/`](../30-llm/) — LLM adapter 인터페이스. **`prompt-templates.md`는 Backend 주도** (공동 owner)
- [`../00-overview/pricing-model.md`](../00-overview/) — 단일 tier · 기능 토글(fact-check)

## 작성 일정

Phase 4. Tracking issue: [#1](https://github.com/gosu1/piecepool/issues/1)
