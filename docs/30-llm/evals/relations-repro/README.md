# PIE-53 재현 표본 — 관계 정답지가 있는 유일한 코퍼스

[PIE-53](https://linear.app/piecepool/issue/PIE-53) 이 든 운영체제 동시성 텍스트를 그대로 담았다. 진단 본문은 [`../wikipedia/relations.md`](../wikipedia/relations.md) 에 있고, 여기는 입력·정답지·원자료만 둔다.

```bash
npm run wiki-exp       -- --dir docs/30-llm/evals/relations-repro          # 1라운드 투입
cp docs/30-llm/evals/relations-repro/out/rounds.json docs/30-llm/evals/relations-repro/results/run-N.json
npm run relation-score -- --dir docs/30-llm/evals/relations-repro --runs run-1,run-2,run-3,run-4,run-5
```

## 왜 이 표본만 정답지를 만들 수 있나

위키백과는 "A가 B의 부분"이라고 타입을 달아두지 않는다. 관계 정답지가 없다.

이 텍스트는 다르다. **계약 문서(`docs/10-contracts/relation-types.md` §2)가 예시로 든 관계 3건을 원문이 그대로 담고 있다.**

| 계약 §2 의 예시 | 원문 문장 |
| --- | --- |
| `Process` `contrasts` `Thread` | 이 점이 둘을 구분하는 가장 큰 차이다 |
| `Mutex` `solves` `Race Condition` | 뮤텍스는 임계 구역에 잠금을 걸어 경쟁 상태를 해결한다 |
| `Deadlock` `causes` `System Hang` | 데드락은 시스템 행을 유발한다 |

정답이 계약 문서에 적혀 있으므로 채점에 논란이 없다. 나머지 4건도 원문이 명시한 문장을 [`relation-truth.json`](relation-truth.json) 의 `basis` 에 하나씩 못박았다.

## 정답지 구성

| 필드 | 뜻 |
| --- | --- |
| `types` | 허용 타입. 여러 개면 그중 아무거나 맞으면 정답 (뮤텍스↔세마포어는 `contrasts` 도 `confused_with` 도 원문 근거가 있다) |
| `directed` | `true` 면 방향까지 맞아야 정답. `false`(대칭 관계)면 순서 무관 |
| `optional` | 원문 근거가 있어 **나와도 오답이 아니지만** 필수로 요구하지는 않는 관계. 정밀도에서는 정답으로 세고 재현율 분모에서는 뺀다 |
| `basis` | 이 판정의 근거가 된 원문 문장 |

`optional` 을 둔 이유: 「여러 스레드가 같은 자원에 동시에 접근하면 경쟁 상태가 발생한다」를 근거로 앱이 `스레드 causes 경쟁 상태` 를 만들었다. 원문의 원인은 엄밀히는 "동시 접근"이지만 이걸 오답으로 깎으면 채점이 부당해진다. 그렇다고 필수로 요구할 것도 아니다.

## 이 표본의 한계

- **문서 1장 · 관계 7건.** 표본이 작아 정밀도·재현율의 소수점은 의미가 없다. 읽어야 할 것은 "5회 내내 놓친 관계가 무엇인가"다.
- **개념 추출 정답지는 없다.** `ground-truth.json` 의 `bodyLinks` 는 위키백과 편집자가 아니라 우리가 적은 것이라, 위키백과 실험처럼 "편집자 판정"으로 읽으면 안 된다. 개념 8개는 원문이 굵게 정의한 용어를 그대로 옮긴 것이다.
- **원본 이슈와 모델이 다를 수 있다.** 2026-08-20 실측은 `gemini-3.5-flash-lite` 로 돌렸다(그날 `gemini-3.5-flash` 는 프로젝트 일일 한도 소진). 이슈 원 관측은 앱 기본 모델이다.
