# PDF 텍스트 추출

`pdf/` 모듈의 PDF → 텍스트 추출 설계. 라이브러리 선정 근거, 추출 파이프라인, 추출 실패 복구를 다룬다.

> **계층 경계**: 이 모듈은 **PDF 바이너리 → 텍스트/페이지 메타데이터 변환에만 집중한다.**
> 결과 저장은 `storage/`, 파이프라인 각 단계 실행·상태 기록은 `import/`가 담당한다(상태머신 시퀀싱 소유는 TS — [architecture.md §1](architecture.md), [ADR-0007](../adr/0007-importjob-orchestration-ts.md)).
> PDF **page preview 렌더링은 백엔드 책임이 아니다** — 프론트(PDF.js)가 담당한다
> ([wikilink-embed.md §8](../10-contracts/wikilink-embed.md)). 백엔드는 텍스트와 **총 page 수**만 제공한다.

> ⚠️ **이중 경로([ADR-0011](../adr/0011-pdf-text-extraction-pdf-inspector.md), ADR-0010 대체)**: 텍스트 추출은
> Rust 1차 + 프론트 pdf.js 2차의 이중 경로다. 1차 엔진은 `pdf-inspector`이며, 글자가 깨졌다고 판단한
> 페이지를 **빈 문자열로** 돌려준다(옛 `pdf-extract`는 같은 자리에서 `panic!`했다). 프론트는 전 페이지가
> 비어 있으면 **pdf.js로 재추출**한다(`src/lib/pdfText.ts`의 `hasText()` → `extractPdfTextWithFallback`).
> 한글 2단 학회 조판 PDF가 이 경로로 간다 — 근거 실측은 ADR-0011.

---

## 1. 라이브러리 선정: `pdf-inspector` (순수 Rust)

채택: **[`pdf-inspector`](https://crates.io/crates/pdf-inspector)** `1.17.0` (MIT) — 페이지 단위 Markdown 추출 API
`extract_pages_markdown(path, pages) → PagesExtractionResult`. 선정 근거와 실측은
[ADR-0011](../adr/0011-pdf-text-extraction-pdf-inspector.md)이 SSOT이며, 여기서는 이 모듈이 알아야 할 것만 적는다.

### 이 모듈이 알아야 할 사양

| 항목 | 내용 |
|---|---|
| **페이지 번호는 0-indexed** | `PageMarkdown.page`가 0부터 센다. 본 모듈 계약은 1-indexed(§2.1)이므로 `pdf/`가 `+1` 변환한다. 여기가 어긋나면 `SourceRef.page`가 통째로 한 칸씩 밀린다. |
| **실패는 `PdfError`** | `Io` / `Parse` / `Encrypted` / `InvalidStructure` / `NotAPdf`. 암호화 판별이 에러 문자열 검색이 아니라 타입 매칭이다(§3.1). |
| **깨진 글자는 빈 문자열** | 글자가 깨졌다고 판단한 페이지는 `needs_ocr = true` + 빈 Markdown으로 온다. 오류가 아니라 정상 반환이며, 이것이 프론트 폴백을 부르는 신호다. |
| **본문이 Markdown** | 표를 Markdown 표로 복원한다. 옛 `pdf-extract`는 평문으로 평탄화해 열 정보를 잃었다. 이 텍스트가 그대로 LLM 입력이 된다. |
| **bcmap은 파일시스템에서 읽는다** | 아래 §1.1. |

### 1.1 bcmap 배선 (배포 앱에서만 드러나는 함정)

한글·일본어·중국어 PDF가 글자 대응표(CMap)를 파일 안에 넣지 않고 이름으로만 참조하는 경우, 그 표(`.bcmap`)를
읽는 쪽이 갖고 있어야 글자가 나온다. `pdf-inspector`는 **네이티브 빌드에서 이 표를 파일시스템에서 읽는다**
(크레이트에 내장하는 것은 wasm 타깃뿐). 찾는 순서는 이렇다.

1. `PDF_INSPECTOR_BCMAPS_DIR` 환경변수
2. 없으면 **빌드한 기계의 카고 캐시 경로**

2번 때문에 개발 빌드는 우연히 동작하고, 배포 앱에서는 예외도 로그도 없이 한글 CID 폰트 처리만 빠진다.
따라서 표 168종을 `src-tauri/resources/bcmaps/`에 담아 Tauri 리소스로 번들하고
(`tauri.conf.json` → `bundle.resources`), 앱 시작 시 `pdf::set_bcmaps_dir`로 위 환경변수를 건다
(`lib.rs`의 `setup`). 이 함수는 표가 실제로 있는지 확인해 실패를 로그로 남긴다 — 확인하지 않으면
실패가 어디에도 안 남는다.

> **검증은 배포 빌드로만 된다.** 개발 빌드 통과는 증거가 아니다.
> Adobe CMap 자료(BSD-3) 고지는 [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md).

> 이미지 OCR(이미지 → 텍스트)은 본 문서 범위 밖이다. 별도 `ocr/` 모듈 설계에서 다룬다.
> `pdf-inspector`가 `pages_needing_ocr`를 페이지 단위로 주지만 현재 쓰지 않는다 — OCR 경로는
> vision LLM([ADR-0003](../adr/0003-ocr-vision-llm.md))이다.

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
| 글자가 깨진 페이지(미지원 폰트/CMap 인코딩 등) | **중단하지 않는다.** 해당 페이지를 빈 문자열로 반환하고, 프론트가 pdf.js 폴백으로 재시도([ADR-0011](../adr/0011-pdf-text-extraction-pdf-inspector.md)) |

- 중단 시 `import/`는 `ImportJob.status = failed` + `errorMessage`로 전이한다
  ([entities.md ImportJob](../10-contracts/entities.md)).
- **원본 PDF는 보존**한다. 추출 실패가 원본 파일 삭제로 이어지지 않는다.
- 우리 코드에서 `unwrap()`/`panic!()` 금지 — 모든 실패는 `AppError`로 `?` 전파한다([architecture.md §4](architecture.md)).
  `pdf-inspector` 호출은 `std::panic::catch_unwind`로 감싼다. 이 라이브러리는 실패를 `PdfError`로
  돌려주지만 밑단 파서(`lopdf`)까지 panic이 없다는 보장은 없고, 사용자 파일을 서드파티에 물리는
  자리이기 때문이다(앱 크래시 방지 — Cargo 기본 unwind 전략 전제).

> 암호화 판별은 `PdfError::Encrypted` **타입 매칭**으로 한다. 옛 `pdf-extract` 시절에는 에러 문자열에서
> `"encrypt"`를 찾아 갈랐는데, 라이브러리가 문구를 바꾸면 조용히 깨지는 방식이었다.
> 별도 kind(`pdf_encrypted`) 신설은 `error-handling.md` 레지스트리 변경(별도 PR)이 선행돼야 하므로,
> 우선 메시지만 분리하고 kind 신설은 해당 PR에 코멘트로 남긴다.

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
- **PIE-74 (2026-08-27)**: 1차 엔진을 `pdf-extract` 0.10.0 → `pdf-inspector` 1.17.0으로 교체
  ([ADR-0011](../adr/0011-pdf-text-extraction-pdf-inspector.md), ADR-0010 대체). §1 선정 근거를
  교체하고 §1.1 bcmap 배선을 신설. 미지원 인코딩이 `panic!` 중단에서 **빈 문자열 반환**으로 바뀌어
  §3.1 표를 정정했다. 프론트 pdf.js 2차 폴백과 `PdfExtractResult` 반환 형태는 무변경.
