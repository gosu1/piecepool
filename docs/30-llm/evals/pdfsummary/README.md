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

**cheap checks** (코드) — 섹션 재현율, 용어 재현율, `absentFacts` 등장, 수식 기호 보존, 한국어 여부, 잘림 플래그, `[!easy]` 콜아웃 형식 준수율, 스트리밍 지연(TTFT·완료).

**LLM-as-judge** (Gemini, `temperature: 0`, [`scripts/evals/judge.ts`](../../../../scripts/evals/judge.ts)) — 환각만 본다. 판정자 관대화 방지 장치는 합성 eval과 같다.

1. **근거 인용 강제** — `hallucinationEvidence`에 문제 문장을 인용해야 한다. `false`일 때만 빈 문자열.
2. **의심스러우면 더 심한 쪽** — *"When in doubt, set hallucination=true."*
3. **번역·압축과 환각의 경계 명시** — 번역과 요약은 환각이 **아니고**, 원문에 없는 개념을 넣는 것은 환각이다. 이 선이 없으면 판정자가 번역 전체를 "원문에 없는 문장"으로 몬다.

`--dry`에서는 judge 지표를 만들지 않는다.

### `[!easy]` 콜아웃 형식 준수율 — `calloutCompliance`

프롬프트([`src/llm/pdfsummary.ts`](../../../../src/llm/pdfsummary.ts) `SYSTEM_PROMPT` §5)는 **"모든 `##` 섹션마다 예외 없이"** 마지막에 쉬운 설명 콜아웃을 넣고 **"콜아웃의 모든 줄은 `> ` 로 시작"** 하라고 요구한다. 이건 내용 판정이 아니라 형식 판정이라 코드로 정확히 잰다 — 이 제약이 깨지면 앱에서 콜아웃이 콜아웃으로 렌더링되지 않는다(줄 하나만 인용을 벗어나도 블록이 갈라진다).

출력의 `## ` 섹션 하나가 준수로 세어지는 조건:

1. 섹션 안에 `> [!easy]` 헤더 줄이 있다.
2. 그 헤더 줄부터 **섹션 끝까지**(뒤쪽 빈 줄 제외) 모든 줄이 인용 줄이다. 콜아웃은 섹션 마지막에 오게 돼 있으므로, 도중에 인용 접두사가 끊기면 위반이다.
3. 헤더 말고 **내용이 있는 인용 줄이 최소 1줄** 있다. (`> [!easy] 쉬운 설명` 한 줄만 찍는 우회 차단)

인용 줄 = `>` 뒤에 공백 또는 줄끝. 빈 줄을 `>` 하나로만 쓰는 것은 실제 출력의 정상 형태라 허용하고, 선행 공백 3칸까지는 CommonMark가 같은 인용문으로 렌더링하므로 허용한다.

`calloutCompliance` = 전 케이스의 준수 섹션 수 / 전 케이스의 `##` 섹션 수. **출력에 `##` 섹션이 하나도 없으면 분모가 0이라 `NaN`이고, 코어 규약상 `NaN`은 통과가 아니라 게이트 실패다**(`scripts/evals/core.ts`).

### 스트리밍 지연 — `ttftMsMax` · `totalMsMax` (게이트 없음)

이 기능은 결과가 delta로 화면에 흘러나오므로 **첫 글자까지의 지연이 사용자 체감**이고 완료 시간은 별개다. 러너의 `latencyMs`는 완료 시간만 재서 둘을 못 가른다 — 그래서 어댑터가 `onDelta` 첫 호출 시각을 직접 잡는다.

**게이트를 걸지 않는다.** 지연은 하드웨어·네트워크·모델 크기에 종속이라 임계값을 하나로 정할 근거가 없다. 로컬 모델 vs Gemini를 같은 fixture로 비교하는 **기록용**이다(PIE-45 측정 항목).

평균이 아니라 **최대**를 지표로 올린다 — 스트리밍 UX에서 사용자가 겪는 것은 평균이 아니라 가장 오래 기다린 케이스다. 케이스별 값은 결과 JSON의 `samples[].out.ttftMs` / `totalMs`에 그대로 남으므로 평균이 필요하면 거기서 낸다.

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

eval은 그 플래그를 `unexpectedTruncation`으로 받아 0을 요구한다. 다만 이건 **"잘렸는가"가 아니라 "예상과 다르게 잘렸는가"** 다 — fixture의 `expectTruncated`(미지정 = `false`)와 실제 `truncated`가 다른 케이스만 센다.

- **`expectTruncated`가 없는 fixture**(대부분): 상한보다 훨씬 짧게 만들므로 `truncated`가 참이면 상한 계산이나 입력 구성이 깨진 것이다. 기존 게이트 의미(잘림 0) 그대로다.
- **`expectTruncated: true` fixture**(`long-truncated` 하나): 잘리는 것이 정상이다. 반대로 **안 잘리면** 그것이 위반이다 — `SUMMARY_MAX_CHARS`가 바뀌었거나 clip 로직이 죽은 것이므로 양방향 불일치를 다 센다.

즉 잘림 동작 자체가 이제 회귀 대상이다. 상한을 넘는 입력에서 잘림 플래그가 켜지고, 잘린 뒤 구간의 내용이 요약에 나오지 않는지를 `long-truncated` fixture가 본다(아래 `fixture 추가하기` 참조).

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `absentFactLeak` | 0 — 원문에 없는 용어 등장 0건 |
| `formulaBroken` | 0 — 수식 기호 유실 0건 |
| `notKorean` | 0 — 한국어 비율 0.4 미만 0건 |
| `unexpectedTruncation` | 0 — 예상과 다른 잘림 0건 |
| `calloutCompliance` | ≥ 1.0 — `[!easy]` 콜아웃 형식 준수율 1.0 *(잠정, baseline 측정 후 확정)* |
| `charsPerSectionMin` | ≥ 25 — 절당 본문 ≥ 25자 *(잠정, baseline 측정 후 확정)* |
| `sectionRecall` | ≥ 0.8 — 섹션 재현율 ≥ 0.8 *(잠정, baseline 측정 후 확정)* |
| `termRecall` | ≥ 0.8 — 용어 재현율 ≥ 0.8 *(잠정, baseline 측정 후 확정)* |
| `hallucination` | 0 — 환각 0건 *(잠정, baseline 측정 후 확정)* |
| `judgeFail` | 0 — judge 실패 0건 |

`ttftMsMax`(첫 delta까지) · `totalMsMax`(완료)는 **게이트가 없다** — 기록만 한다. 위 이유는 `스트리밍 지연` 절.

## 현재 결과 — `results/latest.json`

**실측 완료 — 게이트 2개 실패** (`gemini-3.1-flash-lite`, judge `gemini-3.5-flash`, `runAt 2026-08-04T12:59:04.446Z`, fixture 4종).

| 지표 | 실측 | 허용 |
|---|---|---|
| `runFailed` | 0 | 0 |
| `sectionRecall` / `termRecall` | 1.0 / 0.8235 | ≥ 0.8 |
| `absentFactLeak` | 0 | 0 |
| **`formulaBroken`** | **2** | 0 ❌ |
| `notKorean` / `unexpectedTruncation` | 0 / 0 | 0 |
| `calloutCompliance` | 1.0 | ≥ 1.0 |
| `charsPerSectionMin` | 278.7 | ≥ 25 |
| `hallucination` | 0 *(표본 0 — 아래 참조)* | 0 |
| **`judgeFail`** | **4** | 0 ❌ |
| `ttftMsMax` / `totalMsMax` | 1,060ms / 10,613ms | 게이트 없음 |

**`judgeFail 4` — 판정이 한 건도 성립하지 않았다.** 심판 모델 `gemini-3.5-flash`가 이날 내내 막혀 있었다: 처음에는 `HTTP 503 UNAVAILABLE`("high demand"), 이후에는 `HTTP 429 RESOURCE_EXHAUSTED`(`generate_content_free_tier_requests, limit: 20`). 대상 모델 `gemini-3.1-flash-lite`는 같은 키로 정상 응답했으므로 키 문제가 아니라 **심판 모델의 가용성·무료 티어 한도** 문제다. 그래서 **`hallucination 0`은 "환각이 없었다"가 아니라 "판정 표본이 0"이다** — 이 게이트는 통과로 세면 안 된다. 환각 축은 심판 한도가 풀린 뒤 재측정해야 한다.

> 운영 메모: `judge.ts`는 호출당 최대 3회 재시도한다. fixture 4종 × 재시도 3회 × 실행 5회면 무료 티어 일일 한도(20)를 한 번에 태운다. 로컬 모델 비교처럼 여러 번 돌리는 날은 심판 예산을 먼저 확인하는 편이 낫다.

**`formulaBroken 2`** — `lecture-slide`의 `T_turnaround`(2026-08-02와 같은 실패)와 `long-truncated`의 `t_{elect}`가 사라졌다. 두 케이스 모두 `sectionRecall`은 만점이라 **내용을 못 읽은 게 아니라 기호를 옮기지 않은 것**이다. 반대로 원문이 이미 KaTeX로 쓰인 `formula-heavy`(`\alpha`)와 `term-trap`(`t_{mem}`)은 보존했다 — **원문이 KaTeX면 그대로 복사하고, 평문 첨자(`T_turnaround`)면 자기 표기(`T_{turnaround}`)로 고쳐 쓴다**가 지금까지의 관찰이다.

`termRecall 0.8235`(14/17)에서 빠진 것: `formula-heavy`의 `logit`·`mini-batch`(둘 다 한국어로만 옮김), `long-truncated`의 `RPC`. 게이트(≥ 0.8)는 통과했다.

**대상 모델이 다른 기능과 다르다.** 프로덕션이 속도 때문에 `GEMINI_SUMMARY_MODEL`(lite)로 고정하고 있어 baseline도 lite로 측정됐다. `--model`을 주면 그 값이 우선하므로, 다른 기능과 같은 조건으로 비교하려면 `--model`을 명시해야 한다. 심판은 lite가 아니라 `gemini-3.5-flash` 고정이다.

## 로컬 모델 비교 (PIE-45)

"키 없이 첫 경험"이 성립하려면 이 기능이 로컬 모델로 돌아야 한다([PIE-45](https://linear.app/piecepool/issue/PIE-45)). 같은 fixture 4종·같은 프롬프트로 로컬 4모델을 재고, 프로덕션 기준선(Gemini lite)과 나란히 놓았다.

측정 조건: Ollama 0.32.5 OpenAI 호환 엔드포인트(`--base-url http://localhost:11434/v1`), `OLLAMA_CONTEXT_LENGTH=40960`(모델 상한으로 clamp), 2026-08-04. 각 모델 실행 전 이전 모델을 `ollama stop`으로 내려 VRAM을 비웠다. 숫자 출처는 실행별 `results/run-local-*.json`(gitignore 대상 — 로컬 보존).

| 모델 | 게이트 | 실패한 게이트 | `calloutCompliance` | `sectionRecall` | `termRecall` | `formulaBroken` | `ttftMsMax` | `totalMsMax` | CONTEXT |
|---|---|---|---|---|---|---|---|---|---|
| **gemini-3.1-flash-lite** (기준선) | 9/11 | `formulaBroken 2`, `judgeFail 4` | **1.0** | **1.0** | 0.8235 | 2 | **1.06s** | **10.6s** | — |
| **qwen3:8b** | 8/11 | `sectionRecall 0.6667`, `termRecall 0.7647`, `judgeFail 4` | **1.0** | 0.6667 | 0.7647 | **0** | 77.9s | **1,421.7s** | 40960 |
| **qwen3:4b** | 7/11 | `formulaBroken 2`, `sectionRecall 0.2`, `termRecall 0.5882`, `judgeFail 4` | **1.0** | 0.2 | 0.5882 | 2 | 246.0s | 293.5s | 40960 |
| **A.X-4.0-Light Q4_K_M** | 7/11 | `formulaBroken 1`, `calloutCompliance 0.1667`, `sectionRecall 0.6667`, `judgeFail 4` | 0.1667 | 0.6667 | **0.8235** | 1 | **7.0s** | **34.2s** | 16384 |
| **exaone3.5:7.8b** *(라이선스 NC — 참고 전용, 제품 후보 아님)* | 6/11 | `formulaBroken 2`, `calloutCompliance 0.0588`, `sectionRecall 0.6667`, `termRecall 0.7647`, `judgeFail 4` | 0.0588 | 0.6667 | 0.7647 | 2 | 96.2s | 155.2s | 32768 |

`judgeFail 4`는 5개 실행 전부에 공통이다 — 위 `현재 결과`의 심판 503/429 때문이고 모델 품질과 무관하다. **심판 축을 빼면 로컬 최고는 qwen3:8b(8/10)이고, 그중 실패는 재현율 2개뿐이다.** `runFailed`·`absentFactLeak`·`notKorean`·`unexpectedTruncation`·`charsPerSectionMin`은 **다섯 모델 전부 통과**했다 — 로컬 모델도 한국어로 쓰고, 원문에 없는 사실을 끌어오지 않고, 잘림 플래그를 정상 처리했다.

### 관찰

**1. qwen3 계열의 thinking이 TTFT를 지배한다.** 프로덕션 경로(`runPdfSummary`)는 `reasoning_effort`를 보내지 않으므로 기본값 그대로 측정했다. 출력 본문에 사고 과정이 섞여 나오지는 않았다(Ollama가 `reasoning_content`로 분리) — 대신 **첫 content delta가 그만큼 늦는다**: qwen3:4b 246초, qwen3:8b 78초. 같은 입력에서 A.X는 7초다. 스트리밍 UX 관점에서 사용자는 4분 동안 빈 화면을 본다. 품질을 위해 qwen3:8b를 쓴다면 thinking 표시가 필요하다(후속 이슈 감).

**2. `long-truncated`에서 qwen3:8b가 23.7분 걸렸다.** 40960 컨텍스트에서 8B q4가 VRAM에 다 안 올라가 `ollama ps` 기준 **29%/71% CPU/GPU** 분할로 돌았다. 같은 케이스가 qwen3:4b는 4.9분, A.X는 34초(100% GPU)다. 48,000자 입력은 8B/40K 조합에서 **실사용 불가 수준**이다 — 컨텍스트를 줄이거나(`chunk.ts`) 더 작은 모델을 써야 한다.

**3. A.X는 16,384 컨텍스트인데도 `HTTP 400`이 나지 않았다.** 48,000자(영어) ≈ 12K 토큰이라 상한 안에 들어갔다. 잘림 플래그도 정상(`truncated: true`, `unexpectedTruncation 0`)이고 앞부분 절 4개를 전부 재현했다. **한국어 원문이면 토큰이 늘어 같은 글자 수로도 초과할 수 있다** — 이 결론을 한국어 PDF로 옮기지 말 것.

**4. 콜아웃 형식이 로컬 모델을 가르는 지점이다.** qwen3 계열은 두 크기 모두 1.0인데, A.X는 0.1667(36섹션 중 6개), exaone3.5는 0.0588(17섹션 중 1개)이다. 실패 형태는 대부분 **콜아웃을 아예 안 쓰거나 `> ` 인용 밖으로 흘리는 것**이다. 프롬프트가 "모든 `##` 섹션마다 예외 없이"라고 못 박았는데도 지켜지지 않으므로, 이 축은 모델 선택 기준이 된다.

**5. 섹션 제목 병기는 지시가 없으면 안 한다.** `lecture-slide`에서 로컬 4모델 전부 `sectionRecall 0`이다 — `## 1. 목표`처럼 한국어로만 옮겨 `Objectives`가 사라졌다. Gemini lite만 `## 1. 목표(Objectives)`로 병기했다. 프롬프트 §2는 "한국어로 번역한 섹션 제목"만 요구하고 원어 병기를 요구하지 않으므로 **모델이 틀린 게 아니라 fixture의 기대가 프롬프트보다 강하다.** `expectSections`를 원문 영어로 잡는 방식 자체를 재검토할 것(후속).

**6. `hallucination` 축은 이번 비교에서 비어 있다.** 다섯 모델 전부 심판 실패라 환각 비교는 못 했다. 로컬 모델의 가장 큰 위험(작은 모델일수록 지어내기)이 **측정되지 않은 채 남아 있다.**

## 적대적 검증

README의 합격선만 보고 "게이트를 전부 통과하면서 쓸모없는 요약"을 설계한 뒤, mock `run()`으로 확인했다.

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| **용어 덤프** — 절 제목 3개를 헤딩으로 박고 `FCFS, SJF, Round Robin, T_turnaround 입니다.` 한 줄 | ❌ **통과함** — `sectionRecall 1.0` · `termRecall 1.0` · `formulaBroken 0` · `notKorean 0` · 환각 0, `게이트 통과 ✅` | `charsPerSectionMin` 지표 추가 (실측: 공격 12 / 정상 요약 51) |
| 번역하지 않고 영어 원문에 한글 한 줄만 섞기 | ❌ **통과함** — `notKorean`이 `/[가-힣]/` 존재 여부만 봤다 | 한국어 **비율** 0.4 미만 위반으로 교체 (실측: 공격 0.05 / 정상 요약 0.61) |
| 용어를 한국어로 번역해 버리기(`FCFS` → "선입선출") | ✅ `termRecall`이 잡음 | 없음 |
| 수식 기호를 문장으로 풀어 쓰기 | ✅ `formulaBroken`이 잡음 | 없음 |
| 원문에 없는 이웃 주제(교착상태) 끌어오기 | ✅ `absentFactLeak` + judge 환각이 잡음 | 없음 |
| **콜아웃을 아예 안 넣기** | ✅ `calloutCompliance 0` (mock 실측) | 없음 |
| **`> [!easy] 쉬운 설명` 헤더 한 줄만 찍기** | ✅ `calloutCompliance 0` — 내용 인용 줄 1줄 이상을 요구한다 (mock 실측) | 없음 |
| **콜아웃 도중 `> ` 접두사를 흘리기**(둘째 줄부터 평문) | ✅ `calloutCompliance 0` — 헤더부터 섹션 끝까지 전부 인용이어야 한다 (mock 실측) | 없음 |
| **섹션을 하나만 만들고 거기에만 콜아웃 달기** | ⚠️ `calloutCompliance 1.0` 으로 **통과** — 비율은 만든 섹션만 본다 | `sectionRecall`이 잡는다 (mock 실측: 기대 절 3개 중 1개 = 0.333 < 0.8) |
| **`##` 섹션 없이 통짜 본문**으로 분모를 0으로 만들기 | ✅ `calloutCompliance NaN` → 코어 규약상 게이트 실패 (mock 실측) | 없음 |
| **상한 초과 fixture로 `unexpectedTruncation`을 흔들기** | ✅ `expectTruncated`와 실제가 다를 때만 센다. 상한이 바뀌어 안 잘려도 위반으로 잡는다 (mock 실측: 4가지 조합 전부) | 없음 |

`sectionRecall`·`termRecall`이 전부 **부분 문자열 포함**이라, 절 제목과 용어를 나열하기만 해도 만점이 나온다. 재현율은 "빠뜨리지 않았는가"만 묻고 "설명했는가"를 묻지 않는다.

한국어 비율 임계값이 synthesize(0.5)보다 낮은 0.4인 이유: 이 기능은 **원문 용어와 절 제목을 영문으로 보존하는 것이 요구사항**이라 라틴 문자 비중이 구조적으로 높다. 실측한 정상 요약이 0.61이므로 0.4는 여유를 두면서 공격(0.05)을 확실히 거른다.

위 공격들은 전부 [`scripts/evals/adapters/pdfsummary.test.ts`](../../../../scripts/evals/adapters/pdfsummary.test.ts)에 mock 출력으로 박아 두었다 — 표의 숫자를 바꾸려면 그 테스트부터 바꿔야 한다.

**자동으로 못 잡는 것:**

- **`calloutCompliance`는 형식만 본다.** `> [!easy]` 아래에 원문 용어를 그대로 재나열해도, 중학생이 못 알아들을 말로 써도 형식만 맞으면 1.0이다. "쉬운 설명인가"는 사람이 봐야 한다.
- **`charsPerSectionMin`은 길이의 하한일 뿐이다.** 원문을 기계 번역해 그대로 붙이면 길이도 채우고 용어·수식·한국어 비율도 만족한다 — **요약이 아니라 번역인지는 어떤 게이트도 구별하지 못한다.** 사람 표본 검수가 필요하다.
- 번역이 **틀렸는지**는 judge가 환각만 보므로 잡히지 않는다. 원문에 있는 내용을 잘못 옮긴 오역은 "원문에 없는 개념"이 아니라서 통과한다.
- 위 공격 표의 수치는 mock으로 확인한 것이다. 실제 모델 baseline은 `## 현재 결과`(Gemini lite 4-fixture)와 `## 로컬 모델 비교`에 따로 있다.
- **`ttftMsMax`가 30초여도 러너는 초록이다** — 지연 게이트가 없으니, 로컬 모델을 쓸지는 기록된 값을 사람이 읽고 정해야 한다. 실제로 qwen3:4b는 첫 글자까지 246초였는데 게이트는 통과했다.

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
  "expectTruncated": false,                                    // 생략 가능(기본 false) — 아래 참조
  "whyHard": "이 케이스가 어떻게 함정인가"
}
```

- 전부 **부분 문자열 포함**으로 센다. `expectTerms`는 짧고 고유한 약어가 좋다.
- `absentFacts`는 같은 과목의 **이웃 주제**로 고른다. 스케줄링 슬라이드 요약에 "교착상태"가 나오면 모델이 교과서 지식을 끌어온 것이다.
- `expectFormula`는 기호 하나만 잡아도 된다 — 수식 전체를 넣으면 공백·줄바꿈 차이로 오탐이 난다.

- `expectTruncated`는 **입력이 `SUMMARY_MAX_CHARS`(48,000자)를 넘어 잘리는 것이 정상인 케이스**에만 `true`로 둔다. 생략하면 `false`이고, 그때는 잘리는 것 자체가 위반이다. `true`인 fixture는 **기대 절·용어·수식을 잘리지 않는 앞 48,000자 안에 전부** 넣어야 한다 — 상한 뒤 내용을 기대하면 그 케이스는 영원히 실패한다.

**좋은 fixture는 번역 유혹이 강한 용어를 담는다.** 한국어 정착 번역어가 있는 영어 약어(`FCFS` → "선입선출", `RAM` → "주기억장치"), 첨자·그리스 문자가 섞인 수식, 절 제목이 번호로만 구분된 슬라이드.

### 현재 fixture

| id | 무엇을 거는가 |
|---|---|
| `lecture-slide` | 기본 케이스. 알고리즘 약어(`FCFS`·`SJF`) 보존 + 수식 기호 `T_turnaround` |
| `formula-heavy` | 원문이 이미 KaTeX. 그리스 문자·첨자가 절마다 나온다(`\alpha`·`\beta`·`\theta`·`\sigma`·`\nabla`). 기호를 "학습률"로 풀어 쓰면 원문 대조가 깨진다 |
| `term-trap` | 한국어 정착 번역어가 있는 약어 7개(`MMU`·`TLB`·`LRU`·`FIFO`·`DMA`·`IRQ`·`ISR`). 번역어만 쓰면 슬라이드로 돌아갔을 때 대응 항목을 못 찾는다 |
| `long-truncated` | 입력 50,647자 — 상한을 넘겨 **잘림 동작 자체**를 본다. `expectTruncated: true`. 기대값은 전부 앞부분(≤ 1,300자)에 있고, 상한 뒤에는 교착상태(Coffman 조건·wait-for 그래프)만 둔다 — 요약에 그게 나오면 잘림이 안 일어났거나 모델이 교과서 지식을 끌어온 것이라 `absentFacts`가 잡는다 |

## 변경 이력

임계값·측정 범위를 바꿀 때마다 **실측 근거와 함께** 여기에 남긴다 (evals.md §11 규칙 4). 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

| 날짜 | 바꾼 것 | 근거 |
|---|---|---|
| 2026-08-02 | `charsPerSectionMin` 지표 신설 | 적대적 검증에서 용어만 덤프한 출력이 `sectionRecall`·`termRecall` 만점을 받았다 |
| 2026-08-02 | 임계값 **무변경** — `formulaBroken 0` 실패(실측 1)를 그대로 둠 | 섹션·용어는 100% 재현했으므로 못 읽은 게 아니라 기호를 안 옮긴 것이다. lite 모델 한계인지 프롬프트 문제인지 미분리 |
| 2026-08-04 | `calloutCompliance` 지표 신설 + 게이트 `≥ 1.0` (잠정) | 프롬프트가 "모든 `##` 섹션마다 예외 없이"를 요구하므로 사양상 1.0 말고 다른 값이 없다. 근거는 **당시 baseline(1-fixture) 출력 재계산 3/3 = 1.0** — 기록된 마크다운을 지표 코드로 채점했다. 그 `latest.json`은 아래 행에서 4-fixture 실측치로 교체됐고, `pdfsummary.test.ts`는 이제 "기록된 콜아웃 수치를 코드가 재현하는가"를 고정한다 |
| 2026-08-04 | `unexpectedTruncation` 의미 변경 — "잘렸는가" → "예상(`expectTruncated`)과 다르게 잘렸는가" | 상한 초과 fixture(`long-truncated`)를 넣으려면 잘림이 정상인 케이스가 생긴다. `expectTruncated` 미지정 fixture의 게이트 의미(잘림 0)는 그대로고, `true`인 fixture는 안 잘려도 위반이다. mock 실측: 4가지 조합(기대×실제) 전부 `pdfsummary.test.ts`에서 확인 |
| 2026-08-04 | `ttftMsMax`·`totalMsMax` 지표 신설, **게이트 없음** | PIE-45 측정 항목(첫 토큰까지 지연·완료 시간). 지연은 하드웨어·네트워크·모델 크기 종속이라 단일 임계값의 근거가 없다 — 로컬 vs Gemini 비교 기록용. 평균 대신 최대: 스트리밍 UX의 체감은 최악 케이스다 |
| 2026-08-04 | fixture 3종 추가(`formula-heavy`·`term-trap`·`long-truncated`) | 임계값 변경 아님. 기존 fixture가 `lecture-slide` 1종뿐이라 수식 밀집·용어 함정·상한 초과가 측정 밖이었다 |
| 2026-08-04 | `results/latest.json`을 lite 4-fixture 실측치로 교체 (`runAt 2026-08-04T12:59:04.446Z`) | 1-fixture baseline은 새 지표(`calloutCompliance`·지연)와 새 fixture를 담지 못한다. `calloutCompliance`는 이제 재계산이 아니라 실측 1.0이다. **임계값은 무변경** — `formulaBroken` 실측 2, `judgeFail` 실측 4를 실패인 채로 공개한다 |
| 2026-08-04 | 로컬 모델 4종 실측 기록(PIE-45) — 임계값 변경 없음 | Ollama 0.32.5로 exaone3.5:7.8b · qwen3:8b · qwen3:4b · A.X-4.0-Light Q4_K_M 측정. 게이트를 로컬 기준으로 낮추지 않았다 — **로컬이 얼마나 모자란지가 PIE-45의 질문이라 임계값을 건드리면 답이 사라진다** |
