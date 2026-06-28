# Prompt Templates

Import 호출의 system/user 프롬프트 (한국어 학습 컨텍스트).

> **소유**: Backend 주도(@ChangSik88, @O6west) — 도메인 프롬프트는 사람이 직접 고민. 본 문서는 **초안 골격** + LLM 구조화.
> SSOT 출력 스키마: [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md) — 본 문서는 타입/JSON Schema를 **재정의하지 않고 참조만** 한다.
> 검증/재시도: [`output-validation.md`](output-validation.md). 평가: [`evals.md`](evals.md).
> 외부 영감: paper-recall-kit(검색 재진입 구조) + research-wiki-skill-kit(근거 분리) — §6, §7.

---

## 1. 호출 목적

1 Source의 원문(archive 텍스트) → `LlmWikiResult` (concepts + relations). 변환·저장은 Backend import-pipeline.

- 입력 구성은 [`evals.md`](evals.md) §2.2 fixture `input`과 동일: `sourceTitle`, `sourceText`, `sourceFiles`, `subjects`, `existingConcepts`.
- 출력 필드 정의는 SSOT [`llm-output-schema.md`](../10-contracts/llm-output-schema.md) §2~§3.

---

## 2. System Prompt (기본 / Free·Premium 공용)

```text
너는 대학생의 학습 자료를 "개념 중심 위키 + 타입 있는 지식 그래프"로
재구성하는 도우미다.

[입력]
- 한 개 Source의 제목과 원문 텍스트(PDF/이미지는 추출된 텍스트).
- 과목(Subject) 목록.
- 이미 존재하는 개념(Concept) 제목 목록.

[할 일]
1. 원문에서 핵심 개념을 추출한다(concepts).
2. 개념 사이의 의미 있는 관계를 타입과 함께 제시한다(relations).

[근거 규칙 — 엄격]
- 원문에 실제로 있는 내용만 쓴다. 원문에 없는 사실을 지어내지 않는다.
- 일반 지식으로 보충한 추론과 원문에서 온 내용을 섞지 않는다.
- 각 relation의 evidence.reason에는 원문 근거(인용/위치)를 적는다.
- 근거가 약하면 confidence를 낮춘다. 모르면 빈 배열로 둔다. 억지로 채우지 않는다.

[중복 규칙]
- "이미 존재하는 개념" 목록과 같은 개념이면 새로 만들지 말고 그 제목을 그대로 쓴다.

[관계 타입 규칙]
- relationType은 정해진 12종만 쓴다.
- related_to는 마지막 수단이다. 더 구체적인 타입(part_of, used_in, confused_with 등)을 우선한다.
- review_needed는 절대 부여하지 않는다(사용자 전용).

[출력 형식]
- LlmWikiResult JSON 한 개만 출력한다.
- 설명 문장, 코드펜스, 주석을 붙이지 않는다.
- 스키마는 입력으로 주어진 JSON Schema를 엄격히 따른다(없는 필드 추가 금지).
- 본문(summary/explanation/examples)은 한국어, 식별자/개념명은 원문 표기를 따른다.
```

> `relationType` 12종과 노드 호환성: [`../10-contracts/relation-types.md`](../10-contracts/relation-types.md). 프롬프트에는 enum 목록을 런타임에 주입(문서 복붙 금지 — `ssot-check`).

---

## 3. User Prompt 템플릿

```text
[Source]
제목: {{sourceTitle}}
과목: {{subjects}}            # 예: AI, 운영체제
원문:
{{sourceText}}

[이미 존재하는 개념]          # 중복 생성 금지, 같으면 이 제목 그대로
{{existingConceptTitles}}

[원본 파일]                   # sourceRefs로 인용 가능 (file, page)
{{sourceFiles}}

위 원문에서 개념과 관계를 추출해 LlmWikiResult JSON으로 출력하라.
```

---

## 4. 출력 지침 (필드별)

[`llm-output-schema.md`](../10-contracts/llm-output-schema.md) §2 `LlmConcept` 필드를 이렇게 채우도록 system prompt 뒤에 덧붙인다.

```text
[concepts[] 작성 지침]
- title: 원문 표기 기준 개념명.
- summary: 1~2문장. 나중에 "검색"으로 다시 찾을 핵심어를 반드시 포함한다.
- explanation: 원문 범위 안에서만 상세히. 원문에 없는 배경지식 확장 금지.
- examples: 원문에 등장한 예시 우선. 없으면 비운다.
- aliases: 동의어/약어/검색에 쓸 다른 표기.
- confusingConcepts: 헷갈리기 쉬운 개념 title.
- relatedQuestions: 이 개념으로 "다시 돌아올 때" 던질 질문 2~3개.
                    (제목이 아니라 질문으로 재진입하게 만든다)
```

> `relatedQuestions`/`aliases`/`confusingConcepts`는 **이미 스키마에 존재**한다. 본 지침은 그것들을 **검색 재진입용으로 강하게 채우라**는 운영 규칙이다(=paper-recall-kit "검색 키워드·다시읽기 트리거·질문 노트" 발상 흡수).

---

## 5. 관계(relations) 작성 지침

```text
[relations[] 작성 지침]
- 같은 응답의 concept 또는 "이미 존재하는 개념"끼리만 연결한다.
- relationType은 가장 구체적인 1개. 애매하면 관계를 만들지 않는다(related_to 남발 금지).
- strength/confidence는 원문 근거 강도에 비례.
- evidence: 최소 1개. reason에 원문 인용 또는 위치를 적는다.
- cross-subject 연결(예: 자료구조 Graph ↔ AI GNN)은 used_in/contrasts 등 구체 타입으로.
```

---

## 6. Grounding 강화 (research-wiki-skill-kit 흡수)

skill-kit 핵심 두 규칙을 프롬프트에 상수로 둔다:

- `"저장된(원문) 내용과 AI 추론을 구분한다"` → §2 [근거 규칙].
- `"없는 내용을 만들어내지 않는다"` → §2 [근거 규칙] 1행.

저장 전 의미 검증(환각/추측 탐지)은 프롬프트 밖에서 한 번 더 — [`qa-review-agent.md`](qa-review-agent.md).

---

## 7. Premium 전용 추가 (schema 무변경)

- **되묻기 트리거 문구**: 1차 응답이 약할 때 사용자에게 물을 재확인 질문 생성. 트리거 조건·흐름은 [`output-validation.md`](output-validation.md) §6. 프롬프트는 별도 round-trip system 블록으로 주입.
- **fact-check**: web search 도구 호출 결과를 `evidence[].reason`에 출처 URL로 누적([`../10-contracts/entities.md#evidence`](../10-contracts/entities.md#evidence)).
- **재시도 보강**: schema 위반 재시도 시 위반 필드 주입([`output-validation.md`](output-validation.md) §4.3).

---

## 8. 제안: 검색 재진입 필드 신설 (contracts-change)

paper-recall-kit "검색 키워드 + 다시읽기 트리거"를 1급 필드로 영구 저장하면 위키 재발견이 강해진다. **현재 스키마엔 없음** → SSOT 변경 필요.

| 후보 필드 | 위치 | 의미 |
|---|---|---|
| `retrievalKeywords` | `LlmConcept` + WikiPage frontmatter | 나중에 검색할 단어들 |
| `reReadTriggers` | `LlmConcept` + WikiPage frontmatter | "언제 이 개념에 돌아올까" 신호 |

- MVP에서는 신설 없이 `aliases`(≈키워드) + `relatedQuestions`(≈재진입)로 근사.
- 신설 시 [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md) + [`../10-contracts/markdown-frontmatter.md`](../10-contracts/markdown-frontmatter.md) 수정 → `contracts-change` 라벨 + 4역할 review.

---

## 9. 스코프

- §2~§7: **MVP**. import 호출에 바로 필요.
- §8: **post-MVP** 제안(contracts-change).
- 본 문서는 초안. 도메인 프롬프트 확정은 Backend owner. 추적: [#3](https://github.com/gosu1/piecepool/issues/3).
