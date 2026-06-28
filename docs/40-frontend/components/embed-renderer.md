# Embed Renderer

PiecePool WikiPage 본문의 `![[...]]` 인라인 임베드 렌더링 컴포넌트. 링크(`[[...]]`)는 `components/wikilink.md` 참조.

> 문법/동작 규약의 단일 출처는 [`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md)다. 본 문서는 React 구현 설계만 다룬다.

상태: 🔜 MVP 예정

---

## 1. 범위

- `![[이미지.png]]` — 이미지 인라인 preview
- `![[파일.pdf#page=N]]` — PDF 특정 page 인라인 preview
- 파일 없음(깨진 embed) 처리

렌더링 파이프라인(`react-markdown` + 커스텀 remark plugin으로 `[[...]]`/`![[...]]`를 mdast 노드로 변환)은 `components/wikilink.md` §2와 공유하며 본 문서에서 재정의하지 않는다.

---

## 2. PDF 렌더러 선정

| 후보 | ⭐ | 비고 |
|---|---|---|
| `mozilla/pdf.js` | 53.5k | 코어 엔진. React 래퍼 없이 쓰면 캔버스 직접 관리 필요 |
| `wojtekmaj/react-pdf` | 11.1k | pdf.js를 감싼 React 컴포넌트. 툴바 없이 페이지 단위 렌더링만 — **채택** |
| `diegomura/react-pdf` (`@react-pdf/renderer`) | 16.6k | ⚠️ 이름이 비슷하지만 **React → PDF 생성** 도구. PDF 뷰잉 용도가 아니라 후보에서 제외 |
| `react-pdf-viewer` | 2.6k | 줌/검색/인쇄 버튼 포함된 풀 뷰어 UI — 본문 인라인 용도엔 과함 |
| `embedpdf` | 4.2k | 더 최신이나 검증 기간이 짧음 |

**결정**: `wojtekmaj/react-pdf` 채택. "PDF를 보여주는" 카테고리 안에서 가장 많이 쓰이고(11.1k★), `<Document>`/`<Page>`로 페이지 단위 렌더링과 `onLoadSuccess`의 `numPages`를 그대로 제공해 §4의 page 범위 검증에 바로 쓸 수 있다. 순수 JS/TS npm 패키지라 신규 런타임 비용이 없다 (`ocr-client.md` §2에서 검토한 Python 사이드카 비용 구조와 달리, 기존 npm 의존성 추가와 동일선상).

---

## 3. `FilePreview` 컴포넌트 — 공유 렌더링 단위

```
WikiEmbed (본문 인라인, 본 문서)         ─┐
                                          ├─→ FilePreview(target, page?)
wikilink 모달 (링크 클릭 시)              ─┘
```

| Prop | 타입 | 설명 |
|---|---|---|
| `target` | 문자열 | 파일명 |
| `page` | 숫자 (선택) | PDF page (1-indexed). 없으면 이미지 또는 PDF 1페이지 |

파일 확장자로 분기한다:
- 이미지(PNG/JPG/JPEG/WebP/SVG) → `read_file_bytes`로 받은 base64를 `<img src="data:...">`로 표시
- PDF → 같은 base64를 `react-pdf`의 `<Document file={...}><Page pageNumber={page ?? 1} /></Document>`로 렌더링

`WikiEmbed`는 `FilePreview`를 본문 흐름 안에 그대로 배치하는 얇은 래퍼다. `components/wikilink.md`의 모달도 동일한 `FilePreview`를 재사용해 렌더링 로직 중복이 없다.

---

## 4. PDF page 범위 초과 처리

`react-pdf`의 `onLoadSuccess={({ numPages }) => ...}`로 총 page 수를 얻은 뒤:

- `page > numPages` → 1페이지를 표시하고, 본문에 "page={page}가 범위 초과 (총 {numPages} page)" 오류 메시지 ([`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md) §3.2 그대로 따름)

---

## 5. 깨진 embed 처리

embed는 항상 즉시 렌더링이 필요해서(본문에 보여야 하니까), `components/wikilink.md`의 store 사전 체크와 달리 **`read_file_bytes` 호출 자체가 안전망**이다 — 존재 여부를 따로 먼저 확인하지 않고 바로 시도한다.

| 상황 | 처리 |
|---|---|
| `read_file_bytes` 실패 (파일 없음) | 깨진 embed 상태 표시 + tooltip, 전체 WikiPage 렌더링은 정상 진행 ([`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md) §7.3) |
| 지원하지 않는 포맷 | 동일하게 깨진 상태로 표시, 메시지만 "지원하지 않는 형식" |

정확한 색상·아이콘은 `design-tokens.md`(Design #4, 핸드오프 대기 중) 확정 후 반영한다 (`components/wikilink.md` §5와 동일 원칙).

---

## 6. 성능

`wikilink-embed.md` §5 원칙(embed는 핵심 근거에만 사용)상 한 WikiPage에 embed가 많아질 일이 적어 lazy-loading·가상화는 도입하지 않는다. 전부 즉시(eager) 렌더링한다.

---

## 7. 의존 문서

- [`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md) — 문법/동작 SSOT
- [`../../10-contracts/entities.md`](../../10-contracts/entities.md) — `Source`
- [`../../20-backend/ipc-api.md`](../../20-backend/ipc-api.md) §10 — `read_file_bytes`
- `components/wikilink.md` — 렌더링 파이프라인 공유, 모달에서 `FilePreview` 재사용
- [`../README.md`](../README.md) — 40-frontend 영역 개요
