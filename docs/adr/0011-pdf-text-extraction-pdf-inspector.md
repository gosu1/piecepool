# ADR-0011: PDF 텍스트 추출 1차 엔진 = `pdf-inspector` (ADR-0010 대체)

- 상태: 채택 (Accepted)
- 일자: 2026-08-27
- 대체: [ADR-0010](0010-pdf-text-extraction-pdfjs-fallback.md) (1차 = `pdf-extract` 0.10.0 + pdf.js 폴백)
- 관련: [pdf-extraction](../20-backend/pdf-extraction.md) · [ADR-0003](0003-ocr-vision-llm.md) · [wikilink-embed](../10-contracts/wikilink-embed.md) · PIE-74

## 배경

[ADR-0010](0010-pdf-text-extraction-pdfjs-fallback.md)은 1차를 Rust `pdf-extract` 0.10.0, 2차를 프론트 pdf.js로 확정했다. 그 구조는 실패율 0을 달성했지만 1차 엔진에 세 가지 부채가 남았다.

1. **panic 의존** — `Identity-H/V` 외 predefined CMap을 `Err`가 아니라 `panic!`으로 거부한다. 앱이 죽지 않는 유일한 이유가 `catch_unwind`다.
2. **표 구조 소실** — 표를 평문으로 평탄화해 열 정보가 사라진다. 이 텍스트가 그대로 LLM 입력이 되므로 위키·관계 품질에 직결된다.
3. **스캔본 판정 불가** — "전 페이지 빈 텍스트"라는 간접 신호로만 스캔본을 짐작한다.

`pdf-inspector`(Firecrawl, MIT)는 위 셋을 정면으로 다룬다. `PdfError`로 실패를 돌려주고, 표를 Markdown 표로 복원하고, 페이지별로 OCR이 필요한지 알려준다.

### 실측

동일 머신, `pdf-inspector` 1.17.0, release 빌드, 3회 중 최소값.

한글 2단 학회 조판 논문(`adversarial-vit-korean.pdf`, 2쪽)에서 pdf.js와 나란히 비교했다. pdf.js 쪽은 `src/lib/pdfText.ts`의 `extractWithPdfJs`·`joinItems`를 그대로 옮겨 돌렸다.

| 항목 | pdf.js (2차) | `pdf-inspector` 문서 단위 | `pdf-inspector` 쪽 단위 |
|---|---|---|---|
| 한글 자수 | 2,474 | 2,474 | 0 |
| 깨진 문자(U+FFFD) | 0 | 46 | — |
| 연속 40자 조각 보존율 | 기준 | 57.6% | — |
| 연속 30자 조각 | 기준 | 59.9% | — |
| 연속 20자 조각 | 기준 | 69.9% | — |

**한글 자수는 같은데 읽는 순서가 무너진다.** 좌우 단을 줄 단위로 번갈아 이어붙이기 때문이다. 조각 길이를 늘릴수록 보존율이 떨어지는 모양(69.9 → 59.9 → 57.6)이 그 지문이다. 깨진 문자 46개는 러닝헤드 한 줄이며, PIE-74 이슈에 기록된 실측치와 독립적으로 일치했다.

쪽 단위 API(`extract_pages_markdown`)는 이 러닝헤드 때문에 두 쪽 모두 `needs_ocr = true`(사유 `suspected_garbled_text`)로 판정해 빈 문자열을 돌려준다. bcmap 위치를 명시적으로 지정하고 재실행해 **대응표 문제가 아님을 확인**했다.

## 결정

1차 엔진을 `pdf-extract` 0.10.0에서 **`pdf-inspector` 1.17.0**으로 교체한다. 나머지 구조는 ADR-0010 그대로다.

- **2차 pdf.js 폴백을 유지한다.** 위 실측이 근거다. 한글 2단 조판 PDF는 pdf.js가 맡는 것이 옳다.
- **쪽 단위 API(`extract_pages_markdown`)를 쓴다.** 문서 단위 API가 이 파일에서 텍스트를 더 뽑아내지만 읽기 순서가 무너져 LLM 입력으로 쓸 수 없고, 쪽 경계를 주석 문자열로 잘라야 해 `SourceRef.page`를 문자열 파싱 위에 올리게 된다.
- **폴백 트리거는 기존 그대로 "텍스트 없음"이다.** 라이브러리가 글자가 깨졌다고 판단한 쪽은 빈 문자열로 오므로, 프론트 `hasText()`가 그대로 받아 폴백한다. 이슈가 제안한 `has_encoding_issues`는 문서 단위 플래그라 쪽 단위 API에 실리지 않으며, 새 필드를 IPC 계약에 추가할 필요가 없다.
- **bcmap 168종을 앱 번들에 담고 시작 시 `PDF_INSPECTOR_BCMAPS_DIR`를 건다.** 라이브러리는 네이티브 빌드에서 이 표를 파일시스템에서 읽는다(내장은 wasm 타깃만). 환경변수가 없으면 **빌드한 기계의 카고 캐시 경로**를 보므로, 개발 빌드는 우연히 동작하고 배포 앱에서만 조용히 무력화된다.
- `catch_unwind`는 남긴다. 새 라이브러리는 `Result`를 돌려주지만 밑단 파서(`lopdf`)까지 panic이 없다는 보장은 없다.

## 결과

- (+) 한글 CMap PDF에서 앱이 죽는 경로가 사라졌다. panic 대신 빈 텍스트로 폴백에 넘어간다.
- (+) 표가 Markdown 표로 복원돼 LLM 입력 품질이 올라간다.
- (+) 스캔본을 `pages_needing_ocr`로 쪽 단위 판정할 수 있다. 지금은 쓰지 않지만 OCR 경로([ADR-0003](0003-ocr-vision-llm.md)) 설계의 재료가 된다.
- (+) 암호화 PDF 판별이 에러 문자열 검색에서 `PdfError::Encrypted` 타입 매칭으로 바뀌었다. 라이브러리가 문구를 바꿔도 안 깨진다.
- (−) 앱 번들이 bcmap 1.5MB만큼 커진다.
- (−) Adobe CMap 자료(BSD-3) 고지 의무가 생긴다 → [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md).
- (−) bcmap 배선은 **배포 빌드에서만 검증된다.** 개발 빌드 통과는 증거가 아니다. `pdf::set_bcmaps_dir`가 표 존재를 확인해 실패를 로그로 남기는 이유가 이것이다.
- (−) 라이브러리의 쪽 단위 결과는 **0-indexed**다. 우리 계약은 1-indexed([wikilink-embed §3.1](../10-contracts/wikilink-embed.md))이므로 변환 지점이 새 회귀 지점이 된다. 이를 고정하는 테스트를 뒀다.

## 대안

- **문서 단위 API + 쪽 구분 주석으로 자르기**: 같은 파일에서 한글 2,474자를 얻지만 읽기 순서가 무너지고(위 표), 쪽 번호가 문자열 파싱에 의존하게 된다. 쪽 번호가 한 칸 밀리면 노트의 출처가 전부 틀린 쪽을 가리킨다 → 기각.
- **`pdf-extract` 유지**: 폴백 체인이 이미 실패율 0이라 교체 없이도 동작한다. 다만 표 구조 소실과 panic 의존이 그대로 남고, 이 둘이 교체의 실익이다 → 기각.
- **`pdfium-render`**: ADR-0010에서 이미 검토·기각(네이티브 바이너리 번들 부담). 판단 변경 없음.

## 남은 것

- 속도 실측은 이번 범위에서 재현하지 못했다. PIE-74 이슈의 수치(영문 15쪽 논문 362ms → 48ms)는 **1.14.2 기준**이며, 근거가 된 코퍼스 7종이 저장소에 없다. 코퍼스를 확보하면 1.17.0으로 다시 잰다.
- `src/lib/pdfText.ts`가 pdf.js에 `cMapUrl`·`cMapPacked`를 넘기지 않는다. 대응표를 이름으로만 참조하는 PDF를 만나면 2차 폴백도 실패할 수 있다. 이번 실측 파일은 본문 폰트에 `ToUnicode`가 내장돼 있어 드러나지 않았다. 별도 이슈로 다룬다.
