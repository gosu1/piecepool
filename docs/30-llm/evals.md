# Evals

LLM 호출 골든 케이스 + 회귀 방지.

> SSOT: [`../10-contracts/llm-output-schema.md`](../10-contracts/llm-output-schema.md).
> 어댑터: [`provider-config.md`](provider-config.md).
> 검증: [`output-validation.md`](output-validation.md).
> 플랜: [`../00-overview/pricing-model.md`](../00-overview/pricing-model.md).

---

## 1. 목적

| 목적 | 측정 대상 |
|---|---|
| **회귀 방지** | 모델/프롬프트 변경 시 기존 기대 결과 유지 |
| **품질 baseline** | 출력 품질 정량화 |
| **부가 흐름 검증** | 되묻기 / fact-check round-trip 작동 입증 |

---

## 2. 골든 케이스 구조

### 2.1 디렉토리

```text
docs/30-llm/evals/
  fixtures/
    case-001-self-attention.json
    case-002-deadlock.json
    case-003-graph-vs-gnn.json
    ...
  expected/
    case-001-self-attention.expected.json
    case-002-deadlock.expected.json
    ...
  results/                          # CI 산출물, gitignore
    case-001-openai.json
    ...
```

### 2.2 fixture JSON 스키마

```json
{
  "id": "case-001-self-attention",
  "title": "Self-Attention 단일 source 추출",
  "input": {
    "sourceTitle": "Transformer 강의 3주차",
    "sourceText": "Self-Attention은 sequence 안의 각 token이 다른 token과의 관계를 계산해 문맥 표현을 만드는 attention mechanism이다. Transformer의 핵심 layer 중 하나로, Multi-Head Attention의 기본 단위가 된다.",
    "sourceFiles": [],
    "subjects": [{ "id": "subject-ai", "name": "AI" }],
    "existingConcepts": []
  },
  "tags": ["single-source", "concept-extraction", "relation-part-of"]
}
```

### 2.3 expected JSON 스키마 (정량 + 정성)

```json
{
  "caseId": "case-001-self-attention",
  "must": {
    "conceptTitles": ["Self-Attention"],
    "relationsAtLeast": 0,
    "schemaValid": true
  },
  "should": {
    "conceptTitlesAlsoAcceptable": ["Self-Attention Mechanism", "Self Attention"],
    "relatedConceptTitles": ["Transformer", "Multi-Head Attention"],
    "relationTypeHints": [
      { "from": "Self-Attention", "to": "Transformer", "type": "part_of" },
      { "from": "Self-Attention", "to": "Multi-Head Attention", "type": "part_of" }
    ]
  },
  "must_not": {
    "relationTypes": ["confused_with"],
    "concepts": ["Backpropagation"]
  }
}
```

- `must`: 통과 필수
- `should`: 통과 시 가산점
- `must_not`: 등장 시 fail

---

## 3. 골든 케이스 카탈로그 (MVP)

| ID | 제목 | 검증 포인트 |
|---|---|---|
| `case-001-self-attention` | Self-Attention 단일 source | Concept 추출, `part_of` relation |
| `case-002-deadlock` | Deadlock OS 강의 한 단락 | `causes` relation (Deadlock → System Hang) |
| `case-003-graph-vs-gnn` | 자료구조 Graph + AI GNN 누적 | cross-subject `related_to` / `used_in` |
| `case-004-confusing-pair` | Process vs Thread 대조 | `confused_with` relation |
| `case-005-empty-source` | 짧은 모호한 텍스트 ("그것") | 빈 결과 (`concepts=0`) 또는 되묻기 트리거 |
| `case-006-pdf-multi-concept` | Transformer 1장 (5개 Concept) | 다중 Concept 추출 + 관계 매핑 |
| `case-007-related-to-abuse` | `related_to` 과다 응답 입력 | 50% 초과 시 경고 로그 |

각 case의 `fixtures/*.json`과 `expected/*.json` 작성은 본 sub-task 머지 후 후속 PR.

---

## 4. 실행 방법

### 4.1 단일 case 실행

```bash
npm run eval -- --case case-001-self-attention
```

결과 → `docs/30-llm/evals/results/case-001-openai.json`.

### 4.2 전체 실행

```bash
npm run eval -- --all
```

### 4.3 결과 표

```bash
npm run eval -- --report case-001-self-attention
```

결과 표 출력:

```
case-001-self-attention      openai
must.schemaValid             ✅
must.concepts                ✅ 1
should.relations             2/2
must_not.confused            ✅
```

### 4.4 도구

- 실행: **TypeScript 자체 스크립트 + tsx 실행** (결정 2026-06-29). 이유: provider가 TS(`selectProvider().generateWikiStructured()`)라 in-process 직호출 — Python은 브리지 비용, vitest는 배치 출력과 어긋남. tsx는 기존 extensionless import를 config 없이 구동(devDep 1개). `npm run eval -- <args>` → `tsx scripts/eval.ts` (구현 완료 — `selectProvider`/`validate.ts` 직접 import, fixtures case-001~004·007 salvage. case-005/006은 후속).
- assertion: ajv (schema, `src/llm/validate.ts` keystone 재사용) + 자체 비교 로직 (should/must_not)

---

## 5. 회귀 방지 정책

### 5.1 트리거

회귀 검사가 발동하는 변경:

| 변경 대상 | 회귀 영향 |
|---|---|
| `provider-config.md` 어댑터 인터페이스 | 전체 |
| `prompt-templates.md` system/user 프롬프트 | 전체 |
| `llm-output-schema.md` JSON Schema | 전체 (SSOT contracts-change) |
| `output-validation.md` 검증 단계 | 전체 |
| 모델 변경 (`PIECEPOOL_LLM_MODEL`) | 전체 |
| 기능 토글 (`PIECEPOOL_*`) | 해당 흐름만 |

### 5.2 CI 통합 (후속)

- MVP: 로컬 수동 실행
- 후속: GitHub Actions matrix (case)
- API 비용 절감: weekly 또는 manual trigger
- secrets: `OPENAI_API_KEY`는 GitHub Secrets

### 5.3 baseline 갱신

- `expected/*.json`은 의도적 변경 시에만 PR로 갱신
- 갱신 PR은 `eval-baseline-change` 라벨 (신규, TBD) → LLM owner review

---

## 6. 부가 흐름 평가

### 6.1 되묻기 round-trip

`case-005-empty-source` 활용:
- 1차 호출이 트리거 조건 만족 ([`output-validation.md`](output-validation.md) §6.1)
- 시뮬레이션 사용자 응답 주입 (fixture에 명시)
- 2차 호출 결과가 `must` 통과
- ImportJob status가 `clarify_pending` → `llm_processing` → `completed`로 전이

### 6.2 fact-check

- fixture에 의도적 사실 오류 포함 (예: "Transformer는 2010년 발표")
- Liner API 출처 검색 호출했는지 (또는 대안 OpenAI web_search tool call 흔적)
- suggest 패널에 수정안 등장 (Frontend test와 연계)
- `evidence[].reason`에 출처 URL 누적

---

## 7. QA / retrieval agent eval (post-MVP)

§3 골든 케이스는 **쓰기(추출)** 검증. 질의 에이전트는 **읽기** 검증이 따로 필요하다.

- 상세: [`wiki-qa-agent.md`](wiki-qa-agent.md) §8 — 난이도별 자동 질문(easy/medium/hard/trap) + 파일 attribution + 환각 0 + 추론 격리 + 경로 유효.
- 하니스 확장: `npm run eval -- --agent --space <slug>` — seed vault 기반, §4 results/ 표 재사용.
- 저장 전 의미 검증(import 시점)은 [`qa-review-agent.md`](qa-review-agent.md).
- **멀티에이전트 import eval은 보류** ([`wiki-qa-agent.md`](wiki-qa-agent.md) §9): 호출 N배 → 비용모델과 충돌.

---

## 8. 미해결 / open-questions 후보

- ~~evals 실행 도구~~ → TS 자체 스크립트 + tsx 결정 (2026-06-29, §4.4)
- CI matrix 비용 정책 (호출 빈도) — `post-mvp.md` §11
- baseline 갱신 라벨 (`eval-baseline-change`) 신규 — 후속 PR

---

## 9. 변경 이력 노트

- 본 문서는 신규 작성이다. 초안 = [Phase 4 tracking #3 (LLM)](https://github.com/gosu1/piecepool/issues/3) + [sub-issue #32](https://github.com/gosu1/piecepool/issues/32) 기반.
- 골든 케이스 7건은 MVP scope. `fixtures/*.json`과 `expected/*.json` 실제 작성은 별도 PR.
- §5.2 CI 통합 / §5.3 baseline 갱신 / §8 도구 선택 → 결정 보류, [`open-questions.md`](../00-overview/open-questions.md) 추가 예정.
