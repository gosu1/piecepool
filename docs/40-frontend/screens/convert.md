# Convert (파편 → 정리 글)

archive 노트 화면에서 파편 필기를 논리정연한 글로 변환하는 인터랙션. 스트리밍 미리보기 + 저장까지의 React 구현 설계만 다룬다.

> 파이프라인·프롬프트·영속화 규칙의 단일 출처는 [`../../30-llm/note-synthesis.md`](../../30-llm/note-synthesis.md)다. 결정 배경: [ADR-0008](../../adr/0008-note-synthesis-streaming.md).

상태: 🔜 구현 예정

---

## 1. 범위

- Source reader(archive 노트 읽기 화면)의 AI 액션 바에 "정리 글 변환" 버튼 추가
- 스트리밍 미리보기 패널(ConvertPanel) — 파편 원문과 나란히(side-by-side) 표시
- 변환 job 상태 스토어(`useConvertStore`)와 StatusBar 진행 표시
- Inbox 작성 화면에는 두지 않는다 (MVP) — 변환은 저장된 노트의 `sourceId`가 필요하고, Inbox는 이미 ImportJob 상태머신을 소유

---

## 2. 화면 구성

읽기 모드에서 변환 job이 이 노트의 것일 때 본문을 2열 그리드로 감싼다 (편집 모드의 에디터|미리보기 그리드와 동일 패턴):

```
┌─ AI 액션 바 ──────────────────────────────────┐
│ [AI 위키 생성] [간극 점검] [정리 글 변환/중단] │
├──────────────────────┬────────────────────────┤
│ 파편 원문 (읽기)      │ ConvertPanel           │
│                      │  ├ 헤더: AI 작성 배너   │
│                      │  │  + 엔진 배지 + 글자수│
│                      │  ├ 본문: 스트리밍 마크다운│
│                      │  │  (오토스크롤)  ▍     │
│                      │  └ 완료: 저장됨 · 열기·닫기│
└──────────────────────┴────────────────────────┘
```

- 첫 delta 이전: 스켈레톤 3줄 (reasoning 지연 구간).
- 완료 후 자동 탭 전환 없음 — "열기" 버튼으로만 이동 (스트림을 읽는 중 탭 강탈 금지).

---

## 3. 상태 — `useConvertStore`

변환 job은 `ImportJob`이 아니다 — 별도 스토어(zustand, importStore 패턴)로 관리하고 상태머신을 오염시키지 않는다.

상태 전이:

```
idle → streaming → saving → done
         │            
         ├→ cancelled   (취소 — 스트림만 중단, 추출은 계속)
         └→ failed      (부분 텍스트 유지, 저장 안 됨)
```

job 필드 (구현 SSOT는 `src/store/convertStore.ts`):

| 필드 | 의미 |
|---|---|
| `space` / `notePath` / `noteTitle` / `sourceId` | job 정체성 — 미리보기는 이 노트의 화면에서만 렌더 |
| `status` | 위 전이도 6종 |
| `text` | 스로틀된 스트리밍 텍스트 스냅샷 |
| `engine` | `openai` 또는 `heuristic` (배지 표시) |
| `warning` / `error` | 부분 생성·폴백 사유 / 실패 사유 |
| `wikiPath` | done 시 "열기" 대상 |

- AbortController·delta 누적 버퍼·플러시 타이머는 스토어 상태가 아니라 모듈 스코프 (React 구독 대상 아님).
- single-flight: 비터미널 job이 있으면 새 변환 거부 (버튼 disable + 스토어 이중 가드).
- localStorage 영속화 없음 — 비터미널 job은 복원 의미가 없다 (importStore와 같은 원칙).
- 탭 전환에도 job은 스토어에서 계속 진행 — 노트로 돌아오면 미리보기 재부착.

---

## 4. 스트리밍 렌더

- **스로틀 100ms** (트레일링 플러시): react-markdown은 전체 재파싱이라 delta마다 렌더하면 낭비. 초당 10회면 충분.
- **오토스크롤**: 스크롤이 바닥 48px 이내면 stick — 텍스트 갱신 시 바닥으로. 사용자가 위로 스크롤하면 자동 해제, 다시 바닥으로 내리면 재개. 버튼·상태머신 없음.
- 스트리밍 중에는 embed 미리보기(`embedSpace`)를 전달하지 않는다 — `![[...]]`가 재파싱마다 파일 바이트를 다시 읽는 churn 방지. 저장된 위키 탭에서는 정상 렌더.
- 미완성 마크다운(열린 코드펜스 등)이 잠깐 그대로 보이는 것은 수용 (react-markdown이 안전하게 처리).
- 휴리스틱 경로는 전체 텍스트 즉시 표시 — 가짜 스트리밍 없음, "휴리스틱" 배지로 구분.

---

## 5. 가드 & 엣지 매트릭스

| 상황 | 동작 |
|---|---|
| 빈 노트 / embed 제거 후 20자 미만 | 안내 메시지, 호출 안 함 |
| 노트 탭에 미저장 편집(dirty) | "저장 후 변환하세요" — 디스크와 다른 텍스트 변환 금지 |
| 기존 정리본 존재 | 변환 시작 **전** ConfirmDialog "기존 정리본을 덮어씁니다" |
| 변환 중 재클릭 / 다른 노트에서 변환 | 버튼 disable + single-flight 거부 안내 |
| 취소 | 스트림만 중단, 부분 텍스트 화면 유지(저장 안 함), 추출은 계속 — UI에 명시 |
| 스트림 도중 실패 | `failed` + 부분 텍스트 + "저장 안 됨" 배지 + 다시 시도 버튼 |
| 탭 전환/닫기 (스트리밍 중) | job 계속 진행, StatusBar로 관찰, 복귀 시 재부착 |
| 앱 종료 (스트리밍 중) | 아무것도 저장 안 됨 — 완료 시에만 저장하므로 안전 |
| 추출만 실패 | 정리 글은 정상 저장, 추출 실패는 기존 상태줄에 독립 표시 |

폴백(키 없음·재시도·incomplete)은 [`note-synthesis.md`](../../30-llm/note-synthesis.md) §5를 따른다.

---

## 6. StatusBar

`useConvertStore`를 직접 구독해 진행 세그먼트를 추가한다 (import 진행 점과 같은 패턴): "정리 글 생성 · N자" → "저장" → "완료"/"실패".

---

## 7. MVP 범위

| 항목 | MVP | 후속 |
|---|---|---|
| 정리 글 변환 버튼 + 스트리밍 미리보기 | ✅ | — |
| 개념·관계 추출 동시 실행 | ✅ (기존 파이프라인 그대로) | — |
| 키 없는 휴리스틱 폴백 | ✅ | — |
| 실시간 자동 변환 (타이핑 디바운스) | ⛔ | 설정 토글로 후속 (ADR-0008 대안 E) |
| Inbox 작성 화면 내 변환 | ⛔ | 저장→변환 2클릭으로 충분, 필요 시 후속 |
| 사용자 수정 감지(해시) 후 조건부 확인 | ⛔ | post-MVP — MVP는 존재만으로 확인 |

---

## 8. 의존 문서

- [`../../30-llm/note-synthesis.md`](../../30-llm/note-synthesis.md) — 파이프라인·폴백·영속화 SSOT
- [`../../adr/0008-note-synthesis-streaming.md`](../../adr/0008-note-synthesis-streaming.md) — 결정 배경
- [`../../10-contracts/entities.md`](../../10-contracts/entities.md) — WikiPage/ArchiveNote 계약
- [`../architecture.md`](../architecture.md) — 스토어·라우팅 구조
- [`inbox.md`](inbox.md) — 인접 화면 (ImportJob 소유)
- [`../README.md`](../README.md) — 40-frontend 개요
