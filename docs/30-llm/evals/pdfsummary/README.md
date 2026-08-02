# PDF 요약 eval

PDF 추출 영어 텍스트 → 한국어 번역·요약([`src/llm/pdfsummary.ts`](../../../../src/llm/pdfsummary.ts))을 측정한다. 러너: `npm run eval:pdfsummary`

```bash
export GEMINI_API_KEY=...
npm run eval:pdfsummary                          # 전체 fixture (judge 포함)
npm run eval:pdfsummary -- --dry                 # judge만 생략 — 대상 모델 호출은 나간다
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

### 이 기능만 모델이 다르다 — lite 고정

프로덕션의 PDF 요약은 `GEMINI_SUMMARY_MODEL`(`gemini-3.1-flash-lite`) **고정**이다. 다른 기능은 전부 `GEMINI_MODEL`을 쓴다 — 요약은 입력이 길고 호출이 잦아 속도·무료 티어 여유를 택한 것이다.

eval도 기본은 그 lite 모델로 잰다(`defaultModel`, [`scripts/evals/adapters/pdfsummary.ts`](../../../../scripts/evals/adapters/pdfsummary.ts)). 단 **`--model`을 주면 그 값이 우선한다** — lite 고정은 이 어댑터의 기본값일 뿐 잠금이 아니다.

```bash
npm run eval:pdfsummary                                        # gemini-3.1-flash-lite (프로덕션과 동일)
npm run eval:llm -- --adapter pdfsummary --model gemini-3.5-flash   # 상위 모델로 바꿔 비교
```

`results/latest.json`의 `model` 필드에 실제로 쓴 모델이 적힌다. 여기가 다른 baseline끼리는 점수를 비교하면 안 된다.

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
| `notKorean` | 0 — 한국어 비율 0.4 미만 0건 |
| `unexpectedTruncation` | 0 — 예상치 못한 잘림 0건 |
| `charsPerSectionMin` | ≥ 25 — 절당 본문 ≥ 25자 *(잠정, baseline 측정 후 확정)* |
| `sectionRecall` | ≥ 0.8 — 섹션 재현율 ≥ 0.8 *(잠정, baseline 측정 후 확정)* |
| `termRecall` | ≥ 0.8 — 용어 재현율 ≥ 0.8 *(잠정, baseline 측정 후 확정)* |
| `hallucination` | 0 — 환각 0건 *(잠정, baseline 측정 후 확정)* |
| `judgeFail` | 0 — judge 실패 0건 |

## 현재 결과 — `results/latest.json`

**실측 완료 — 게이트 1개 실패** (`gemini-3.1-flash-lite`, judge `gemini-3.5-flash`, 2026-08-02, fixture 1종).

| 지표 | 실측 | 허용 |
|---|---|---|
| `runFailed` | 0 | 0 |
| `sectionRecall` / `termRecall` | 1.0 / 1.0 | ≥ 0.8 |
| `absentFactLeak` | 0 | 0 |
| **`formulaBroken`** | **1** | 0 ❌ |
| `notKorean` / `unexpectedTruncation` | 0 / 0 | 0 |
| `charsPerSectionMin` | 290.3 | ≥ 40 |
| `hallucination` / `judgeFail` | 0 / 0 | 0 |

**대상 모델이 다른 기능과 다르다.** 프로덕션이 속도 때문에 `GEMINI_SUMMARY_MODEL`(lite)로 고정하고 있어 baseline도 lite로 측정됐다. `--model`을 주면 그 값이 우선하므로, 다른 기능과 같은 조건으로 비교하려면 `--model`을 명시해야 한다. 심판은 lite가 아니라 `gemini-3.5-flash` 고정이다.

`formulaBroken 1` — 원문의 `T_turnaround`가 요약에서 사라졌다. 섹션과 용어는 100% 재현했으므로 **내용을 못 읽은 게 아니라 수식 기호를 옮기지 않은 것**이다. 번역 요약에서 서술은 한국어로 바꾸되 기호는 그대로 둬야 한다는 이중 제약을 모델이 한쪽만 지켰다. lite 모델의 한계인지 프롬프트가 기호 보존을 충분히 강제하지 않는지는 **아직 안 갈랐다** — `--model`로 상위 모델을 물려 재보면 구분된다.

## 적대적 검증

README의 합격선만 보고 "게이트를 전부 통과하면서 쓸모없는 요약"을 설계한 뒤, mock `run()`으로 확인했다.

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| **용어 덤프** — 절 제목 3개를 헤딩으로 박고 `FCFS, SJF, Round Robin, T_turnaround 입니다.` 한 줄 | ❌ **통과함** — `sectionRecall 1.0` · `termRecall 1.0` · `formulaBroken 0` · `notKorean 0` · 환각 0, `게이트 통과 ✅` | `charsPerSectionMin` 지표 추가 (실측: 공격 12 / 정상 요약 51) |
| 번역하지 않고 영어 원문에 한글 한 줄만 섞기 | ❌ **통과함** — `notKorean`이 `/[가-힣]/` 존재 여부만 봤다 | 한국어 **비율** 0.4 미만 위반으로 교체 (실측: 공격 0.05 / 정상 요약 0.61) |
| 용어를 한국어로 번역해 버리기(`FCFS` → "선입선출") | ✅ `termRecall`이 잡음 | 없음 |
| 수식 기호를 문장으로 풀어 쓰기 | ✅ `formulaBroken`이 잡음 | 없음 |
| 원문에 없는 이웃 주제(교착상태) 끌어오기 | ✅ `absentFactLeak` + judge 환각이 잡음 | 없음 |

`sectionRecall`·`termRecall`이 전부 **부분 문자열 포함**이라, 절 제목과 용어를 나열하기만 해도 만점이 나온다. 재현율은 "빠뜨리지 않았는가"만 묻고 "설명했는가"를 묻지 않는다.

한국어 비율 임계값이 synthesize(0.5)보다 낮은 0.4인 이유: 이 기능은 **원문 용어와 절 제목을 영문으로 보존하는 것이 요구사항**이라 라틴 문자 비중이 구조적으로 높다. 실측한 정상 요약이 0.61이므로 0.4는 여유를 두면서 공격(0.05)을 확실히 거른다.

**자동으로 못 잡는 것:**

- **`charsPerSectionMin`은 길이의 하한일 뿐이다.** 원문을 기계 번역해 그대로 붙이면 길이도 채우고 용어·수식·한국어 비율도 만족한다 — **요약이 아니라 번역인지는 어떤 게이트도 구별하지 못한다.** 사람 표본 검수가 필요하다.
- 번역이 **틀렸는지**는 judge가 환각만 보므로 잡히지 않는다. 원문에 있는 내용을 잘못 옮긴 오역은 "원문에 없는 개념"이 아니라서 통과한다.
- baseline이 아직 없다. 위 수치는 mock으로 확인한 것이고 실제 모델 값은 **미측정**이다.

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

## 변경 이력

임계값·측정 범위를 바꿀 때마다 **실측 근거와 함께** 여기에 남긴다 (evals.md §11 규칙 4). 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

| 날짜 | 바꾼 것 | 근거 |
|---|---|---|
| 2026-08-02 | `charsPerSectionMin` 지표 신설 | 적대적 검증에서 용어만 덤프한 출력이 `sectionRecall`·`termRecall` 만점을 받았다 |
| 2026-08-02 | 임계값 **무변경** — `formulaBroken 0` 실패(실측 1)를 그대로 둠 | 섹션·용어는 100% 재현했으므로 못 읽은 게 아니라 기호를 안 옮긴 것이다. lite 모델 한계인지 프롬프트 문제인지 미분리 |
