# 위키 합성 eval

파편 노트 → 정리 글 합성([`src/llm/synthesize.ts`](../../../../src/llm/synthesize.ts))을 측정한다. 러너: `npm run eval:synthesize`

```bash
export GEMINI_API_KEY=...
npm run eval:synthesize                       # 전체 fixture (judge 포함)
npm run eval:synthesize -- --dry              # judge 생략 — 코드로 잡는 지표만
npm run eval:synthesize -- --case os-deadlock # 하나만
```

## 왜 단위 테스트가 아닌가

`synthesize.test.ts`는 요청 모양·스트리밍 delta·재시도·폴백 전환을 본다. 전부 **배관**이다. 합성의 실제 위험은 다른 데 있다.

- **환각** — 원문에 없는 용어·기제를 끌어와 그럴듯하게 붙인다. 학습 노트에서는 이게 최악이다. 사용자는 자기가 쓴 것과 모델이 보탠 것을 구별하지 못한 채 그걸 외운다.
- **누락** — 파편에 있던 사실이 정리 과정에서 조용히 빠진다.

둘 다 출력 문자열의 **내용**에 대한 판정이라 `expect().toBe()`로 쓸 수 없다.

## 판정 층

**cheap checks** (코드) — `keyPoints` 재현율, `absentFacts` 등장 여부, 헤딩 존재, 한국어 여부, 엔진 종류.

**LLM-as-judge** (Gemini, `temperature: 0`, [`scripts/evals/judge.ts`](../../../../scripts/evals/judge.ts)) — 환각과 원문 모순을 본다. 판정자가 관대해지는 것을 막는 장치 셋을 프롬프트에 박았다.

1. **근거 인용 강제** — `hallucinationEvidence` / `contradictionEvidence`에 문제 문장을 그대로 인용해야 한다. 플래그가 `false`일 때만 빈 문자열이 허용된다.
2. **의심스러우면 더 심한 쪽** — *"When in doubt, set the flag to true. A lenient auditor makes this metric useless."*
3. **재서술과 환각의 경계를 명시** — 원문을 바꿔 쓰거나 재배열하는 것은 환각이 **아니고**, 원문에 없는 기술 용어를 새로 넣는 것은 환각이다. 이 선을 안 그으면 판정자가 요약 자체를 환각으로 몰거나 반대로 다 봐준다.

`--dry`에서는 judge 지표를 아예 만들지 않는다. 러너 코어가 dry에서는 없는 지표를 건너뛰므로 거짓 경보가 나지 않는다.

### 휴리스틱 폴백은 그 자체가 회귀다

`runSynthesis`는 키가 없거나 스트림 시작 전 실패하면 **throw하지 않고** `heuristicSynthesis`의 결정적 재배열 결과를 돌려준다(`engine: "heuristic"`). 앱에서는 옳은 동작이다 — 키 없이도 뭔가는 보여줘야 한다.

**eval에서는 그게 함정이다.** 휴리스틱은 파편을 그대로 재배열하므로 `keyPointRecall`이 1.0이고 `absentFactLeak`이 0이며 헤딩도 한국어도 만족한다. 게이트를 전부 통과하면서 **모델은 한 번도 호출되지 않는다.** 그래서 `heuristicFallback`을 별도 지표로 두고 0으로 막는다. 이 게이트가 없었다면 키 없이 돌린 `--dry` 실행이 `게이트 통과 ✅`로 끝났다(실측으로 확인).

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `heuristicFallback` | 0 — 휴리스틱 폴백 채택 0건 |
| `absentFactLeak` | 0 — 원문에 없는 용어 등장 0건 |
| `notKorean` | 0 — 한국어 아님 0건 |
| `noHeading` | 0 — 헤딩 없는 출력 0건 |
| `keyPointRecall` | ≥ 0.8 — 핵심포인트 재현율 ≥ 0.8 *(잠정, baseline 측정 후 확정)* |
| `hallucination` | 0 — 환각 0건 *(잠정, baseline 측정 후 확정)* |
| `contradiction` | 0 — 원문 모순 0건 *(잠정, baseline 측정 후 확정)* |
| `judgeFail` | 0 — judge 실패 0건 |

`judgeFail`을 0으로 두는 이유: 판정이 실패하면 환각 수가 과소 집계된다. 판정 실패를 통과로 취급하면 judge를 끄는 것과 같다.

## 현재 결과 — `results/latest.json`

**미측정 — 2차.** 모델 호출이 필요하다.

배선은 확인했다. 키 없이 `npm run eval:synthesize -- --dry`를 돌리면:

```
cases 1  runFailed 0  heuristicFallback 1  keyPointRecall 1  absentFactLeak 0  noHeading 0  notKorean 0
게이트 실패: 휴리스틱 폴백 채택 0건 — 실측 1 (허용 <= 0)   →  exit 1
```

`keyPointRecall 1`이 나왔지만 그건 휴리스틱 재배열의 결과다 — 위에서 설명한 함정이 실제로 재현된 것이고, `heuristicFallback` 게이트가 그것을 잡았다.

## fixture 추가하기

`fixtures/<id>.json` 하나가 케이스 하나다.

```jsonc
{
  "id": "os-deadlock",
  "input": {                    // SynthesisInput (src/llm/synthesize.ts)
    "sourceTitle": "교착상태",
    "sourceText": "…파편 노트 원문…"
  },
  "keyPoints":   ["상호배제", "점유대기"],        // 요약이 반드시 담아야 할 원문 사실
  "absentFacts": ["세마포어", "뮤텍스"],          // 원문에 없다 — 나오면 환각
  "whyHard": "이 케이스가 어떻게 함정인가"
}
```

- `keyPoints` / `absentFacts`는 **부분 문자열 포함**으로 센다. 짧고 고유한 어휘를 고른다 — "상태" 같은 흔한 단어는 우연히 맞는다.
- `absentFacts`는 원문 주제의 **이웃 개념**으로 고른다. 교착상태 노트에 "세마포어"가 나오면 모델이 배경지식을 끌어온 것이다. 완전히 무관한 단어("바나나")를 넣으면 아무것도 잡히지 않는다.

**좋은 fixture는 파편성이 심하다.** 불릿과 반문장이 섞이고 순서가 뒤엉킨 실제 수업 메모여야 합성 능력이 드러난다. 이미 잘 정리된 글을 넣으면 모델이 복사만 해도 만점이다.
