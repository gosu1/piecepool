# Wikilink

PiecePool WikiPage 본문의 `[[...]]` 링크 렌더링 컴포넌트. 비텍스트 embed(`![[...]]`)는 `embed-renderer.md`(다음 작업) 참조.

> 문법/동작 규약의 단일 출처는 [`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md)다. 본 문서는 React 구현 설계만 다룬다.

상태: 🔜 MVP 예정

---

## 1. 범위

- `[[파일명]]`, `[[파일명#page=N]]` — 링크 렌더링 + 클릭 동작
- 깨진 링크(파일 없음) 시각화
- `![[...]]` embed 자체의 렌더링은 `embed-renderer.md` 소관. 본 문서는 클릭 시 그 컴포넌트를 재사용만 한다 (§3)

`screens/markdown-editor.md` ([#21](https://github.com/gosu1/piecepool/issues/21), 디자인 핸드오프 대기 중)와 독립적으로 설계한다 — 렌더링은 마크다운 문자열을 입력으로 받는 읽기 전용 컴포넌트라 에디터 라이브러리 선택과 무관하다.

---

## 2. 렌더링 파이프라인

| 레이어 | 선택 | 근거 |
|---|---|---|
| 마크다운 렌더러 | `react-markdown` | remark/rehype 생태계 표준, GitHub 15.7k★, 활발히 유지보수. 커스텀 노드 타입 확장 용이 |
| `[[...]]`/`![[...]]` 파싱 | 자체 작성 remark plugin | 기존 `remark-wiki-link` 패키지는 110★/v0.0.1로 미성숙 — 직접 의존하기엔 리스크가 큼. 정규식 기반 소규모 플러그인을 자체 작성 |

plugin은 `[[파일명]]` / `[[파일명#page=N]]` / `![[파일명]]` / `![[파일명#page=N]]`을 각각 커스텀 mdast 노드(`wikiLink`, `wikiEmbed`)로 변환한다. `react-markdown`의 `components` prop으로 두 노드 타입을 각각 `<WikiLink>`(본 문서) / `<WikiEmbed>`(`embed-renderer.md`)에 매핑한다.

---

## 3. `WikiLink` 컴포넌트

| Prop | 타입 | 설명 |
|---|---|---|
| `target` | 문자열 | 파일명, 예: `transformer-week3.pdf` |
| `page` | 숫자 (선택) | `#page=N` (1-indexed) |
| `label` | 문자열 | 링크 표시 텍스트 |

클릭 시: `embed-renderer.md`의 프리뷰 컴포넌트를 **모달로 재사용**한다. 새 라우트·새 윈도우 없음 — 단일 윈도우 React Router 구조([`../architecture.md`](../architecture.md) §2)를 유지한다.

PDF page 범위 초과 시 처리는 모달 내부 프리뷰 컴포넌트(`embed-renderer.md`)가 담당한다 ([`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md) §3.2 그대로 따름).

---

## 4. 깨진 링크 판별

`target`을 이미 store에 로드된 `Source[]`(`originalFilePath` 기준)와 대조한다. 신규 IPC 없음, 동기 조회.

| 방식 | 채택 |
|---|---|
| Store 대조 (이미 로드된 `Source[]`) | ✅ — 비용 0, 동기, 페이지 전체 broken 상태를 한눈에 표시 가능 |
| 클릭마다 IPC로 파일 존재 확인 | ⛔ — 신규 Rust 커맨드 필요(Backend 조율), 링크 수만큼 비동기 round-trip, 화면엔 결과 나오기 전까지 깨짐 여부 모름 |

**실제 안전망은 클릭 시점**: store 조회는 화면에 깨짐 여부를 즉시 보여주는 용도일 뿐, 실제 파일 접근은 클릭 시 모달이 호출하는 기존 `read_file_bytes` IPC가 처리한다. 거기서 실패하면(store 갱신 후 외부에서 파일이 삭제된 극단적 케이스) 에러 토스트로 처리 — `CLAUDE.md`의 `AppError` 전파 규칙을 따른다.

---

## 5. 시각적 표현

| 상태 | 표현 |
|---|---|
| 정상 링크 | 밑줄 + 강조 색상 (클릭 가능 표시) |
| 깨진 링크 | 점선 밑줄 + 무채색/경고색, hover 시 tooltip "파일을 찾을 수 없음: {target}" |
| 깨진 링크 클릭 시 | 모달 대신 인라인 에러 메시지 — 재업로드/링크 수정 유도 ([`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md) §7.3) |

위 표현은 상태 구분이 필요하다는 동작 요구사항만 명시한 것이며, 정확한 색상·두께 값은 `design-tokens.md`(Design #4, 핸드오프 대기 중) 확정 후 반영한다.

---

## 6. 의존 문서

- [`../../10-contracts/wikilink-embed.md`](../../10-contracts/wikilink-embed.md) — 문법/동작 SSOT
- [`../../10-contracts/entities.md`](../../10-contracts/entities.md) — `Source` (`originalFilePath`)
- [`../architecture.md`](../architecture.md) — 라우팅/IPC 패턴 (단일 윈도우 구조)
- `embed-renderer.md` — `![[...]]` 프리뷰 컴포넌트 (본 문서가 재사용, 다음 작업)
- [`../README.md`](../README.md) — 40-frontend 영역 개요
