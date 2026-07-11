# OCR Client

PiecePool의 이미지/필기/스크린샷 → 텍스트 변환 파이프라인. **OCR 라이브러리가 아니라 vision-capable LLM 호출 기반**으로 동작한다.

> 본 문서는 `image` SourceType 입력의 처리 경로 단일 출처다. `text`/`summary_text`/`pdf` 처리는 [`../20-backend/ipc-api.md`](../20-backend/ipc-api.md) §4 참조.

상태: 🔜 MVP 예정

---

## 1. 범위

`SourceType = "image"` ([`entities.md#source`](../10-contracts/entities.md#source) — 이미지/필기/스크린샷)만 대상으로 한다.

스크린샷은 순수 텍스트만 담고 있지 않다 — 차트·표·그림이 섞인 경우가 흔하다 (예: 강의 슬라이드 캡처). 문자 인식만으로는 이런 입력의 의미를 살릴 수 없으므로, 본 문서는 **"OCR"을 문자 인식이 아니라 vision LLM의 이미지 이해**로 정의한다.

이미지는 별도의 업로드 화면이 아니라 Notion식 연속 note 편집 화면에 **인라인으로 첨부**된다 ([`scope-mvp.md`](../00-overview/scope-mvp.md) §2.3). 첨부 시 사용자가 그 이미지에 대한 설명을 직접 입력할 수 있으며, 이 사용자 설명은 §4에서 별도 블록으로 archive에 보존된다. (별도 "dropzone" 컴포넌트는 두지 않음 — 첨부 UI는 `markdown-editor.md`(#21) 소관)

---

## 2. 아키텍처 결정: 별도 OCR 라이브러리 없음

| 검토한 대안 | 기각 이유 |
|---|---|
| Tesseract.js | 한글 인식 약함(초성/중성/종성 조합 구조), handwritten traineddata 부재. 차트·그림 같은 비텍스트 시각 요소는 원천적으로 처리 불가 |
| Python 기반 (PaddleOCR, EasyOCR 등) | GitHub 스타 수는 높지만 전부 Python — 사이드카 프로세스 관리, `.dmg`/`.pkg` 패키징 용량·서명 대상 증가, pip/cargo/npm 툴체인 이원화가 새로 생김. 이 비용을 감수해도 한글 인식이 vision LLM보다 우월하다고 보기 어려움 |
| Apple Vision (네이티브) | macOS 전용이라 플랫폼 분기 필요. post-MVP 후보로 [`open-questions.md`](../00-overview/open-questions.md) 유지 |
| Google Vision API / Mathpix | 외부 OCR API 도입은 vision LLM 단일 경로 결정과 중복. post-MVP 후보로 유지 |

**결정**: `image` 입력은 전부 vision-capable LLM 호출 1단계로 처리한다. 별도 OCR 엔진을 두지 않는다.

---

## 3. Provider 라우팅

텍스트 단계와 동일한 provider를 vision에도 그대로 쓴다. 새 환경변수 분기 없음 ([`pricing-model.md`](../00-overview/pricing-model.md) §6 매트릭스 재사용).

| 단계 | Gemini |
|---|---|
| 1차 — 이미지 vision | Gemini vision |
| 2차 — 텍스트 요약/Concept 추출 | Gemini |

---

## 4. 출력 구조: 텍스트 / 사용자 설명 / AI 그림 설명 분리

vision 호출 결과 + 사용자 입력을 세 블록으로 명확히 구분한다.

```
[텍스트 그대로]
(이미지에 실제로 적힌 글자를 그대로 옮긴 부분)

[사용자 설명]
(첨부 시 사용자가 직접 입력한 설명 — 입력했을 때만 포함)

[그림 설명 — AI 해석, 원문 아님]
(차트·표·그림 등 비텍스트 시각 요소를 자연어로 설명한 부분)
```

**이유**: archive는 LLM이 덮어쓸 수 없는 원문 보존 영역이다. 텍스트와 사용자 설명은 둘 다 사용자 출처라 같은 신뢰도로 보존하고, 그림 설명은 AI의 해석이므로 별도 신뢰도로 마커를 분리한다. fact-check/evidence가 "실제로 적힌 것" / "사용자가 쓴 것" / "AI가 해석한 것"을 구분해 추적하도록 하기 위함이다.

---

## 5. 파이프라인 통합

```
이미지 인라인 첨부 (note 편집 화면, 사용자 설명 동시 입력 가능)
            ↓
        sources/original-files/에 원본 보존 (수정 금지)
            ↓
        1차 vision 호출 (§3, §4) → [텍스트]+[사용자 설명]+[그림 설명] 블록
            ↓
        archive/*.md 저장 (= 이 블록 전체가 "원문")
            ↓
        2차 텍스트 LLM 호출 (text/pdf와 동일 경로 — Concept/WikiPage/Relation 추출 + 그림 설명 정제)
            ↓
        wiki/*.md 저장 — 원본 이미지 `![[...]]` embed + 1차보다 더 정제한 그림 설명
            +
        relations.json 저장
```

`image`도 결국 `text`/`pdf`와 같은 2차 진입점(archive에 저장된 텍스트)으로 합류한다. 이미지 전용 분기는 1차 vision 호출 한 단계뿐이다. 단, 2차 호출에서 1차 그림 설명을 다시 다듬어 wiki용으로 더 자세하거나 정확한 설명을 생성한다 — archive의 1차 설명은 원문으로 그대로 보존, wiki는 정제본이라는 점에서 일반 텍스트의 2차 처리(Concept 추출)와 다르다.

저신뢰·모호 판정 시: 파인만 on이면 기존 `clarify_pending` 흐름을 그대로 재사용한다 (신규 상태 추가 없음). off면 트리거 안 함.

---

## 6. IPC 영향 (Backend 확인 필요)

[`../20-backend/ipc-api.md`](../20-backend/ipc-api.md) §4의 `ocr_image(path) → string` 커맨드는 본 설계와 맞지 않는다. OCR이 Rust IPC가 아니라 TS `llm/` adapter의 vision 호출이 되므로:

- 원본 이미지 bytes는 기존 `read_file_bytes` 커맨드로 충분 — 신규 Rust 커맨드 불필요
- `ocr_image`는 제거 또는 상태 재정의가 필요해 보임. 본 문서가 `ipc-api.md`를 직접 수정하지 않으므로 **Backend(#1)에 별도 확인 요청**

---

## 7. MVP 범위 / 후속 로드맵

| 항목 | MVP | 후속 |
|---|---|---|
| Tesseract.js / Python OCR | ⛔ 미채택 | — |
| Apple Vision (네이티브) | ⛔ | post-MVP 후보, [`open-questions.md`](../00-overview/open-questions.md) 유지 |
| Google Vision API / Mathpix | ⛔ | post-MVP 후보 (오프라인 제약 해소 필요) |
| 텍스트/사용자 설명/그림 설명 마커 분리 | ✅ | — |
| 사용자 이미지 설명 입력 (첨부 시) | ✅ | — |
| wiki 단계 그림 설명 2차 정제 | ✅ | — |

---

## 8. 의존 문서

- [`../10-contracts/entities.md`](../10-contracts/entities.md) — `SourceType`, `Source` (SSOT)
- [`../00-overview/pricing-model.md`](../00-overview/pricing-model.md) §6 — Provider 환경변수 매트릭스
- [`../00-overview/scope-mvp.md`](../00-overview/scope-mvp.md) — OCR MVP 포함 결정
- [`../00-overview/open-questions.md`](../00-overview/open-questions.md) — post-MVP 후보 추적
- [`../20-backend/ipc-api.md`](../20-backend/ipc-api.md) — IPC 커맨드 계약 (§6 영향)
- [`architecture.md`](architecture.md) — 프론트엔드 IPC 호출 패턴
- [`README.md`](README.md) — 40-frontend 영역 개요
