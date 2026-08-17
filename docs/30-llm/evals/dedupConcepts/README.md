# 개념 중복제거 eval

한 LLM 응답 안의 동일 개념 결합([`src/llm/dedupConcepts.ts`](../../../../src/llm/dedupConcepts.ts))을 측정한다. 러너: `npm run eval:dedupConcepts`

```bash
npm run eval:dedupConcepts                   # 전체 fixture
npm run eval:dedupConcepts -- --case pairs   # 하나만
```

순수 함수라 모델 호출이 없다 — **비용 0, 완전 결정적**이다.

## 왜 단위 테스트가 아닌가

단위 테스트는 "이 두 개가 합쳐진다"를 개별로 본다. eval은 **쌍 단위 전수 비교**를 한다 — 코퍼스의 모든 제목 쌍에 대해 "합쳐져야 하는가 / 합쳐졌는가"를 교차시켜 오병합·미병합을 센다. 정규화 규칙을 한 글자 고치면 의도한 쌍은 그대로면서 **의도하지 않은 쌍의 판정이 조용히 뒤집힌다.** 그건 케이스 단위 테스트가 못 잡는다.

## 판정 층

전부 코드다. judge 없음.

- **오병합(`falseMerge`)** — 합치면 안 될 쌍을 합쳤다. 서로 다른 개념이 한 위키 파일로 뭉개져 **사용자가 쓴 내용이 사라진다.**
- **미병합(`missedMergeRatio`)** — 합쳐야 할 쌍을 안 합쳤다. 중복 위키 파일이 생길 뿐이다.
- **본문 유실(`lostText`)** — 병합 결과 어딘가에 원본 `explanation`이 남아 있어야 한다.

### 임계값이 비대칭인 이유

두 오류의 피해가 다르다. **오병합은 데이터 손실**이고 되돌릴 수 없다 — 사용자가 서로 다른 두 개념에 쓴 메모가 한 파일에 섞이면 어느 문장이 어느 개념 것이었는지 복원할 방법이 없다. **미병합은 중복**이라 파일이 두 개 생길 뿐이고, 나중에 사람이 합치면 된다. 그래서 오병합은 `0`, 미병합은 `≤ 10%`다.

### 정규화 규칙 제약

판정 키는 `src/lib/normalizeTitle.ts`(NFC · 소문자 · 공백 전부 제거) 단일 구현을 import 한다 — PIE-64 이후 규칙 사본이 어긋나 안 접힌 변형이 저장 단계의 `slugOrHash`로 같은 경로에 쓰여 뒤가 앞을 덮는 사고를 구조적으로 막기 위해서다. 규칙 변경은 그 파일에서만 한다.

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `falseMerge` | 0 — 오병합 0건 |
| `lostText` | 0 — 병합 중 본문(`explanation`) 유실 0건 |
| `lostFields` | 0 — 병합 중 필드 유실 0건 (`examples`·`sourceEmbeds`·`sourceRefs`) |
| `missedMergeRatio` | ≤ 0.1 — 미병합 ≤ 10% |

모델을 호출하지 않아 실측이 이번에 끝났으므로 `(잠정)` 표기를 달지 않는다.

## 현재 결과 — [`results/latest.json`](results/latest.json)

fixture 1종(`pairs`, 개념 7건 → 쌍 21건), 2026-08-02 측정.

```
pairsChecked 21   falseMerge 0   lostText 0   lostFields 0   missedMergeRatio 0.25   runFailed 0
```

**게이트 실패:** `미병합 ≤ 10% — 실측 0.2500 (허용 <= 0.1)`

원인은 실측으로 확인했다. `norm`이 공백을 `" "`로 **치환**할 뿐 **제거**하지 않아 한국어 띄어쓰기 변형이 접히지 않는다.

```
mergeDuplicateConcepts 결과 제목: "Self-Attention", "Multi-Head Attention", "교착상태", "교착 상태", "기아 상태"
```

`Self-Attention` / `self-attention` / `Self-Attention ` 세 표기는 정상적으로 하나로 접혔지만, `교착상태`와 `교착 상태`는 별도 개념으로 남았다. 같은 강의에서 띄어쓰기를 다르게 적으면 위키 파일이 둘로 갈라진다는 뜻이다.

**임계값을 낮추지 않았다.** 고치려면 `norm`과 `llmApply.normalizeTitle`을 함께 바꿔야 하고, 공백을 제거하면 영어 다어절 제목(`Multi Head Attention` vs `MultiHeadAttention`)의 판정도 같이 바뀌므로 별도 검토가 필요하다.

## 적대적 검증

README의 합격선만 보고 "게이트를 전부 통과하면서 데이터를 잃는 병합"을 설계한 뒤, 병합 결과를 조작하는 mock으로 확인했다.

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| 병합은 정확히 하되 `examples`·`sourceRefs`·`sourceEmbeds`를 버림 | ❌ **통과함** — `lostText`가 `explanation`만 보므로 지표가 깨끗한 실행과 **한 글자도 다르지 않았다** | `lostFields` 지표 추가 (실측: 공격 1, 정상 0) |
| 아무것도 병합하지 않기 | ✅ `missedMergeRatio 1.0`이 잡음 | 없음 |
| 전부 하나로 병합하기 | ✅ `falseMerge`가 잡음 | 없음 |

**임계값은 낮추지 않았다.** 현재 실패 중인 `missedMergeRatio 0.25`는 그대로 뒀다 — 원인은 `norm`의 공백 처리이고, 고치려면 `llmApply.normalizeTitle`과 함께 바꿔야 한다(위 참조).

**자동으로 못 잡는 것:**

- **`summary` 유실은 지표가 없다.** `mergeConcept`은 `a.summary`가 비어 있지 않으면 `b.summary`를 **버린다**(첫 표기 유지가 의도된 설계). 현재 fixture에서도 `"중복 표기 변형"` 요약이 실제로 사라진다. 의도된 동작이라 0으로 못박는 게이트를 걸지 않았다 — 이 설계를 바꾸려면 먼저 `dedupConcepts.ts`의 의도를 다시 정해야 한다.
- 병합 후 대표 제목이 어느 표기로 정해지는지는 게이트가 보지 않는다. 사용자에게 보이는 위키 파일명이 걸린 문제인데 자동 판정 기준이 없다.
- `expectedGroups`가 전부 단독 그룹인 fixture만 넣으면 `missedMergeRatio`가 0으로 고정된다(합쳐야 할 쌍이 0건). **0건 측정하고 초록불**이 되므로 fixture에는 반드시 합쳐야 할 쌍을 넣어야 한다.

## fixture 추가하기

`fixtures/<id>.json` 하나가 코퍼스 하나다.

```jsonc
{
  "id": "pairs",
  "concepts": [
    { "title": "Self-Attention", "summary": "…", "explanation": "…" },
    { "title": "self-attention", "summary": "",  "explanation": "…" }
  ],
  "expectedGroups": [                       // 같은 그룹 = 합쳐져야 하는 제목들
    ["Self-Attention", "self-attention"],
    ["Multi-Head Attention"]                // 단독 그룹 = 아무와도 합쳐지면 안 된다
  ]
}
```

- `concepts[].title`은 `expectedGroups` 안의 문자열과 **글자 그대로** 일치해야 한다(후행 공백까지). 그룹 매칭이 제목 문자열 키로 이뤄지기 때문이다.
- `explanation`이 비어 있지 않은 항목은 `lostText` 검사 대상이 된다.

**좋은 fixture는 병합 경계에 이웃을 세운다.** 합쳐야 할 표기 변형 옆에 절대 합치면 안 되는 유사 개념을 붙여 둔다(`교착상태` 옆의 `기아 상태`). 변형만 잔뜩 넣으면 "전부 합치기"라는 자명한 오답이 만점을 받는다.

## 변경 이력

임계값·측정 범위를 바꿀 때마다 **실측 근거와 함께** 여기에 남긴다 (evals.md §11 규칙 4). 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

| 날짜 | 바꾼 것 | 근거 |
|---|---|---|
| 2026-08-02 | `lostFields` 지표 신설 | 적대적 검증에서 필드를 유실하는 병합이 전 게이트를 통과했다 |
| 2026-08-02 | 임계값 **무변경** — `missedMergeRatio ≤ 0.1` 실패(실측 0.25)를 그대로 둠 | 자가 아니라 대상의 결함이다. `norm`이 공백을 제거하지 않아 띄어쓰기 변형이 안 접힌다 |
