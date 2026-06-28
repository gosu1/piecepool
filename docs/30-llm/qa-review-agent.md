# QA-Review Agent (저장 전 의미 검증)

LLM 추출 결과를 **디스크에 쓰기 전에** 환각·추측·경로오류를 잡는 검증 단계.

> **상태**: 제안. 규칙기반 일부는 MVP 흡수 가능, LLM self-check는 post-MVP/Premium.
> 외부 영감: research-wiki-skill-kit "QA 리뷰"(환각/추측/경로의존 가드).
> 보완 대상: [`output-validation.md`](output-validation.md)는 **구문/스키마** 검증. 본 문서는 그 위의 **의미** 검증.

---

## 1. 동기

`output-validation.md` §3은 구조 검증(JSON Schema, title 일관성, 노드 호환, sourceRef 무결성)을 한다. 하지만 **의미 환각**은 못 잡는다:

- 원문에 없는 사실을 그럴듯하게 적은 `explanation`
- `evidence.reason`은 있는데 실제 원문에 그 내용이 없음
- 입력 범위를 벗어난 일반지식 확장

PiecePool은 LLM 출력을 `wiki/`·`relations.json`에 **영구 저장**한다 → 한 번 들어간 환각이 지식 지도를 오염시키고 누적된다. 쓰기 전 한 번 더 거른다.

---

## 2. 파이프라인 위치

import 상태기계([`../10-contracts/entities.md#importjob`](../10-contracts/entities.md#importjob))에서 `llm_processing`과 `writing` **사이**. 신규 상태 없음(검증은 writing 직전 단계).

```text
llm_processing → [output-validation §3 구문검증]
              → [qa-review 의미검증]   ← 본 문서
              → writing
```

- 통과: 그대로 `writing`.
- 부분 위반: 해당 concept/relation drop → 기존 부분 실패([`output-validation.md`](output-validation.md) §5)와 동일 경로.
- 의심 다수(Premium): 되묻기 트리거([`output-validation.md`](output-validation.md) §6).

---

## 3. 검사 항목 (skill-kit 3축 + PiecePool 확장)

| # | 축 | 검사 | 입력 |
|---|---|---|---|
| 1 | **환각** | `concept.summary/explanation`의 핵심 주장이 archive 원문에 존재? | archive 텍스트 |
| 2 | **근거 정합** | `evidence.quote`/`reason`이 실제 원문과 일치? | archive 텍스트 |
| 3 | **추측 확장** | explanation이 입력에 없는 배경지식으로 벗어남? | sourceText 범위 |
| 4 | **경로의존** | `sourceRefs`/`evidence`의 file·page 실존? | sources/ 파일 |
| 5 | **related_to 남용** | 비율 점검(기존 §3.5 연계) | relations |
| 6 | **dedup 정합** | merge 대상 normalizedTitle이 실제 동일 개념? | 기존 Concept |

1~3이 핵심(의미). 4~6은 기존 검증 강화.

---

## 4. 검증 방식 (provider별 비용 차등)

| 플랜 | 방식 | 비용 |
|---|---|---|
| **Free (local)** | 규칙기반: quote substring 매칭, page 범위, 경로 실존, related_to 비율. LLM 추가 호출 **없음** | 0 |
| **Premium** | 위 + LLM self-check 1회: "이 concept이 원문에 근거하는가? 추측이면 표시하라" | 호출 +1 |

- Free도 1·2·4·5는 규칙으로 상당 부분 커버(substring/경로/비율).
- 3(추측 확장)은 의미 판단 → Premium LLM self-check가 강함.

### 4.1 LLM self-check 프롬프트 (Premium)

```text
아래 [원문]과 [추출 결과]가 주어진다.
각 concept에 대해 판정하라:
- grounded: 핵심 주장이 원문에 있음
- speculative: 원문에 없는 보충 추론 포함 (어느 문장인지 표시)
원문에 없는 내용은 speculative로 표시한다. 새 사실을 만들지 않는다.
출력: { conceptTitle, verdict, speculativeSpans[] }[]
```

> 본 self-check는 `LlmWikiResult` 스키마와 무관(검증용 부가 호출). SSOT 무변경.

---

## 5. 처리 정책

| 판정 | 처리 |
|---|---|
| grounded | 저장 |
| speculative (일부) | 해당 문장 표시 + 저장(사용자 확인 배지) — 자동 삭제 금지 |
| 원문에 전혀 없음 | concept/relation drop, `ImportJob.errorMessage`에 사유 기록 |
| 경로 깨짐 | 인용만 drop, concept 저장(기존 §3.4와 동일) |

`ImportJobStatus`는 `completed` 유지(실패 아님). 사용자엔 경고 배지 — [`output-validation.md`](output-validation.md) §5.3과 동일 UI 경로.

---

## 6. 스코프

- 규칙기반(1·2·4·5·6): **MVP 흡수 가능** — 가볍고 저장 품질 직결.
- LLM self-check(3): **post-MVP / Premium**.
- 에이전트형(자율 재검토·재호출)은 [`wiki-qa-agent.md`](wiki-qa-agent.md) §9 멀티에이전트와 함께 Premium 후속.
- 추적: [#3](https://github.com/gosu1/piecepool/issues/3) / [#30](https://github.com/gosu1/piecepool/issues/30)(output-validation 연계).
