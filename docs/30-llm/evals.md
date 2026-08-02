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
| **부가 흐름 검증** | 파인만 / fact-check round-trip 작동 입증 |

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
    case-001-gemini.json
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
| `case-005-empty-source` | 짧은 모호한 텍스트 ("그것") | 빈 결과 (`concepts=0`) — 개념이 0개면 파인만 진입 불가 |
| `case-006-pdf-multi-concept` | Transformer 1장 (5개 Concept) | 다중 Concept 추출 + 관계 매핑 |
| `case-007-related-to-abuse` | `related_to` 과다 응답 입력 | 50% 초과 시 경고 로그 |

각 case의 `fixtures/*.json`과 `expected/*.json` 작성은 본 sub-task 머지 후 후속 PR.

---

## 4. 실행 방법

### 4.1 단일 case 실행

```bash
npm run eval -- --case case-001-self-attention
```

결과 → `docs/30-llm/evals/results/case-001-gemini.json`.

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
case-001-self-attention      gemini
must.schemaValid             ✅
must.concepts                ✅ 1
should.relations             2/2
must_not.confused            ✅
```

### 4.4 도구

- 실행: **TypeScript 자체 스크립트 + tsx 실행** (결정 2026-06-29). 이유: provider가 TS(`selectProvider().generateWikiStructured()`)라 in-process 직호출 — Python은 브리지 비용, vitest는 배치 출력과 어긋남. tsx는 기존 extensionless import를 config 없이 구동(devDep 1개). `npm run eval -- <args>` → `tsx scripts/eval.ts` (구현 완료 — `selectProvider`/`validate.ts` 직접 import, fixtures case-001~004·007 salvage. case-005/006은 후속).
- assertion: ajv (schema, `src/llm/validate.ts` keystone 재사용) + 자체 비교 로직 (should/must_not)

### 4.5 모델·엔드포인트를 바꿔 돌리기 (`eval:llm` 러너)

모델을 바꿨을 때 점수가 어떻게 변하는지가 eval의 존재 이유다. 기능별 러너(`scripts/evals/run.ts`)는 **측정 축**을 CLI로 받는다.

```bash
npm run eval:llm -- --adapter generate --model gemini-3.1-flash-lite   # 대상 모델 교체
npm run eval:llm -- --adapter generate --base-url http://localhost:1234/v1   # OpenAI 호환 엔드포인트 교체
npm run eval:all -- --model gemini-3.1-flash-lite                      # 전체를 같은 모델로
PIECEPOOL_LLM_MODEL=gemini-3.1-flash-lite npm run eval:ocr             # env 로도 된다
```

| 축 | CLI | env | 기본값 |
|---|---|---|---|
| 대상 모델 | `--model <name>` | `PIECEPOOL_LLM_MODEL` | 각 기능 함수의 기본값(대부분 `GEMINI_MODEL`, pdfsummary만 lite) |
| 대상 엔드포인트 | `--base-url <url>` | `PIECEPOOL_LLM_BASE_URL` | `GEMINI_OPENAI_ENDPOINT` |
| **심판 모델** | `--judge-model <name>` | `PIECEPOOL_JUDGE_MODEL` | `GEMINI_MODEL` **고정** |

- 아무것도 안 주면 `undefined`가 그대로 내려가 각 기능 함수의 기본값이 쓰인다 — **기본 실행 동작은 이 축이 생기기 전과 같다.**
- **심판은 대상 모델을 따라가지 않는다.** `--model`로 채점 대상을 바꿔도 judge는 그대로다 — 같이 바뀌면 점수 차이가 대상 모델 차이인지 심판 차이인지 가를 수 없어 비교가 성립하지 않는다. 분리 지점은 `scripts/evals/judge.ts`의 `resolveJudgeModel()`이고, `--base-url`도 judge 엔드포인트에는 적용되지 않는다.
- 결과 JSON(`results/run-*.json`, `latest.json`)에 실제로 쓴 `model` / `baseUrl` / `judgeModel`이 기록된다. 모델을 안 부르는 어댑터(chunk·classify·dedupConcepts)는 `null`이다. **모델이 안 적힌 baseline은 비교 근거가 못 된다.**
- 없는 모델명을 주면 모델 호출 어댑터 전부가 게이트에서 깨진다(HTTP 404 → `runFailed`, synthesize만 휴리스틱 폴백이라 `heuristicFallback`). 축이 실제로 먹는지 확인하는 가장 싼 방법이다.

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
- secrets: `GEMINI_API_KEY`는 GitHub Secrets

### 5.3 baseline 갱신

- `expected/*.json`은 의도적 변경 시에만 PR로 갱신
- 갱신 PR은 `eval-baseline-change` 라벨 (신규, TBD) → LLM owner review

---

## 6. 부가 흐름 평가

### 6.1 파인만 round-trip

개념이 1개 이상 추출되는 case(예: `case-001-self-attention`) 활용:
- 파인만 토글 on + 1차 호출이 Gemini로 성공 (진입 조건 [`output-validation.md`](output-validation.md) §6.1)
- 시뮬레이션 사용자 설명 주입 (fixture에 명시)
- 2차 호출 결과가 `must` 통과
- ImportJob status가 `clarify_pending` → `llm_processing` → `completed`로 전이

### 6.2 fact-check

- fixture에 의도적 사실 오류 포함 (예: "Transformer는 2010년 발표")
- Liner API 출처 검색을 호출했는지 (fact-check 경로는 Liner 단일 — LLM 웹 검색 도구 없음)
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

---

## 10. 기능별 eval 인덱스

LLM을 쓰는 기능마다 지표·합격선·baseline을 따로 둔다. 공용 러너는 `scripts/evals/`이고, 기능별 상세는 각 README에 있다.

| 기능 | 러너 | 상세 | 모델 호출 |
|---|---|---|---|
| 위키 생성 | `npm run eval:generate` | [generate/README.md](evals/generate/README.md) | 필요 |
| 위키 합성 | `npm run eval:synthesize` | [synthesize/README.md](evals/synthesize/README.md) | 필요 |
| 위키 병합 | `npm run eval:mergeWiki` | [mergeWiki/README.md](evals/mergeWiki/README.md) | 필요 |
| 개념 중복제거 | `npm run eval:dedupConcepts` | [dedupConcepts/README.md](evals/dedupConcepts/README.md) | 불필요 |
| 파인만 | `npm run eval:feynman` ※별도 러너 | [feynman/README.md](evals/feynman/README.md) | 필요 |
| 청킹 | `npm run eval:chunk` | [chunk/README.md](evals/chunk/README.md) | 불필요 |
| 분류 | `npm run eval:classify` | [classify/README.md](evals/classify/README.md) | 불필요 |
| OCR | `npm run eval:ocr` | [ocr/README.md](evals/ocr/README.md) | 필요 |
| PDF 요약 | `npm run eval:pdfsummary` | [pdfsummary/README.md](evals/pdfsummary/README.md) | 필요 |

`npm run eval:all`은 **공용 러너에 등록된 8종**을 순서대로 돌린다. **파인만은 포함되지 않는다** — 검증된 전용 러너(`scripts/feynman-eval.ts`)를 그대로 두기로 했기 때문이며, 따로 `npm run eval:feynman`으로 돌린다.

`--dry`는 **judge(LLM-as-judge) 호출만 생략한다. 대상 모델 호출은 그대로 나간다.** 파인만 러너의 `--dry`와 같은 의미다(probe는 부르고 judge만 건너뛴다). 그래서 dry라도 `GEMINI_API_KEY`가 필요하고 쿼터를 쓴다 — "무료 스모크"가 아니다. 코드로 잡는 지표만 보고 싶다면 모델을 호출하지 않는 세 기능(`chunk`·`classify`·`dedupConcepts`)을 돌리면 된다.

**실행 위치는 로컬이다.** CI에 올리지 않는다 — API 키가 필요하고 비결정적이라 PR마다 돌리면 비용과 flaky가 생긴다. baseline은 각 기능의 `results/latest.json` 커밋으로 비교한다. `run-*.json`은 `.gitignore` 대상이다.

## 11. 게이트 작성 규칙

1. 게이트는 `지표 op 임계값` 형태만 쓴다. "좋아졌다", "자연스럽다" 같은 자유서술 판정은 게이트가 될 수 없다.
2. **지표가 산출되지 않으면 통과가 아니라 실패다.** 러너 코어가 이 규칙을 강제한다 (`scripts/evals/core.ts` `evaluateGates`).
3. LLM judge를 쓰는 지표는 반드시 (a) 근거 인용을 강제하고 (b) 애매하면 더 심한 쪽을 고르게 하고 (c) 중립 라벨로 도망갈 수 없게 강제 분류한다. 게이트는 라벨의 개수·비율만 본다.
4. 임계값을 조정할 때는 **실측 근거**를 README `변경 이력`에 남긴다. 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.
5. 새 게이트는 **적대적 검증을 거친다.** 지표를 만들지 않은 사람이 합격선 표만 보고 "전 게이트를 통과하면서 쓸모없는 출력"을 설계하고, mock으로 실제 통과하는지 확인한다. 결과는 각 README의 `## 적대적 검증`에 표로 남기고, 자동으로 못 잡는 것은 그 절에 명시한다. **뚫린 게이트는 지표를 추가해 막고, 임계값을 낮춰 통과시키지 않는다.**
6. **README의 숫자는 출처에서 옮겨 적는다. 기억으로 쓰지 않는다.** 출처는 둘로 갈린다.
   - **실측치·모델명** → `results/latest.json` (`metrics`·`model`·`judgeModel`·`baseUrl`·`runAt`)
   - **허용값(임계값)** → 어댑터의 `gates[].threshold` / `label`

   둘 다 실제로 틀린 적이 있다. ocr README가 모델명을 `gemini-2.5-flash`로 적었으나 코드 상수는 줄곧 `gemini-3.5-flash`였고, pdfsummary README가 `charsPerSectionMin` 허용을 `≥ 40`으로 적었으나 코드는 `MIN_CHARS_PER_SECTION = 25`였다. 둘 다 파일을 안 보고 손으로 지은 값이다. 합격선 표와 현재 결과 표의 허용값이 서로 달라지면 **어느 쪽이 게이트인지 알 수 없어진다.**
7. **게이트가 깨진 채로도 baseline을 남긴다.** 통과한 것만 적으면 완료 조건의 증거가 아니라 홍보물이 된다. 실패한 게이트는 실측값과 함께 `## 현재 결과`에 그대로 적고, 원인을 아는 만큼 쓴다.

## 12. 판정 담당

> 평가지표를 만드는 사람과 그 지표로 판정하는 사람은 갈라야 한다. LLM Core 코드를 소유한 사람이 자기 기준으로 자기 코드를 판정하면 지표가 게이트로 기능하지 않는다.

**규칙**

- 어떤 기능의 `src/llm/*` 코드를 소유한 사람은 그 기능의 **합격선을 단독으로 승인할 수 없다.**
- 합격선 변경(임계값 조정·게이트 추가/삭제)은 판정 담당의 승인이 필요하다.
- 지표가 깨졌을 때 "이건 오탐이다"를 판단하는 것도 판정 담당이다.

| 기능 | 코드 소유자 | 판정 담당 |
|---|---|---|
| 위키 생성 | @kingmin-1225 | @kingmin-1225 ⚠️ |
| 위키 합성 | @kingmin-1225 | @kingmin-1225 ⚠️ |
| 위키 병합 | @kingmin-1225 | @kingmin-1225 ⚠️ |
| 개념 중복제거 | @kingmin-1225 | @kingmin-1225 ⚠️ |
| 파인만 | @kingmin-1225 | @kingmin-1225 ⚠️ |
| 청킹 | @kingmin-1225 | @kingmin-1225 ⚠️ |
| 분류 | @kingmin-1225 | @kingmin-1225 ⚠️ |
| OCR | @kingmin-1225 | @kingmin-1225 ⚠️ |
| PDF 요약 | @kingmin-1225 | @kingmin-1225 ⚠️ |

⚠️ **현재 두 역할이 겸임 상태다 — 위 규칙이 금지하는 구성이다.** 팀에 다른 역할 owner가 있으므로(CODEOWNERS 참조) 구조적으로 불가능해서가 아니라 아직 배정하지 않은 것이다. 표를 비워 두면 "안 정했다"와 "정할 생각 없다"가 구분되지 않아 겸임 사실을 명시한다.

**겸임이 해소될 때까지의 대체 장치** — 사람의 독립성을 대신하지는 못하고, 결정을 기록에 남겨 나중에 검증 가능하게만 한다.

1. 임계값 변경은 각 README `## 변경 이력`에 **실측 근거와 함께** 남긴다 (§11 규칙 4). 근거 없는 변경은 이력에서 바로 드러난다.
2. 새 게이트는 **적대적 검증**을 거친다 (§11 규칙 5). 구현을 보지 않은 쪽이 합격선 표만으로 공격을 설계한다.
3. 깨진 게이트는 통과시키지 않고 **실패 상태로 공개**한다 (§11 규칙 7).

**우선 넘겨야 할 결정:** `generate`의 `shouldMetRatio ≥ 0.6`. 실측 0.5217로 실패 중이고, 이 임계값은 baseline 없이 정한 잠정값이다. 낮출지 유지할지를 코드 소유자가 단독으로 정하면 위 규칙 1번을 정면으로 어긴다. 단, [`generate/README.md`](evals/generate/README.md)의 적대적 검증 절에 적힌 **`shouldMetRatio` 계산 결함**(`scripts/eval.ts`의 `warnings` 오염)을 먼저 고쳐야 한다 — 잘못 잰 숫자로 기준을 정하게 된다.
