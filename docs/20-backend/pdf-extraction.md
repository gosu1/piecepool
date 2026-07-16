# PDF 텍스트 추출

`pdf/` 모듈의 PDF → 텍스트 추출 설계. 라이브러리 선정 근거, 추출 파이프라인, 추출 실패 복구를 다룬다.

> **계층 경계**: 이 모듈은 **PDF 바이너리 → 텍스트/페이지 메타데이터 변환에만 집중한다.**
> 결과 저장은 `storage/`, 파이프라인 각 단계 실행·상태 기록은 `import/`가 담당한다(상태머신 시퀀싱 소유는 TS — [architecture.md §1](architecture.md), [ADR-0007](../adr/0007-importjob-orchestration-ts.md)).
> PDF **page preview 렌더링은 백엔드 책임이 아니다** — 프론트(PDF.js)가 담당한다
> ([wikilink-embed.md §8](../10-contracts/wikilink-embed.md)). 백엔드는 텍스트와 **총 page 수**만 제공한다.

> ⚠️ **이중 경로([ADR-0010](../adr/0010-pdf-text-extraction-pdfjs-fallback.md), ADR-0005 대체)**: `pdf-extract`는
> `Identity-H/V` 외 predefined CMap(예: 한글 `UniKS-UTF16-H`)을 `panic!`으로 거부한다. 이 경우
> Rust는 panic을 `catch_unwind`로 삼켜 `AppError`로 반환하고(§3.1), 프론트가 **pdf.js로 재추출하는
> 폴백**을 수행한다(`src/lib/pdfText.ts`). 즉 텍스트 추출은 Rust 1차 + 프론트 pdf.js 2차의 이중 경로다.

---

## 1. 라이브러리 선정: `pdf-extract` (순수 Rust)

채택: **[`pdf-extract`](https://crates.io/crates/pdf-extract)** `0.10.0` — 페이지 단위 텍스트 추출 턴키 API.

> ⚠️ **버전 · 함수 사양 정렬**: `docs/superpowers/plans/tasks` 작업 9에 기재된 옛 사양
> (`pdf-extract = "0.7"` + 전체 단일 문자열 추출 `extract_text_from_mem`)을 폐기한다.
> `0.7`에는 페이지 단위 함수가 없고(`extract_text` / `extract_text_from_mem` 2개뿐),
> **페이지 단위 추출(`extract_text_from_mem_by_pages` → `Vec<String>`)은 `0.10.0`부터 제공**되므로
> `0.10.0`을 백엔드 표준으로 고정한다. 이에 맞춰 IPC 계약(`ipc-api.md`)의 `extract_pdf_text`
> 반환 타입도 단일 `string` → §2.2의 `PdfExtractResult` 객체로 상향한다(A안).

### 결정적 근거

| 근거 | 내용 |
|---|---|
| **순수 Rust · 번들 0** | C/C++ 라이브러리나 외부 바이너리가 필요 없다. `.dmg`/`.pkg` 배포에 추가 번들이 붙지 않고 빌드가 단순하다. |
| **턴키 텍스트 API** | `extract_text` / 페이지 단위 추출을 바로 제공한다. 저수준 content stream 파싱을 직접 짤 필요가 없다. |
| **검증된 채택량** | crates.io 누적 약 2.5M · 최근 90일 약 1.58M 다운로드로 Rust PDF 텍스트 추출의 사실상 표준. 내부적으로 `lopdf`(누적 10M+) 기반이라 파서 신뢰도가 높다. |
| **렌더 기능 불필요** | page preview는 프론트 PDF.js가 담당하므로([wikilink-embed.md §8](../10-contracts/wikilink-embed.md)), 렌더까지 포함하는 `pdfium-render`(Pdfium C++ 바이너리 번들 필요)는 백엔드에 과하다. |

### 탈락 후보 (요약)

- **`pdfium-render`**: 텍스트+렌더를 모두 주지만 Google Pdfium **네이티브 바이너리 번들**이 필요. 렌더는 프론트가 이미 가져가 백엔드엔 불필요한 무게. → 탈락
- **`lopdf` 단독**: 저수준 PDF 조작용. 텍스트 추출은 content stream을 직접 파싱해야 해 범위 초과. (단, `pdf-extract`가 내부 의존성으로 사용) → 직접 사용 안 함
- **`pdf` (pdf-rs)**: 순수 Rust 파서지만 텍스트 추출 API가 저수준이라 보일러플레이트가 많음. → 탈락

> 이미지 OCR(이미지 → 텍스트)은 본 문서 범위 밖이다. 별도 `ocr/` 모듈 설계에서 다룬다.

---

## 2. PDF → 텍스트 추출 파이프라인

`import/`의 `parsing` 단계([entities.md ImportJobStatus](../10-contracts/entities.md))에서 `pdf/`를 호출한다.

```
[입력] sources/original-files/<file>.pdf  (storage/가 경로 해석)
   │
   ▼
[1] 열기 / 헤더 검증     ── 손상·암호화·비PDF → pdf_extract (중단, §3.1)
   │
   ▼
[2] 총 page 수 산출       ── page_count (N) 확정. 0 page → pdf_extract (중단)
   │
   ▼
[3] page 단위 텍스트 추출  ── Vec<PageText> { page_index(1-indexed), text }
   │                          빈 텍스트 page는 빈 문자열 유지 (page 인덱스 보존)
   ▼
[4] 결과 반환             ── PdfExtractResult { page_count, pages }
                            (저장은 import/ → storage/가 수행, 본 모듈은 반환만)
```

### 2.1 page 인덱싱 규약 (1-indexed)

- 추출 결과의 page 번호는 **1-indexed**다. `[[file.pdf#page=N]]`의 `N`과 정확히 일치해야 한다
  ([wikilink-embed.md §3.1](../10-contracts/wikilink-embed.md)).
- 텍스트가 비어 있는 page도 **빈 문자열로 자리를 유지**한다. page 인덱스가 어긋나면
  `SourceRef.page` ↔ 실제 page 매핑이 깨지므로, 빈 page를 건너뛰어 압축하지 않는다.
- 반환값에 `page_count`(총 N)를 포함한다. 이 값이 `#page=N` **범위 검증의 단일 기준**이 된다(§3.2).

### 2.2 반환 형태 (개념)

```rust
// PdfExtractResult는 엔티티가 아니라 IPC 페이로드 타입이다(entities.md 미러 대상 아님).
// models/ 에 ts-rs로 정의해 TS 타입을 생성한다 → 프론트가 객체 그대로 사용.
struct PdfExtractResult {
    page_count: usize,           // 총 page 수 (1-indexed 범위 검증 기준)
    pages: Vec<PageText>,        // 길이 == page_count
}
struct PageText {
    page: usize,                 // 1-indexed
    text: String,                // 빈 page는 "" (자리 보존)
}
```

#### 내부 `pdf/` 반환 vs IPC 표면

- 위 `PdfExtractResult`는 **`pdf/` 모듈의 내부 Rust 반환 타입**이다.
- IPC command `extract_pdf_text`의 반환 타입은 별개 레이어다 — `commands/`는 thin 어댑터이므로
  내부 타입과 1:1일 필요는 없다([architecture.md §3](architecture.md)).
- 단 **page 단위 출처(`#page=N`)는 제품 핵심 가치**이므로, 본 설계는 IPC 표면도 단일 `string`이 아닌
  `PdfExtractResult` 객체로 **상향한다(A안)**. 단일 string으로 평탄화하면 "몇 쪽에서 왔는지"가 소실되어
  page 단위 `SourceRef`를 만들 수 없다.
- ⚠️ **LLM 입력은 별도 hop이다**: `LlmWikiInput.sourceText`는 여전히 단일 문자열이므로
  ([provider-config.md §1](../30-llm/provider-config.md)), LLM이 실제로 page를 인용하려면 페이지 마커
  주입 또는 입력 구조 확장이 추가로 필요하다 — 본 문서 범위 밖, LLM 계층 결정 사항이다.

> `pdf/`는 텍스트와 메타데이터만 반환한다. archive `.md` 작성·frontmatter 부여는
> `import/`(archiving 단계)와 `storage/`의 책임이다.

---

## 3. 추출 실패 복구

오류는 **저장/진행을 막는 치명적(fatal)** 과 **경고(warn)** 로 나뉜다.
`kind` 확정 분류·메시지는 `error-handling.md §3.2 / §6` (별도 PR)이 SSOT이며, 본 문서는 PDF 영역 정책만 명시한다.

### 3.1 추출 불가 — `pdf_extract` (fatal)

다음은 텍스트 추출 자체가 불가능한 경우로, `kind = "pdf_extract"`로 중단한다.
단, 암호화 문서는 사용자가 직접 조치(암호 해제)할 수 있으므로 `errorMessage`를 명확히 분리한다.

| 상황 | 처리 (errorMessage) |
|---|---|
| 파일이 PDF가 아님 / 헤더 손상 | `pdf_extract` 중단, "PDF 파일이 손상되었거나 올바른 형식이 아닙니다." |
| 암호화·열람 제한으로 파싱 불가 | `pdf_extract` 중단, "암호가 설정된 PDF는 지원하지 않습니다. 보안 해제 후 다시 시도해주세요." _(추후 별도 kind `pdf_encrypted` 분리 검토)_ |
| page 수 0 또는 본문 구조 파싱 실패 | `pdf_extract` 중단, "PDF 구조를 분석할 수 없습니다." |
| 미지원 폰트/CMap 인코딩(`pdf-extract` 내부 `panic!`) | `catch_unwind`로 삼켜 `pdf_extract` 반환, "이 PDF의 폰트/인코딩을 지원하지 않아…". 프론트가 pdf.js 폴백으로 재시도([ADR-0010](../adr/0010-pdf-text-extraction-pdfjs-fallback.md)) |

- 중단 시 `import/`는 `ImportJob.status = failed` + `errorMessage`로 전이한다
  ([entities.md ImportJob](../10-contracts/entities.md)).
- **원본 PDF는 보존**한다. 추출 실패가 원본 파일 삭제로 이어지지 않는다.
- 우리 코드에서 `unwrap()`/`panic!()` 금지 — 모든 실패는 `AppError`로 `?` 전파한다([architecture.md §4](architecture.md)).
  단 서드파티 `pdf-extract`가 내부에서 `panic!`하므로, 그 호출만 `std::panic::catch_unwind`로 감싸
  `AppError`로 변환한다(앱 크래시 방지 — Cargo 기본 unwind 전략 전제).

> `pdf-extract`는 `extract_text_*_encrypted` 변종으로 암호화 여부를 구분 감지할 수 있어,
> 위 메시지 분리가 가능하다. 별도 kind(`pdf_encrypted`) 신설은 `error-handling.md` 레지스트리
> 변경(별도 PR)이 선행돼야 하므로, 우선 메시지만 분리하고 kind 신설은 해당 PR에 코멘트로 남긴다.

### 3.2 page 범위 초과 검증의 책임 위임 (본 모듈 밖)

`[[file.pdf#page=N]]`의 `N`이 총 page 수를 초과하는 검증은 **본 모듈(`pdf/`)의 책임이 아니다.**

- 본 모듈은 입력으로 **파일 경로만** 받으므로 마크다운의 `#page=N` 존재 자체를 알 수 없다.
  추출기에서 범위 초과를 처리하려는 것은 SRP 위반(범주 오류)이다.
- 본 모듈의 역할은 프론트 검증의 기준이 되는 **`page_count`를 정확히 산출해 넘기는 것**까지다.
- 실제 범위 초과 판단 + `pdf_page_range` 경고/첫 page 표시는 **프론트엔드 렌더 계층**의 책임이며,
  규약은 [wikilink-embed.md §3.2](../10-contracts/wikilink-embed.md)(범위 초과 처리)와
  [wikilink-embed.md §8](../10-contracts/wikilink-embed.md)(렌더링 책임 분리)을 따른다.

### 3.3 부분 추출 (일부 page만 텍스트 없음)

스캔 PDF 등으로 **일부 page 텍스트가 비어 있는** 경우는 정상 완료로 처리한다.

- 빈 page는 빈 문자열로 보존하고(§2.1) 추출은 성공(`completed`)으로 간주한다.
- 전 page가 비어 있으면(이미지 전용 스캔본 등) 텍스트가 0인 상태로 반환된다 — 이때의
  후속 처리(OCR 유도/빈 결과 안내)는 본 모듈 범위 밖이며 `import/`·OCR 설계에서 다룬다.

---

## 4. 책임 분리 요약

| 책임 | 위치 |
|---|---|
| PDF → 텍스트/메타데이터 변환 | **`pdf/` (본 문서)** |
| page 인덱싱(1-indexed) · 총 page 수 산출 | **`pdf/`** |
| 추출 결과 archive `.md` 저장 | `storage/` ([storage-io.md](storage-io.md)) |
| `parsing → archiving` 상태 전이 | `import/` |
| PDF page preview 렌더링 | Frontend (PDF.js, [wikilink-embed.md §8](../10-contracts/wikilink-embed.md)) |
| `#page=N` 범위 초과 UI 메시지 | Frontend ([wikilink-embed.md §3.2](../10-contracts/wikilink-embed.md)) |

---

## 5. 관련 문서

| 문서 | 내용 |
|---|---|
| [`../10-contracts/wikilink-embed.md`](../10-contracts/wikilink-embed.md) | PDF page 참조(`#page=N`) 규약 · 범위 초과 처리 SSOT |
| [`../10-contracts/workspace-layout.md`](../10-contracts/workspace-layout.md) | `sources/original-files/` 경로 규약 |
| [`../10-contracts/entities.md`](../10-contracts/entities.md) | `Source` · `ImportJobStatus` 타입 |
| [`./architecture.md`](architecture.md) | 모듈 경계 · `AppError` 전파 규칙 |
| [`./ipc-api.md`](ipc-api.md) | `extract_pdf_text` command 스펙 |
| `./error-handling.md` | `pdf_extract` / `pdf_page_range` kind 레지스트리 (별도 PR) |
| `./import-pipeline.md` | `parsing → archiving` 파이프라인 상세 (작성 예정) |

---

## 6. 변경 이력 노트

- 신규 작성. `pdf/` 모듈의 텍스트 추출 라이브러리(`pdf-extract`) 선정 근거와 실패 복구 정책을 확정.
- **A안 채택**: page 단위 출처(`#page=N`)를 살리기 위해 반환을 단일 `string`이 아닌
  `PdfExtractResult` 객체로 한다. 이에 따라 `ipc-api.md`(반환 타입)와 `plans/tasks` 작업 9
  (버전 `0.7`→`0.10.0`, `extract_text_from_mem`→`_by_pages`)도 함께 정렬해야 한다.
- **SRP 정정**: `#page=N` 범위 초과(`pdf_page_range`) 검증은 본 모듈 책임이 아니며(경로만 입력받음)
  프론트 렌더 계층으로 위임한다. 본 모듈은 `page_count` 산출까지만 담당.
- page 1-indexing 규약의 SSOT는 `wikilink-embed.md §3`이며 본 문서는 백엔드 관점 반영이다.
- `pdf_extract` kind 및 암호화 분리(`pdf_encrypted` 신설 제안)는 `error-handling.md`
  레지스트리(별도 PR)와 정렬한다.
