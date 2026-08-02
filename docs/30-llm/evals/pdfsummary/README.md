# PDF 요약 eval

PDF 추출 영어 텍스트 → 한국어 번역·요약([`src/llm/pdfsummary.ts`](../../../../src/llm/pdfsummary.ts))을 측정한다. 러너: `npm run eval:pdfsummary`

```bash
export GEMINI_API_KEY=...
npm run eval:pdfsummary                          # 전체 fixture (judge 포함)
npm run eval:pdfsummary -- --dry                 # judge 생략 — 코드로 잡는 지표만
npm run eval:pdfsummary -- --case lecture-slide  # 하나만
```

## 왜 단위 테스트가 아닌가

`pdfsummary.test.ts`는 스트리밍·재시도·`PdfSummaryStreamError` 경계를 본다. 요약 자체의 품질은 다루지 않는다.

이 기능은 **번역 + 요약을 동시에** 한다. 그래서 실패 모드가 둘 겹친다 — 번역하다 용어를 잃고, 요약하다 사실을 지어낸다. 둘 다 출력 문자열의 내용 판정이라 단위 테스트로 쓸 수 없다.

### 이중 제약: 서술은 한국어, 용어·수식은 원문

강의 슬라이드를 한국어로 요약하되 **알고리즘 이름과 수식 기호는 영문 그대로 남아야 한다.**

- `FCFS`를 "선입선출"로 번역해 버리면 사용자가 슬라이드로 돌아갔을 때 대응하는 항목을 찾지 못한다. 시험 문제도 원어로 나온다.
- `W = T_turnaround - T_burst`의 기호를 "대기시간 = 총소요시간 - 실행시간"으로 풀어 쓰면 수식이 아니라 문장이 된다. 원문 대조가 깨진다.

반대로 설명 서술이 영어로 남으면 번역을 안 한 것이다. 그래서 `termRecall`(원문 용어 보존) · `formulaBroken`(수식 기호 보존) · `notKorean`(서술 언어)을 **동시에** 건다. 하나만 보면 반대쪽으로 무너진다.

## 판정 층

**cheap checks** (코드) — 섹션 재현율, 용어 재현율, `absentFacts` 등장, 수식 기호 보존, 한국어 여부, 잘림 플래그.

**LLM-as-judge** (Gemini, `temperature: 0`, [`scripts/evals/judge.ts`](../../../../scripts/evals/judge.ts)) — 환각만 본다. 판정자 관대화 방지 장치는 합성 eval과 같다.

1. **근거 인용 강제** — `hallucinationEvidence`에 문제 문장을 인용해야 한다. `false`일 때만 빈 문자열.
2. **의심스러우면 더 심한 쪽** — *"When in doubt, set hallucination=true."*
3. **번역·압축과 환각의 경계 명시** — 번역과 요약은 환각이 **아니고**, 원문에 없는 개념을 넣는 것은 환각이다. 이 선이 없으면 판정자가 번역 전체를 "원문에 없는 문장"으로 몬다.

`--dry`에서는 judge 지표를 만들지 않는다.

### `SUMMARY_MAX_CHARS` 잘림 처리

입력 상한은 `SUMMARY_MAX_CHARS = 48000`자다. 넘으면 초과분을 잘라 보내고 **잘렸다는 사실을 모델에게 알린 뒤** 결과에 `truncated: true`를 세운다. 호출부가 사용자에게 안내하는 용도다.

eval은 그 플래그를 `unexpectedTruncation`으로 받아 0을 요구한다. fixture는 상한보다 훨씬 짧게 만드므로 **여기서 `truncated`가 참이면 상한 계산이나 입력 구성이 깨진 것**이다. 긴 PDF의 잘림 동작 자체를 재려면 상한을 넘는 전용 fixture를 따로 만들고 그때는 이 게이트의 의미를 다시 정해야 한다.

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `absentFactLeak` | 0 — 원문에 없는 용어 등장 0건 |
| `formulaBroken` | 0 — 수식 기호 유실 0건 |
| `notKorean` | 0 — 한국어 아님 0건 |
| `unexpectedTruncation` | 0 — 예상치 못한 잘림 0건 |
| `sectionRecall` | ≥ 0.8 — 섹션 재현율 ≥ 0.8 *(잠정, baseline 측정 후 확정)* |
| `termRecall` | ≥ 0.8 — 용어 재현율 ≥ 0.8 *(잠정, baseline 측정 후 확정)* |
| `hallucination` | 0 — 환각 0건 *(잠정, baseline 측정 후 확정)* |
| `judgeFail` | 0 — judge 실패 0건 |

## 현재 결과 — `results/latest.json`

**미측정 — 2차.** 모델 호출이 필요하다. 번역 기능이라 오프라인 폴백이 없어 키가 없으면 곧바로 throw한다.

배선은 확인했다. 키 없이 `npm run eval:pdfsummary -- --dry`를 돌리면:

```
💥 lecture-slide [pdfsummary] auth: GEMINI 키 없음
runFailed 1   sectionRecall 0   termRecall 0
게이트 실패: 실행 실패 0 / 섹션 재현율 ≥ 0.8 / 용어 재현율 ≥ 0.8   →  exit 1
```

## fixture 추가하기

`fixtures/<id>.json` 하나가 케이스 하나다.

```jsonc
{
  "id": "lecture-slide",
  "input": {                        // PdfSummaryInput (src/llm/pdfsummary.ts)
    "sourceTitle": "Chapter 3. Process Scheduling",
    "sourceText": "…PDF 에서 추출된 영어 원문…"
  },
  "expectSections": ["Objectives", "Algorithms", "Formula"],   // 요약이 다뤄야 할 절
  "expectTerms":    ["FCFS", "SJF", "Round Robin"],            // 번역하면 안 되는 원문 용어
  "absentFacts":    ["교착상태", "페이지 폴트"],                // 원문에 없다 — 나오면 환각
  "expectFormula":  "T_turnaround",                            // 보존돼야 할 수식 기호
  "whyHard": "이 케이스가 어떻게 함정인가"
}
```

- 전부 **부분 문자열 포함**으로 센다. `expectTerms`는 짧고 고유한 약어가 좋다.
- `absentFacts`는 같은 과목의 **이웃 주제**로 고른다. 스케줄링 슬라이드 요약에 "교착상태"가 나오면 모델이 교과서 지식을 끌어온 것이다.
- `expectFormula`는 기호 하나만 잡아도 된다 — 수식 전체를 넣으면 공백·줄바꿈 차이로 오탐이 난다.

**좋은 fixture는 번역 유혹이 강한 용어를 담는다.** 한국어 정착 번역어가 있는 영어 약어(`FCFS` → "선입선출", `RAM` → "주기억장치"), 첨자·그리스 문자가 섞인 수식, 절 제목이 번호로만 구분된 슬라이드.
