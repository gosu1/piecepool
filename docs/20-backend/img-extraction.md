# 이미지 텍스트 추출

프론트에서 열어준 이미지 파일(`SourceType = "image"`)을 텍스트로 변환하는 과정의 **백엔드 관점** 설계.
PDF 추출([pdf-extraction.md](pdf-extraction.md))과 짝을 이루는 문서지만, **결론부터 다르다.**

> **핵심 결정**: 이미지 → 텍스트 변환에는 **백엔드 추출 모듈이 없다.**
> PDF가 순수 Rust `pdf/` 모듈에서 텍스트를 뽑는 것과 달리, 이미지는 **vision-capable LLM 호출**로
> 변환되며 그 오케스트레이션은 TS `src/llm/` 계층이 소유한다. 변환 파이프라인의 SSOT는
> [`../40-frontend/ocr-client.md`](../40-frontend/ocr-client.md)다. **본 문서는 그 결정이 백엔드에
> 무엇을 요구하는지(파일 I/O · 영속화 · IPC 표면 · 상태 전이)만 정의한다.**

> **계층 경계**: 백엔드는 이미지 **원본 bytes 제공**과 **변환 결과 저장**만 담당한다.
> 픽셀 → 텍스트 변환 자체(OCR/vision)는 백엔드 책임이 아니다.

---

## 1. 왜 백엔드 OCR 모듈을 두지 않는가

PDF와 이미지는 입력 형태가 비슷해 보이지만, 변환 메커니즘이 근본적으로 다르다.

| | PDF (`pdf-extraction.md`) | 이미지 (본 문서) |
|---|---|---|
| 변환 주체 | 순수 Rust `pdf/` 모듈 | **vision LLM (TS `src/llm/`)** |
| 변환 성격 | 결정적(deterministic) 텍스트 추출 | 모델 추론(이미지 이해) |
| 백엔드 모듈 | `pdf/` 존재 | **없음** (`img/`·`ocr/` 신설 안 함) |
| 백엔드 역할 | 추출 + 메타데이터 산출 | 원본 저장 + 결과 persist |

별도 OCR 라이브러리(Tesseract.js / PaddleOCR / Apple Vision 등)를 두지 않기로 한 근거는
[`ocr-client.md §2`](../40-frontend/ocr-client.md)가 SSOT다. 요지만 옮기면:

- 스크린샷·필기는 순수 텍스트가 아니라 차트·표·그림이 섞여 있어 **문자 인식만으로는 의미를 살릴 수 없다.**
- Python 기반 OCR은 사이드카 프로세스·패키징 용량·툴체인 이원화 비용을 새로 만든다
  (`.dmg`/`.pkg` 서명 대상 증가).
- 한글 인식 품질에서 vision LLM 대비 우위를 보장하기 어렵다.

→ 결과적으로 `import/`가 호출할 Rust 추출 함수가 **이미지에는 존재하지 않는다.** 이미지 전용 백엔드
분기는 1차 vision 호출 한 단계뿐이며, 그것마저 Rust IPC가 아니라 TS adapter의 LLM 호출이다.

---

## 2. 이미지 → 텍스트 파이프라인 (백엔드 관점)

전체 파이프라인은 [`ocr-client.md §5`](../40-frontend/ocr-client.md)가 SSOT다. 아래는 **각 단계에서
백엔드가 실제로 수행하는 일**만 추려낸 것이다. (`[BE]` = 백엔드 책임, `[TS]` = TS LLM 계층 책임)

```
이미지 인라인 첨부 (note 편집 화면, 사용자 설명 동시 입력 가능)
   │
   ▼
[1] 원본 보존        [BE] save_source_file → sources/original-files/ 에 원본 이미지 기록 (수정 금지)
   │                      storage/ 의 write_atomic + safe_join 경로 검증
   ▼
[2] vision 입력 준비  [TS] 프론트 FileReader.readAsDataURL → dataUrl 생성 → vision 입력
   │                      ※ 백엔드 read_file_bytes 를 거치지 않는다
   │
   ▼
[3] 1차 vision 호출   [TS] 이미지 + 사용자 설명 → [텍스트]+[사용자 설명]+[그림 설명] 블록 (§4)
   │                      ※ 백엔드는 관여하지 않음 — Rust IPC 아님
   ▼
[4] archive 저장     [BE] create_note → archive/*.md 기록 (OCR 텍스트 + ![[원본이미지]] embed 를 노트 본문으로)
   │                      이 블록 전체가 "원문". 기존 ArchiveNote 덮어쓰기 금지(§5)
   ▼
[5] 2차 텍스트 LLM    [TS] text/pdf와 동일 경로 — Concept/WikiPage/Relation 추출 + 그림 설명 정제
   │
   ▼
[6] wiki/relations    [BE] save_wiki · append_relations 로 persist
                          원본 이미지 ![[...]] embed + 정제된 그림 설명 포함
```

- 백엔드 관여 단계는 [1][4][6]뿐이며 모두 **파일 I/O + 영속화**다. "텍스트화"의 실체인 [2][3][5]는
  백엔드 밖에 있다.
- `image`도 결국 archive에 저장된 텍스트를 입력으로 `text`/`pdf`와 같은 2차 진입점에 합류한다
  ([`ocr-client.md §5`](../40-frontend/ocr-client.md)).
- Import 흐름/상태(`ImportJob`)는 TS 서비스층이 오케스트레이션하고, Rust `import/`는 상태 전이
  추적과 결과 영속화만 한다([architecture.md §2 LLM 제어권 분리](architecture.md)).
- 저장 시점 분리: 원본 이미지는 첨부 즉시 `save_source_file`로 디스크에 저장되고, OCR 텍스트는
  사용자가 저장을 누를 때 `create_note`로 archive에 기록된다(그 전까지는 편집기 본문에만 존재).

---

## 3. IPC 표면: `ocr_image` 폐기, `read_file_bytes`로 충분

[`ipc-api.md §4`](ipc-api.md)에 `ocr_image(path) → string` (⏳ post-MVP)가 남아 있으나, 본 설계와
**충돌한다.** OCR이 Rust IPC가 아니라 TS adapter의 vision 호출이 되므로 이 커맨드는 필요 없다.
([`ocr-client.md §6`](../40-frontend/ocr-client.md)가 Backend 확인을 요청한 항목에 대한 백엔드 측 결론.)

| 커맨드 | 결정 | 사유 |
|---|---|---|
| `ocr_image(path) → string` | **폐기(remove)** | 변환이 TS vision 호출로 이동. 실 IPC(`src/lib/ipc.ts`)에는 **처음부터 없음** — `ipc-api.md §4` 문서 표기만 잔존 |
| `read_file_bytes(path) → base64` | **재사용** | 저장된 원본 이미지 `![[...]]` embed·미리보기 렌더용 bytes 제공. vision 입력 dataUrl 은 프론트 `FileReader` 담당이라 이 커맨드를 **거치지 않는다** ([`ipc-api.md §10`](ipc-api.md)) |
| `save_source_file(space, name, dataBase64) → filename` | 재사용 | 원본 이미지 bytes → `sources/original-files/` 저장 (`InboxSection.tsx`) |
| `create_note(space, title, markdown, subjectIds) → Note` | 재사용 | archive `.md` 기록. OCR 텍스트 + `![[embed]]` 를 노트 본문으로 전달. PDF/text와 동일 진입점 |

- 신규 Rust 커맨드는 **추가하지 않는다.** 이미지 입력을 위한 백엔드 IPC는 이미 있는 것으로 충분하다.
- ⚠️ **정렬 필요**: 위 결정을 반영하려면 [`ipc-api.md §4`](ipc-api.md)의 `ocr_image` 행을 삭제하고
  §11의 "post-MVP" 언급도 갱신해야 한다. 본 문서는 `ipc-api.md`를 직접 수정하지 않으므로 해당 정렬은
  별도 PR로 처리한다(ipc-api는 Backend 소유 문서이므로 contracts 4인 승인 대상 아님).

---

## 4. 출력 구조 보존: 백엔드는 3-블록 원문을 그대로 저장한다

1차 vision 결과 + 사용자 입력은 세 블록으로 구분된다(정의·근거는
[`ocr-client.md §4`](../40-frontend/ocr-client.md) SSOT):

```
[텍스트 그대로]      이미지에 실제로 적힌 글자 (사용자 출처)
[사용자 설명]         첨부 시 사용자가 직접 입력한 설명 (사용자 출처, 입력했을 때만)
[그림 설명 — AI 해석] 차트·표·그림 등 비텍스트 요소의 자연어 설명 (AI 해석, 원문 아님)
```

백엔드 관점의 불변식:

- 이 3-블록 전체가 archive `.md`의 **"원문"**이다. `archive/`는 LLM이 덮어쓸 수 없는 영역이므로
  ([workspace-layout `archive/` 규약](../10-contracts/workspace-layout.md)), 2차 LLM이 정제한
  그림 설명은 **wiki에만** 반영하고 archive 원문은 그대로 보존한다.
- 블록 마커(신뢰도 구분)는 TS 계층이 생성하고 백엔드는 **내용을 해석·재작성하지 않고** 바이트
  그대로 저장한다. "실제로 적힌 것 / 사용자가 쓴 것 / AI가 해석한 것"의 구분은 후속 fact-check·
  evidence 추적의 근거이므로 백엔드가 임의로 병합·삭제하면 안 된다.
- 저장 시 frontmatter는 [`markdown-frontmatter §4`](../10-contracts/markdown-frontmatter.md) 검증을
  통과해야 한다. `sourceType = "image"`이므로 **`originalFilePath`(원본 이미지 경로)가 필수**다
  (`entities.md` `Source.originalFilePath`).

---

## 5. 원본 보존 · 경로 규약

- 원본 이미지는 `<space>/sources/original-files/` 아래에 보존한다(`entities.md` `Source` —
  `pdf`/`image`는 `originalFilePath` 필수). 가능하면 원본 파일명을 유지한다
  ([workspace-layout §3.7](../10-contracts/workspace-layout.md)).
- 본문의 `![[image]]` inline embed는 이 `sources/original-files/`를 루트로 해석한다
  (CLAUDE.md §Wikilink & Embed, [wikilink-embed.md](../10-contracts/wikilink-embed.md)).
- 모든 쓰기는 `storage/`의 `write_atomic`(tmp→rename) + `safe_join`(path traversal 방지)을 거친다
  ([storage-io.md §1~2](storage-io.md)). 원본 이미지는 추가 후 **수정하지 않는다.**

---

## 6. 실패 처리

이미지 변환에는 **백엔드 전용 추출 오류 kind가 없다.** PDF의 `pdf_extract`에 대응하는 항목을
신설하지 않는다 — 변환을 백엔드가 하지 않기 때문이다. 오류는 발생 위치에 따라 갈린다.

| 발생 위치 | kind | 처리 |
|---|---|---|
| 원본 저장 / bytes read 실패 (`storage/`) | `io_write` / `io_read` / `not_found` / `path_*` | 중단 — [error-handling §3.1](error-handling.md) |
| 기존 ArchiveNote 덮어쓰기 시도 | `archive_conflict` | 중단 — 원문 보호 ([error-handling §5.2](error-handling.md)) |
| vision 호출 실패 (TS adapter origin) | `network` / `auth` / `rate_limit` / `schema` / `empty` | LLM origin — [error-handling §3.4](error-handling.md), 메시지는 [`output-validation §7`](../30-llm/output-validation.md) |
| `![[image]]` 대상 파일 없음 | `embed_unresolved` | **경고** — 깨진 링크 표시, 저장 허용 ([error-handling §5.5](error-handling.md)) |

- **전 페이지가 텍스트 없는 스캔 PDF**처럼 "이미지에서 글자를 못 읽은" 경우라도, 그림 설명 블록이
  남으므로 변환은 보통 빈 결과가 아니다. vision이 아무것도 못 만들면 `empty`(추출 0개)로 처리되며
  이는 LLM origin이다.
- `unwrap()`/`panic!()` 금지 — 백엔드 측 실패는 모두 `AppError`로 `?` 전파한다
  ([architecture.md §4](architecture.md)).
- 변환 실패가 **원본 이미지 삭제로 이어지지 않는다.** 원본은 항상 보존한다.

---

## 7. Provider (참고)

텍스트 단계와 동일한 provider를 vision에도 그대로 쓴다 — **새 환경변수 분기 없음**
([`ocr-client.md §3`](../40-frontend/ocr-client.md)). 현재 구현은 **Gemini 단일** provider다
(Free/Premium·로컬 모델 분기는 코드에 없다 — CLAUDE.md provider 규약과 일치).

| 단계 | Provider |
|---|---|
| 1차 — 이미지 vision | Gemini Chat Completions (`gemini-2.5-flash`, `image_url`) — `src/llm/ocr.ts` |
| 2차 — 텍스트 요약/Concept 추출 | Gemini |

- API key 미설정 시 네트워크 호출 없이 오프라인 폴백 마크다운을 반환한다(`ocr.ts`).
- provider 호출·게이팅은 TS `src/llm/`이 소유한다. 백엔드는 provider 분기에 관여하지 않는다.

---

## 8. 책임 분리 요약

| 책임 | 위치 |
|---|---|
| 원본 이미지 보존 (`save_source_file` → `sources/original-files/`) | **`storage/` (BE)** |
| 이미지 → 텍스트 변환 (vision) | TS `src/llm/ocr.ts` ([ocr-client.md](../40-frontend/ocr-client.md)) |
| vision 입력 dataUrl 생성 (`FileReader`) | TS 프론트 (`InboxSection.tsx`) |
| 3-블록 원문 archive `.md` 저장 (`create_note`) | **`storage/` (BE)** — 내용 재작성 금지 |
| 원본 이미지 embed/미리보기 bytes 제공 (`read_file_bytes`) | **`storage/` (BE)** |
| wiki/relations persist (`save_wiki`·`append_relations`) | **`storage/` (BE)** |
| `ImportJob` 상태 전이 추적 | `import/` (BE) — LLM 호출은 TS 위임 |
| 변환 품질·핵심 주제 판별 | TS `src/llm/` |

---

## 9. 관련 문서

| 문서 | 내용 |
|---|---|
| [`../40-frontend/ocr-client.md`](../40-frontend/ocr-client.md) | **이미지 → 텍스트 변환 파이프라인 SSOT** (vision LLM, 3-블록, provider) |
| [`pdf-extraction.md`](pdf-extraction.md) | 짝 문서 — PDF는 순수 Rust 추출 (대조군) |
| [`../10-contracts/entities.md`](../10-contracts/entities.md) | `SourceType="image"` · `Source.originalFilePath` |
| [`../10-contracts/workspace-layout.md`](../10-contracts/workspace-layout.md) | `sources/original-files/` 경로·파일명 규약 |
| [`../10-contracts/wikilink-embed.md`](../10-contracts/wikilink-embed.md) | `![[image]]` embed 해석 루트 |
| [`../10-contracts/markdown-frontmatter.md`](../10-contracts/markdown-frontmatter.md) | image 저장 시 frontmatter 검증(`originalFilePath` 필수) |
| [`storage-io.md`](storage-io.md) | `write_atomic` · `safe_join` · 원본 보존 |
| [`ipc-api.md`](ipc-api.md) | `ocr_image` 폐기 / `save_source_file`·`create_note`·`read_file_bytes` 재사용 |
| [`error-handling.md`](error-handling.md) | `io_*` · `archive_conflict` · LLM origin kind 레지스트리 |
| [`architecture.md`](architecture.md) | 모듈 경계 · LLM 제어권 분리 · `AppError` 전파 |

---

## 10. 변경 이력 노트

- 신규 작성. `pdf-extraction.md`의 짝 문서이나 **결론이 반대**임을 명시: 이미지에는 백엔드 추출
  모듈(`img/`·`ocr/`)을 두지 않으며, 변환은 TS vision LLM이 담당한다. 변환 파이프라인 SSOT는
  `ocr-client.md`이고 본 문서는 백엔드 요구사항(파일 I/O·영속화·IPC·상태)만 정의한다.
- **`ocr_image` IPC 폐기 결론**: [`ocr-client.md §6`](../40-frontend/ocr-client.md)가 요청한 Backend
  확인에 대한 답. 원본 저장 `save_source_file` + archive 기록 `create_note` + embed 렌더
  `read_file_bytes`로 충분하므로 `ocr_image`는 두지 않는다(실 IPC엔 애초에 없고 `ipc-api.md §4`
  문서 표기만 잔존 — §4/§11 정렬은 별도 PR로 처리, Backend 소유 문서).
- **신규 오류 kind 없음**: 백엔드가 변환하지 않으므로 `pdf_extract`에 대응하는 image 추출 kind를
  신설하지 않는다. vision 실패는 LLM origin(`network`/`schema`/`empty` 등)으로 흡수한다.
- archive 3-블록 원문 보존, `originalFilePath` 필수, embed 루트 규약은 각 contracts SSOT를 백엔드
  관점으로 반영한 것이다.
