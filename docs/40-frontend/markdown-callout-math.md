# 마크다운 렌더 확장 — 수식(KaTeX) · 쉬운 설명 콜아웃

> **위치 주의.** 이 문서는 `docs/10-contracts/`(4-오너 승인)가 **아니다**. 순수 렌더링 레이어 컨벤션이며
> 문법의 SSOT 는 코드다: [`src/lib/math.ts`](../../src/lib/math.ts) · [`src/lib/callout.ts`](../../src/lib/callout.ts).
> LLM 출력 스키마가 이 문법을 정식 채택할 때에만 contracts 로 승격한다. 함부로 복사하지 말 것.

노트 에디터(CM6 라이브 프리뷰)와 읽기 모드(react-markdown) **양쪽**에서 동일 문법을 렌더한다.
PDF 한국어 요약([`../30-llm/prompt-templates.md`](../30-llm/prompt-templates.md) §11)이 이 문법으로 출력한다.

## 1. 수식 — KaTeX

- 인라인: `$...$` · 블록: `$$...$$` (여러 줄 가능).
- 통화 기호 오탐 방지(Pandoc식): 여는 `$` 뒤 공백 금지, 닫는 `$` 앞 공백·뒤 숫자 금지, 인라인은 줄바꿈 불가.
  → `가격은 $5 그리고 $10` 는 수식이 아니다.
- 코드 컨텍스트(인라인 코드 `` `...` ``·펜스 코드) 안의 `$` 는 렌더하지 않는다.
- 스트리밍 중 미완 `$$` 는 매치되지 않아 원문 그대로 보이다가 닫는 구분자가 오면 렌더된다.

**에디터(CM6)**: 평소엔 KaTeX 렌더. 커서/선택이 수식 구간에 닿으면(양끝 인접 포함) 원문 `$...$` 노출.
렌더된 수식 클릭 → 커서가 그 자리에 놓여 원문이 드러난다. 구현: [`src/lib/cmMath.ts`](../../src/lib/cmMath.ts)
(`StateField` + `MathWidget`; 블록 수식은 세로 레이아웃을 바꾸므로 ViewPlugin 이 아닌 StateField).

**읽기 모드**: `remark-math` + `rehype-katex`. `katex/dist/katex.min.css` 를 소비 모듈에서 import.
KaTeX 는 `currentColor` 를 쓰므로 라이트/다크 자동 대응.

## 2. 쉬운 설명 콜아웃

콜아웃 문법:

```md
> [!easy] 쉬운 설명
> 일상적인 비유로 풀어낸 설명입니다.
> 여러 줄이면 모두 `> ` 로 시작합니다.
```

- 첫 줄 `> [!타입] 제목?` — 제목 생략 시 타입 기본 라벨(`easy`→"쉬운 설명", `note`→"노트").
- 이어지는 `> ` 줄들이 본문. 비-`>` 줄에서 블록이 끝난다.
- 지원 타입: `easy`(접기), `note`(비접기). 그 외 `[!...]` 는 일반 인용문으로 남는다.

**에디터(CM6)**: 색 배경 + 좌측 액센트 바로 콜아웃처럼 보이고, 제목 줄 셰브론(›)으로 접기/펼치기
(CM6 내장 `codeFolding`). 커서가 블록 밖이면 `> `·`[!easy]` 마크를 감추고, 안이면 원문 노출.
`[!easy]` 블록은 스트림 완료·마운트 시 기본 접힘. 구현: [`src/lib/cmCallout.ts`](../../src/lib/cmCallout.ts).

**읽기 모드**: `remarkCallout`(mdast `hName` 힌트, rehype-raw 불필요)가 `[!easy]`→`<details><summary>`(기본 접힘),
`[!note]`→`<div>` 로 변환. 구현: [`src/lib/callout.ts`](../../src/lib/callout.ts) + [`src/lib/markdown.tsx`](../../src/lib/markdown.tsx).

## 3. 알려진 한계

- 콜아웃 `> ` 본문 안의 **블록** `$$...$$` 는 인용 마크와 얽혀 양쪽 모두 깔끔히 렌더되지 않는다 →
  프롬프트 규칙 4로 "블록 수식은 콜아웃 밖" 강제. 콜아웃 안 **인라인** `$...$` 는 정상.
