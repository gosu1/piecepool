# 청킹 eval

의미 경계 분할([`src/llm/chunk.ts`](../../../../src/llm/chunk.ts))의 **경계 결정 로직**을 측정한다. 러너: `npm run eval:chunk`

```bash
npm run eval:chunk                          # 전체 fixture
npm run eval:chunk -- --case topic-shift    # 하나만
```

## 왜 단위 테스트가 아닌가

`chunk.test.ts`는 "두 개로 잘린다" 같은 **모양**을 본다. eval은 **얼마나 맞게 잘랐는가**를 본다 — 골든 경계 대비 F1이다. 임계 파라미터(`percentile`)를 바꾸면 모양은 유지되면서 정확도만 조용히 나빠질 수 있고, 그건 단위 테스트가 못 잡는다.

임베딩은 fixture에 고정 벡터로 박아 넣는다. 측정 대상은 임베딩 품질이 아니라 경계 결정이므로 모델 호출이 필요 없다 — **비용 0, 완전 결정적**이다.

## 판정 층

전부 코드다. judge 없음.

- **경계 F1** — 골든 경계와 예측 경계를 ±1문장 허용으로 매칭. 골드 하나는 예측 하나에만 매칭한다(중복 크레딧 금지).
- **문장 유실** — 청크를 이어붙인 문장열이 원본 문장열과 정확히 같아야 한다. 순서·개수 모두.
- **minSentences 위반** — 옵션보다 작은 청크가 남았는가.

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `sentenceLoss` | 0 — 문장 유실 0건 |
| `minSentencesViolation` | 0 — minSentences 위반 0건 |
| `boundaryF1` | ≥ 0.7 — 경계 F1(케이스 평균) ≥ 0.7 *(잠정, baseline 측정 후 확정)* |
| `boundaryF1Min` | ≥ 0.7 — 케이스별 최소 경계 F1 ≥ 0.7 *(잠정, baseline 측정 후 확정)* |

문장 유실을 0으로 못박은 이유: 실제로 회귀한 적이 있다 ([`src/llm/chunk.test.ts:61`](../../../../src/llm/chunk.test.ts) — 병합 청크가 전역 인덱스를 로컬 배열에 넘겨 문장을 잃었다).

## 현재 결과 — [`results/latest.json`](results/latest.json)

fixture 2종(`topic-shift`, `single-topic`), 2026-08-02 측정. 모델 호출 없음.

```
cases 2   boundaryF1 1   boundaryF1Min 1   sentenceLoss 0   minSentencesViolation 0   runFailed 0
```

게이트 전부 통과. `topic-shift`는 주제 전환 1회를 정확히 한 번 잘랐고, `single-topic`은 유사도가 전부 같은 입력에서 경계를 만들어내지 않았다(하위 N% 임계값 비교가 strict `<`라 동률은 경계로 치지 않는다).

fixture 2건은 표본으로 작다. `boundaryF1 = 1`은 "이 두 함정을 통과했다"는 뜻이지 일반화 성능이 아니다.

## 적대적 검증

README의 합격선만 보고 "게이트를 전부 통과하면서 쓸모없는 출력"을 설계한 뒤, 어댑터에 회귀를 흉내낸 mock을 넣어 확인했다.

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| 문장마다 하나씩 자르는 과분할 회귀 | ❌ **통과함** — `sentenceLoss 0`, `minSentencesViolation 0`(옵션이 `minSentences: 1`), 평균 `boundaryF1 0.75 ≥ 0.7` | `boundaryF1Min` 지표 추가 |
| 위 공격을 케이스별로 보면 | — `topic-shift`가 1.0 → **0.5로 붕괴**했는데 `single-topic`의 1.0이 평균을 끌어올려 가렸다 | 케이스별 최소값을 같은 임계값(0.7)으로 건다 |
| 절대 자르지 않기 | ✅ 평균 F1이 0.5로 떨어져 잡힘 | 없음 |
| 청크 병합 중 문장 유실 | ✅ `sentenceLoss`가 잡음 | 없음 |

**임계값은 낮추지 않았다.** 평균에 걸린 0.7을 케이스별 최소에도 그대로 걸었으므로 게이트는 엄격해지기만 했다. 보강 후 재실행: 정상 `boundaryF1Min 1` 통과, 과분할 공격 `boundaryF1Min 0.5` → `exit 1`.

**자동으로 못 잡는 것:**

- **`goldBoundaries`가 빈 케이스(`single-topic`)는 경계를 안 만들면 F1이 정의상 1.0이다.** 공짜 만점이라 평균을 부풀린다. 케이스별 최소를 보면 가려지지는 않지만, 이런 케이스만 늘리면 지표가 쉬워진다 — fixture를 추가할 때 경계가 있는 케이스를 같이 넣어야 한다.
- fixture 2건은 표본으로 작다. 경계 결정이 특정 입력에만 맞춰져도 이 두 케이스만 통과하면 초록불이다.

## fixture 추가하기

`fixtures/<id>.json` 하나가 케이스 하나다.

```jsonc
{
  "id": "topic-shift",
  "text": "…원문…",
  "vectors": [[1,0],[1,0],[0,1],[0,1]],   // splitSentences 결과 순서대로의 임베딩
  "goldBoundaries": [1],                    // 문장 1과 2 사이를 자른다
  "options": { "percentile": 50, "minSentences": 1 },
  "whyHard": "이 케이스가 어떻게 함정인가"
}
```

`vectors` 길이는 `splitSentences(text)` 결과 길이와 같아야 한다. 다르면 러너가 실행 실패로 기록한다.

**좋은 fixture는 알고리즘을 함정에 빠뜨린다.** 주제가 하나뿐인데 억지로 자르게 만드는 입력, 경계가 여러 개인 입력, 짧은 문장이 섞여 minSentences 병합이 필요한 입력.

## 변경 이력

임계값·측정 범위를 바꿀 때마다 **실측 근거와 함께** 여기에 남긴다 (evals.md §11 규칙 4). 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

| 날짜 | 바꾼 것 | 근거 |
|---|---|---|
| 2026-08-02 | `boundaryF1Min` 지표 신설 (케이스별 최솟값) | 적대적 검증에서 과분할 출력이 **평균 F1** 뒤에 숨어 통과했다. 평균은 한 케이스의 붕괴를 가린다 |
