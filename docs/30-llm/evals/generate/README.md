# 위키 생성 eval

노트 → `LlmWikiResult` 구조화 추출([`src/llm/gemini.ts`](../../../../src/llm/gemini.ts) `generateWikiStructured`)을 골든 케이스로 측정한다. 러너: `npm run eval:generate`

```bash
export GEMINI_API_KEY=...
npm run eval:generate                                      # 전체 골든 케이스
npm run eval:generate -- --case case-001-self-attention    # 하나만
npm run eval:generate -- --dry                             # 배선만 확인(키 없으면 runFailed 로 잡힌다)
```

## 왜 단위 테스트가 아닌가

프로바이더 단위 테스트는 요청 모양·재시도·파싱까지만 증명한다. 여기서 재는 것은 **모델이 실제로 무엇을 뽑아왔는가**다 — 개념을 놓쳤는지, 관계 유형을 아무거나 붙였는지, 스키마를 만족하는지.

기존 [`scripts/eval.ts`](../../../../scripts/eval.ts)가 이미 골든 케이스를 채점하지만 **케이스별 pass/fail만** 낸다. 합격선이 문서에 없고 집계 지표도 없어서 "지난번보다 나빠졌는가"를 물을 수 없다. 이 eval은 `eval.ts`의 `assertCase`를 **그대로 재사용**하고 그 위에 집계 지표와 게이트만 얹는다. 채점 로직을 복제하지 않는다 — 복제하면 두 채점기가 갈라진다.

`eval.ts`는 수정하지 않는다. `import.meta.url === pathToFileURL(process.argv[1]).href` 가드 덕분에 `assertCase`를 import해도 `eval.ts`의 CLI가 돌지 않는다.

## 판정 층

**fixture / expected** — [`docs/30-llm/evals/fixtures/`](../fixtures)와 [`docs/30-llm/evals/expected/`](../expected)의 기존 골든 케이스를 그대로 쓴다. 새 디렉토리를 만들지 않는다.

**`assertCase` 채점** (코드, [`scripts/eval.ts`](../../../../scripts/eval.ts)) — expected 파일의 세 층을 본다.

- **`must`** — 반드시 만족해야 하는 것. 어기면 `failures`에 들어가고 그 케이스는 실패다. 개념 제목 포함, 최소 관계 수, 스키마 유효성.
- **`should`** — 만족하면 좋은 것. 어겨도 실패가 아니라 `warnings`다. 제목 표기가 프로바이더마다 흔들리는 영역이라 부분 포함(양방향)으로 느슨하게 본다.
- **`must_not`** — 나오면 안 되는 것. 금지 관계 유형, 등장하면 안 되는 개념.

**스키마 재검증** (코드, [`src/llm/validate.ts`](../../../../src/llm/validate.ts)) — ajv로 `LlmWikiResult`를 다시 검증한다. 프로바이더가 구조화 출력을 `strict: false`로 요청하므로 실제 강제는 여기서 한다.

judge 없음. 골든 케이스 채점으로 충분하다.

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `mustFail` | 0 — must 위반 0건 |
| `schemaInvalid` | 0 — 스키마 위반 0건 |
| `relatedToRatioMax` | ≤ 0.3 — related_to 비율 ≤ 30% *(잠정, baseline 측정 후 확정)* |
| `shouldMetRatio` | ≥ 0.6 — should 충족률 ≥ 60% *(잠정, baseline 측정 후 확정)* |
| `thinConcepts` | 0 — 설명 50자 미만 개념 0건 *(잠정, baseline 측정 후 확정)* |

`related_to ≤ 30%`는 이 eval이 정한 숫자가 아니다. [`docs/10-contracts/relation-types.md`](../../../10-contracts/relation-types.md)가 **`related_to`는 최후의 수단이며 저장된 관계의 30%를 넘으면 review에서 플래그한다**고 규정한다. 그 규정을 게이트로 옮긴 것이다. 모델이 관계 유형을 고민하지 않고 전부 `related_to`로 던지면 그래프가 의미를 잃는다.

`latencyP50` / `latencyMax`도 기록하지만 게이트는 걸지 않는다 — 네트워크 상태에 좌우되므로 추이 관찰용이다.

## 현재 결과 — `results/latest.json`

**미측정 — 2차.** 모델 호출이 필요해 `GEMINI_API_KEY` 없이는 baseline을 낼 수 없다.

배선은 확인했다. 키 없이 `npm run eval:generate -- --dry --case case-001-self-attention`을 돌리면:

```
💥 case-001-self-attention [provider=gemini] auth: GEMINI_API_KEY missing
runFailed 1  →  게이트 실패: 실행 실패 0 — 실측 1 (허용 <= 0)  →  exit 1
```

키가 있으면 실제 호출이 나가고 지표가 채워진다. **CLI는 `process.env.GEMINI_API_KEY`를 읽는다** — 앱의 `localStorage["gemini-key"]`가 아니다.

## 적대적 검증

README의 합격선만 보고 "골든 케이스를 전부 통과하면서 위키가 텅 비는 응답"을 설계한 뒤, mock 응답을 넣어 5개 케이스 전부에서 확인했다.

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| `must`·`should` 제목만 정확히 채우고 모든 `summary`/`explanation`을 `"."` 한 글자로 | ❌ **통과함** — `mustFail 0`, `schemaInvalid 0`, `relatedToRatioMax 0`, **`shouldMetRatio 1.0` 만점** | `thinConcepts` 지표 추가 (실측: 공격 23건) |
| 관계를 전부 `related_to`로 던지기 | ✅ `relatedToRatioMax`가 잡음 — **케이스 최대값**이라 한 케이스만 무너져도 걸린다(평균이었으면 가려졌을 것) | 없음 |
| 관계를 0개로 내보내기 | ✅ `must.relationsAtLeast`가 잡음 | 없음 |

스키마의 `explanation`은 `minLength: 1`이라 마침표 한 글자도 유효하다. `assertCase`는 **제목의 존재**와 **관계 개수**만 보므로 본문이 비어 있는지 알 방법이 없었다.

**자동으로 못 잡는 것:**

- **`thinConcepts`는 길이의 하한일 뿐이다.** 50자를 채운 무의미한 문장(같은 말 반복, 원문 복붙)은 통과한다. 설명이 실제로 개념을 설명하는지는 사람 표본 검수가 필요하다.
- **`should` 판정에는 계산 결함이 있다.** `shouldMetRatio = (shouldTotal - warnings.length) / shouldTotal`인데 `assertCase`의 `warnings`에는 `should` 미충족 외에 **`related_to 비율 > 50%` 경고도 섞여 들어간다**(`scripts/eval.ts`). 그 경고가 뜨면 충족률이 실제보다 낮게(경우에 따라 음수로) 계산된다. `eval.ts`는 이번 작업에서 고치지 않기로 한 파일이라 **보고만 한다.**
- 개념 제목만 맞고 내용이 엉뚱한 개념을 설명하는 경우는 골든 케이스로 잡히지 않는다.

## fixture 추가하기

fixture와 expected가 **쌍**이다. `id`가 같아야 짝이 맞는다.

`fixtures/<id>.json`:

```jsonc
{
  "id": "case-008-...",
  "title": "사람이 읽을 케이스 이름",
  "input": {                              // LlmWikiInput (src/llm/provider.ts)
    "sourceTitle": "…",
    "sourceText": "…원문 노트…",
    "sourceFiles": [],
    "subjects": [{ "id": "subject-ai", "name": "AI" }],
    "existingConcepts": []
  }
}
```

`expected/<id>.expected.json`:

```jsonc
{
  "caseId": "case-008-...",
  "must": { "conceptTitles": ["…"], "relationsAtLeast": 1, "schemaValid": true },
  "should": { "relatedConceptTitles": ["…"], "relationTypeHints": [{ "from": "…", "to": "…", "type": "part_of" }] },
  "must_not": { "relationTypes": ["review_needed"] }
}
```

- `must_not.relationTypes`에 `review_needed`를 넣는 것은 규정이다 — [`relation-types.md`](../../../10-contracts/relation-types.md)에 따라 **LLM과 백엔드는 절대 `review_needed`를 부여하지 않는다.** 사용자 전용 액션이다.
- `should`가 비면 `shouldMetRatio`가 `NaN`이 되고, `NaN`은 통과가 아니라 실패다. 케이스를 추가하면 `should`도 채운다.

**좋은 fixture는 관계 유형 선택을 강제한다.** 개념 하나짜리 노트는 관계를 안 만들어도 통과한다. 두 개념이 명확한 관계(선행조건·부분·대조)로 묶이는 노트, 헷갈리는 개념 쌍이 나오는 노트, `related_to`로 도망가기 쉬운 노트를 넣는다.
