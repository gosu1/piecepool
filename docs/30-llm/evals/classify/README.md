# 분류 eval

정보 유형(Node Type) 분류([`src/llm/classify.ts`](../../../../src/llm/classify.ts))의 **타입별 판별력**을 측정한다. 러너: `npm run eval:classify`

```bash
npm run eval:classify                    # 전체 fixture
npm run eval:classify -- --case corpus   # 하나만
```

휴리스틱 코어라 모델 호출이 없다 — **비용 0, 완전 결정적**이다.

## 왜 단위 테스트가 아닌가

[`src/llm/classify.test.ts`](../../../../src/llm/classify.test.ts)는 `clarity: "clear"` 항목의 **정확 일치**를 케이스별로 본다. 하나가 깨지면 그 하나가 빨개진다. 그건 회귀 탐지로는 맞지만 **분류기의 판별력**을 재지 않는다.

핵심 함정: 전체 정확도만 보면 **한 타입으로 몰아 찍어도 버틴다.** 6종이 균등하다면 전부 `concept`으로 찍어도 정확도 0.17이지만, 코퍼스가 `concept` 쪽으로 기울면 그 숫자가 올라간다. 우선순위 first-match 구조라 가드 하나가 무너지면 그 타입이 통째로 다른 타입에 흡수되는데, 전체 정확도는 그 붕괴를 몇 %p 하락으로만 보여준다. 그래서 **타입별 재현율**과 **macro-F1**을 따로 본다. macro-F1은 타입마다 같은 가중치를 주므로 소수 타입이 통째로 죽으면 즉시 떨어진다.

## 판정 층

전부 코드다. judge 없음.

- **전체 정확도 / clear 정확도** — `clarity: "clear"` 항목은 전부 맞아야 한다. `ambiguous` 항목은 전체 정확도에만 반영한다.
- **타입별 재현율·F1** — 6종(`concept` `fact` `claim` `example` `method` `question`) 각각.
- **macro-F1 / 타입별 최소 재현율** — 한 타입이 통째로 죽는 붕괴를 잡는 지표.

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `accuracy` | ≥ 0.9 — 전체 정확도 ≥ 0.9 |
| `clearAccuracy` | = 1.0 — clear 항목 정확도 = 1.0 |
| `macroF1` | ≥ 0.8 — macro-F1 ≥ 0.8 |
| `minTypeRecall` | ≥ 0.7 — 타입별 최소 재현율 ≥ 0.7 |

모델을 호출하지 않아 실측이 이번에 끝났으므로 `(잠정)` 표기를 달지 않는다.

## 현재 결과 — [`results/latest.json`](results/latest.json)

fixture 1종(`corpus`, 항목 24개), 2026-08-02 측정.

```
total 24   accuracy 1   clearAccuracy 1   macroF1 1   minTypeRecall 1   runFailed 0
recall/f1  concept 1/1   fact 1/1   claim 1/1   example 1/1   method 1/1   question 1/1
```

게이트 전부 통과.

**이 만점은 일반화 성능의 근거가 아니다.** eval 코퍼스가 `classify.test.ts`의 `CORPUS`와 **같은 표본**이고, 휴리스틱의 가드들이 바로 그 표본을 보고 합성됐다. 즉 훈련 표본 위의 점수다. 홀드아웃 표본(가드 설계에 쓰이지 않은 새 문장)을 추가하기 전까지 이 수치는 "회귀가 없다"는 뜻으로만 읽어야 한다.

## 적대적 검증

README의 합격선만 보고 "게이트를 전부 통과하면서 쓸모없는 분류기"를 설계한 뒤, 예측을 조작하는 mock을 넣어 실제 코퍼스(24항목) 위에서 확인했다.

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| `ambiguous` 5건을 전부 틀리고 `clear` 19건만 맞히기 | ✅ `accuracy 0.7917` · `minTypeRecall 0.60`이 잡음 (`clearAccuracy`는 1.0으로 통과, `macroF1 0.825`도 통과 — **이 둘만 봤으면 뚫렸다**) | 없음 |
| 소수 타입(`example` 3건)을 통째로 `concept`에 흡수 | ✅ `minTypeRecall 0` · `macroF1 0.795` · `accuracy 0.875` · `clearAccuracy 0.842` 전부 잡음 | 없음 |
| 전부 다수 타입(`concept`)으로 찍기 | ✅ `accuracy 0.208` · `macroF1 0.057`로 즉시 잡힘 | 없음 |

**게이트를 보강할 필요가 없었다.** 세 공격 모두 잡혔고, 특히 첫 공격은 `minTypeRecall`이 없었다면 `macroF1 0.825`로 통과했을 것이다 — 타입별 최소 재현율을 따로 둔 판단이 실측으로 정당화됐다.

**자동으로 못 잡는 것:**

- **eval 코퍼스 24항목이 `classify.test.ts`의 `CORPUS`와 100% 같은 표본이다**(24/24 일치 확인). 휴리스틱 가드가 바로 이 표본을 보고 합성됐으므로 이 만점은 훈련 표본 위의 점수다. **이 코퍼스에만 과적합한 변경은 어떤 게이트도 잡지 못한다.** 홀드아웃 표본을 추가하기 전까지 "회귀가 없다" 이상으로 읽으면 안 된다.
- `clarity` 라벨은 사람이 붙인다. 애매한 문장을 `clear`로 잘못 붙이면 게이트가 분류기가 아니라 라벨링 흔들림을 잡는다.

## fixture 추가하기

`fixtures/<id>.json` 하나가 코퍼스 하나다.

```jsonc
{
  "id": "corpus",
  "items": [
    { "text": "…문장…", "expected": "concept", "clarity": "clear" },
    { "text": "…문장…", "expected": "claim",   "clarity": "ambiguous" }
  ]
}
```

- `expected`는 6종 중 하나. `clarity: "clear"`는 사람이 봐도 답이 하나인 문장, `"ambiguous"`는 두 타입 사이에서 갈리는 문장이다.
- `clear`는 `clearAccuracy = 1.0` 게이트에 직결되므로 **정말 확실할 때만** 붙인다. 애매한 걸 `clear`로 붙이면 게이트가 사람 판단의 흔들림을 잡는 데 낭비된다.

**좋은 fixture는 우선순위 규칙의 경계를 찌른다.** 예시 표지("예를 들어")가 붙은 사실 문장, 정의형 어미를 가진 주장 문장, 물음표 없는 미해결 질문, 고립된 "먼저"만 있고 순서쌍이 없는 문장.

기존 코퍼스는 `classify.test.ts`와 같은 표본이므로 **새 fixture는 그 파일을 보지 말고 새로 써야** 홀드아웃이 된다.

## 변경 이력

임계값·측정 범위를 바꿀 때마다 **실측 근거와 함께** 여기에 남긴다 (evals.md §11 규칙 4). 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

| 날짜 | 바꾼 것 | 근거 |
|---|---|---|
| 2026-08-02 | 초기 게이트 확정 (`accuracy ≥ 0.9`, `macroF1 ≥ 0.8`, `minTypeRecall ≥ 0.7`) | 전체 정확도만 보면 한 타입으로 몰아 찍어도 버틴다 |
| 2026-08-02 | 임계값 **무변경** — 실측 전부 1.0 이지만 올리지 않음 | eval 코퍼스가 `classify.test.ts`의 CORPUS와 **동일 표본**이라 만점이 일반화 근거가 아니다. 홀드아웃 표본이 생기기 전에는 조이지 않는다 |
