# 아키텍처 결정 기록 (ADR)

확정된 기술·아키텍처 결정을 [MADR](https://adr.github.io/madr/) 형식으로 기록한다. 결정이 바뀌면 새 ADR로 기존 것을 대체(Superseded)하고, 과거 ADR은 덮어쓰지 않는다.

> 계약(엔티티·enum·schema)은 [`../10-contracts/`](../10-contracts/)가 SSOT다. ADR은 계약을 **링크로만** 참조한다.

| ADR | 결정 | 상태 |
|---|---|---|
| [0001](0001-llm-provider-openai.md) | LLM provider = OpenAI 단일 (feature 3 출처검색 = Liner API) | 채택 |
| [0002](0002-single-tier-pricing.md) | 단일 tier (freemium 폐기) | 채택 |
| [0003](0003-ocr-vision-llm.md) | OCR = vision LLM (별도 엔진 없음) | 채택 |
| [0004](0004-markdown-editor-codemirror6.md) | Markdown 편집기 = CodeMirror 6 | 채택 |
| [0005](0005-pdf-extract-crate.md) | PDF 텍스트 추출 = `pdf-extract` 0.10.0 | 채택 |
| [0006](0006-graph-rendering-cytoscape.md) | Graph 렌더링 = Cytoscape.js | 채택 |
| [0007](0007-importjob-orchestration-ts.md) | ImportJob 오케스트레이션 = TS 주도 | 채택 |

## 새 ADR 작성

1. 다음 번호로 `000N-<kebab-title>.md` 생성 (배경 / 결정 / 결과 / 대안).
2. 본 표에 1줄 추가.
3. 결정이 [`../00-overview/open-questions.md`](../00-overview/open-questions.md)의 항목을 해소하면 그 문서 §7 절차대로 항목을 §6으로 옮기고 본 ADR을 링크.
