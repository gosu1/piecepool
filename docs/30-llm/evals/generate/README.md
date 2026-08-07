# 위키 생성 eval

노트 → `LlmWikiResult` 구조화 추출([`src/llm/gemini.ts`](../../../../src/llm/gemini.ts) `generateWikiStructured`)을 골든 케이스로 측정한다. 러너: `npm run eval:generate`

```bash
export GEMINI_API_KEY=...
npm run eval:generate                                      # 전체 골든 케이스
npm run eval:generate -- --case case-001-self-attention    # 하나만
npm run eval:generate -- --dry                             # judge만 생략 — 대상 모델 호출은 나간다(키 필요)
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

**실측 완료 — 게이트 3개 실패** (`gemini-3.5-flash`, 2026-08-07, fixture 5종, `shouldMetRatio` 수정 공식).

| 지표 | 실측 | 허용 |
|---|---|---|
| `runFailed` / `mustFail` / `schemaInvalid` | 0 / 0 / 0 | 0 |
| **`relatedToRatioMax`** | **0.3333** | ≤ 0.30 ❌ |
| **`thinConcepts`** | **1** | 0 ❌ |
| **`shouldMetRatio`** | **0.5652** | ≥ 0.60 ❌ |
| `latencyP50` / `latencyMax` | 14.3s / 20.2s | — |

`shouldMetRatio` 0.5652는 2026-08-08 계산 결함 수정(아래 적대적 검증 절) 후 처음 나온 신뢰 가능한 수치다 — 직전 기록 0.5217은 `related_to` 경고 오염이 섞인 값이라 추이 비교 대상이 아니다. 여전히 잠정 임계값 0.6 미달이며, **모델이 부족한 것인지 기준이 과한 것인지는 그대로 미결이다.** 임계값 조정은 §12 판정 담당의 승인 사항이므로 **낮추지 않고 실패 상태로 둔다.** `relatedToRatioMax`·`thinConcepts`는 아래 분산 표대로 회차 따라 0도 나오는 지표다 — 이번 회차는 계약(30% 상한) 위반 쪽이 나왔고 그대로 공개한다.

**실행 간 변동이 크다.** 같은 fixture 5종을 두 번 돌린 결과:

| 지표 | 1회차 | 2회차 |
|---|---|---|
| `relatedToRatioMax` | **0.3333** (실패) | **0** (통과) |
| `thinConcepts` | **1** (실패) | **0** (통과) |
| `shouldMetRatio` | 0.5217 | 0.5217 |

코드는 그대로인데 실패 게이트가 3개에서 1개로 줄었다. n=5로는 회귀와 우연을 못 가른다는 뜻이다 — 특히 `related_to` 비율은 [`relation-types.md`](../../../10-contracts/relation-types.md)의 계약(30% 상한)이라 33%가 나온 회차는 실제 계약 위반이었다. **fixture 증량과 반복 실행이 필요하다.**

`sourceRefs` 경고도 5개 케이스 전부에서 나왔다 — `[provider=gemini] sourceRef: dropped N ref(s) referencing unknown sources`. 모델이 입력에 없는 `sourceId`를 지어내고 `generate.ts`가 조용히 버린다. **어떤 게이트도 이걸 보지 않는다.** 인용 출처가 통째로 유실되는 경로라 지표 추가 후보다. 로컬 모델(PIE-44)에서는 같은 계열의 드랍이 두 종류 더 나왔다 — 존재하지 않는 개념 제목을 참조하는 관계, 노드 호환성 위반 관계. 전부 조용히 버려지므로 같은 사각지대다.

**CLI는 `process.env.GEMINI_API_KEY`를 읽는다** — 앱의 `localStorage["gemini-key"]`가 아니다.

## 로컬 모델 비교 (PIE-44)

"키 없이 첫 경험"의 두 번째 필수 축([PIE-44](https://linear.app/piecepool/issue/PIE-44)). 같은 fixture 5종·같은 프롬프트·같은 프로덕션 배선(타임아웃 60초 × 재시도 3회)으로 로컬 4모델을 재고 기준선과 나란히 놓았다.

측정 조건: Ollama 0.32.5 OpenAI 호환(`--base-url http://localhost:11434/v1`), `ollama ps` CONTEXT 40960 확인(조용한 truncate 없음), qwen3:8b는 29%/71% CPU/GPU 분할, 모델 교체 전 `ollama stop`. 2026-08-07~08. 숫자 출처는 실행별 `results/run-*.json`(gitignore — 로컬 보존). generate 는 judge 없는 eval이라 로컬 실행의 Gemini 소모는 0콜이다.

| 지표 | Gemini(기준선) | qwen3:8b ①/② | qwen3:4b | A.X-4.0-Light | exaone3.5:7.8b* |
|---|---|---|---|---|---|
| `runFailed` | 0 | 2 / 2 | **5 (전멸)** | 0 | 2 |
| `mustFail` | 0 | 0 / 0 | — | 2 | 0 |
| `schemaInvalid` | 0 | 0 / 0 | — | 0 | 0 |
| `relatedToRatioMax` | 0.3333 | **1.0 / 1.0** | — | 0 | 0 |
| `shouldMetRatio` | 0.5652 | 0.083 / 0 | 미산출 | 0.043 | 0.5 |
| `thinConcepts` | 1 | 0 / 0 | — | 5 | 1 |
| `latencyP50` | 14.3s | 50.7s / 46.9s | (타임아웃) | 9.1s | 73.1s |
| `latencyMax` | 20.2s | 180.8s† | 180.8s† | 18.7s | 135.7s |

\* exaone3.5는 라이선스 NC — 참고 전용. † 180.8s = 타임아웃 낙제 경로(60s × 3회 재시도 소진).

**로컬 4모델 전부 불합격.** 관찰:

1. **구조화 출력 자체는 된다.** Ollama OpenAI 호환에서 `response_format: json_schema`가 작동해 완주 케이스의 `schemaInvalid`는 전 모델 0이다. 예외는 exaone3.5의 `strength > 1` 위반(재시도 3회 소진, 신규 실패 유형) 1건.
2. **qwen3 계열의 낙제 경로는 타임아웃이다.** thinking이 60초 예산을 넘겨 매 시도가 잘린다. 타임아웃을 9분으로 늘린 진단 런의 실제 완료 시간: 8b `case-002` 74.5s, 8b `case-007` 145.6s, 4b `case-001` 77.8s — 지연이 절망적인 게 아니라 **60초 고정 예산이 thinking 소요를 못 담는 것**이다. 단, 완주시켜도 아래 품질 낙제는 그대로다.
3. **qwen3:8b는 related_to 로 도피한다.** 케이스 최대 100%(계약 상한 30%) — 관계 유형 판단을 포기하는 패턴이 2회 재현. `shouldMetRatio` 0~0.083로 관계 유형 힌트를 거의 못 맞춘다.
4. **A.X는 빠르고 비어 있다.** P50 9.1s(기준선급)인데 개념 제목을 영어로 추출해 must 매칭 실패(2건), 관계 0개 케이스, `thinConcepts` 5건. pdfsummary 때(속도 최고·콜아웃 0.17)와 같은 "형식만 빠르게, 내용 빈약" 패턴.
5. **exaone3.5 완주 케이스 품질은 로컬 최고**(should 0.5, 기준선 −0.065)지만 지연 52~135s에 NC 라이선스라 채택 불가.
6. **환각 축은 아무도 안 봤다.** generate 는 judge 없는 eval이다. pdfsummary 실측(PIE-55)에서 로컬 낙제 최대 항목이 환각(기준선 0/4 vs 로컬 3~4/4)이었으므로, 위 수치는 로컬 품질의 **상한**으로 읽어야 한다.

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
- **`should` 판정 계산 결함 — 수정됨(2026-08-08, PIE-44 선행 작업).** `assertCase`의 `warnings`에 `should` 미충족 외에 `related_to 비율 > 50%` 경고가 섞여 충족률이 실제보다 낮게(케이스에 따라 음수까지) 계산되던 결함. 어댑터가 `should.` 접두사 경고만 세도록 고쳤다 — `generate.test.ts`가 오염 입력으로 실증한다. `eval.ts`는 여전히 무수정(채점기 복제 금지 원칙 유지).
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

## 변경 이력

임계값·측정 범위를 바꿀 때마다 **실측 근거와 함께** 여기에 남긴다 (evals.md §11 규칙 4). 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

| 날짜 | 바꾼 것 | 근거 |
|---|---|---|
| 2026-08-02 | `thinConcepts` 지표 신설 (설명 50자 미만 개념 수) | 적대적 검증에서 마침표 하나짜리 본문이 `shouldMetRatio` 만점을 받았다 |
| 2026-08-02 | 임계값 **무변경** — `shouldMetRatio ≥ 0.6` 실패(실측 0.5217)를 그대로 둠 | 0.6은 baseline 없이 정한 잠정값이나, 낮출지는 §12 판정 담당의 승인 사항 |
| 2026-08-08 | `shouldMetRatio` 계산 수정 — `should.` 접두사 경고만 미충족으로 집계 | `related_to >50%` 경고 오염으로 충족률이 실제보다 낮게 계산되던 결함(적대적 검증 절에 기록돼 있던 부채). `generate.test.ts` 오염 mock으로 실증. eval.ts 무수정 |
| 2026-08-08 | `latest.json`을 수정 공식 재실측치로 교체 (`runAt 2026-08-07T14:46:05.742Z`) — 임계값 무변경 | 오염 공식의 0.5217은 추이 비교 불가. 재실측 0.5652도 0.6 미달 — 실패인 채로 공개. `relatedToRatioMax 0.3333`·`thinConcepts 1`도 이번 회차 실측 그대로 |
| 2026-08-08 | 로컬 모델 4종 실측 기록(PIE-44) — 임계값 변경 없음 | Ollama 0.32.5로 qwen3:8b(2회) · qwen3:4b · A.X-4.0-Light Q4_K_M · exaone3.5:7.8b 측정 + 타임아웃 진단 런 3건. 게이트를 로컬 기준으로 낮추지 않았다 — 로컬이 얼마나 모자란지가 PIE-44의 질문이다 |
