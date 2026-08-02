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
| `boundaryF1` | ≥ 0.7 — 경계 F1 ≥ 0.7 *(잠정, baseline 측정 후 확정)* |

문장 유실을 0으로 못박은 이유: 실제로 회귀한 적이 있다 ([`src/llm/chunk.test.ts:61`](../../../../src/llm/chunk.test.ts) — 병합 청크가 전역 인덱스를 로컬 배열에 넘겨 문장을 잃었다).

## 현재 결과 — [`results/latest.json`](results/latest.json)

fixture 2종(`topic-shift`, `single-topic`), 2026-08-02 측정. 모델 호출 없음.

```
cases 2   boundaryF1 1   sentenceLoss 0   minSentencesViolation 0   runFailed 0
```

게이트 전부 통과. `topic-shift`는 주제 전환 1회를 정확히 한 번 잘랐고, `single-topic`은 유사도가 전부 같은 입력에서 경계를 만들어내지 않았다(하위 N% 임계값 비교가 strict `<`라 동률은 경계로 치지 않는다).

fixture 2건은 표본으로 작다. `boundaryF1 = 1`은 "이 두 함정을 통과했다"는 뜻이지 일반화 성능이 아니다.

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
