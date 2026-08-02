# LLM 기능 평가지표 확장 — 설계

- 날짜: 2026-08-02
- 상태: 설계 승인됨 (구현 대기)
- 관련 SSOT: [`docs/30-llm/evals.md`](../../30-llm/evals.md), [`docs/30-llm/evals/feynman/README.md`](../../30-llm/evals/feynman/README.md)

## 1. 배경

`docs/30-llm/evals/`에 이미 세 가지가 있다.

- `fixtures/` + `expected/` — 위키 생성 골든 케이스 5종, 러너는 `scripts/eval.ts`
- `feynman/` — fixture 18종 + cheap check 2층 + LLM judge + **게이트 표 + baseline**(`results/latest.json`)

문제는 **파인만만 완성형**이라는 것이다. 위키 생성 eval은 `must`/`should`/`must_not`을 채점하지만 합격선이 문서로 정의돼 있지 않고 게이트도 없다. `chunk`·`classify`·`ocr`·`pdfsummary`·`mergeWiki`·`dedupConcepts`·`synthesize`는 vitest 단위 테스트만 있고 eval이 없다.

이 작업은 **파인만이 증명한 패턴(지표 정의 → 합격선 → 러너 → baseline)을 LLM을 쓰는 기능 전체로 복제·확장**한다. 처음부터 만드는 게 아니다.

## 2. 완료 조건과 이번 범위

원본 작업 카드의 완료 조건 세 가지 중 이번 작업이 채우는 것:

| # | 완료 조건 | 이번 범위 |
|---|---|---|
| 1 | 기능별 평가 항목과 합격선이 문서로 정의됨 | ✅ 충족 |
| 2 | 회귀 테스트로 실행 가능 — 프롬프트·모델 바꿨을 때 점수 변화가 자동으로 나옴 | ✅ 충족 (러너는 실제로 동작, mock/dry 자체검증 포함) |
| 3 | 기준선(baseline) 점수 1회 측정 완료 | ❌ **2차로 이월** |

**3번을 미루는 이유**: 실 API 호출 비용·시간이 들고, 사용자가 이번 범위를 "문서·골격"으로 한정했다. 합격선 숫자는 파인만을 제외하면 baseline 근거가 없는 잠정값이므로, README에 `(잠정, baseline 측정 후 확정)` 태그를 달고 2차에서 실측으로 고정한다.

"골격"의 정의: **러너는 실제로 돌아간다.** fixture를 읽고, 어댑터를 실행하고, 게이트를 판정하고, 결과를 기록한다. mock 러너로 자체검증까지 한다. 실 API를 때려 baseline 수치를 남기는 것만 2차다.

## 3. 아키텍처 — 공용 코어 + 기능별 어댑터

### 3.1 선택 근거

세 가지를 검토했다.

- **A. 기능별 독립 스크립트** (`scripts/chunk-eval.ts` 등 6벌) — fixture 로드·게이트·리포트·judge 호출이 6번 복붙. 직전 커밋이 "복붙 4벌 제거" 리팩터인 저장소에 역행.
- **B. 공용 코어 + 어댑터** — 채택.
- **C. 기존 `eval.ts`의 `expected` 스키마 일반화** — 청킹(경계 위치)·OCR(문자 정확도)·요약(커버리지)은 성격이 달라 `must`/`should`/`must_not`에 억지로 매핑된다. 비채택.

B를 고른 이유: 이번 작업이 골격이라 **붙일 어댑터가 8개로 확정**돼 있다. 지금 코어를 뽑는 건 투기적 추상화가 아니다.

### 3.2 구조

```
scripts/evals/
  core.ts             ← fixture 로드 · 어댑터 실행 · cheap check 집계 · judge 호출 · 게이트 판정 · latest.json 기록
  judge.ts            ← LLM-as-judge 공용 호출부 (temperature 0, 근거 인용 강제, 재시도)
  adapters/
    generate.ts       ← 기능별: fixture 타입 · 실행 함수 · 지표 추출 · 게이트 표 선언만
    synthesize.ts
    mergeWiki.ts
    dedupConcepts.ts
    chunk.ts
    classify.ts
    ocr.ts
    pdfsummary.ts
```

어댑터 인터페이스 (코어가 요구하는 계약):

```ts
interface EvalAdapter<F, O> {
  id: string;                                   // "chunk"
  fixturesDir: string;                          // docs/30-llm/evals/chunk/fixtures
  run(fixture: F): Promise<O>;                  // 실제 기능 호출 (src/llm/* 직호출, 재구현 금지)
  cheap(fixture: F, out: O): CheapFlags;        // 코드로 판정 가능한 것
  judge?(fixture: F, out: O): Promise<Verdict>; // 모델 행동 판정이 필요한 기능만
  gates: Gate[];                                // { metric, op, threshold } — 깨지면 exit 1
}
```

**설계 원칙**

- 어댑터는 `src/llm/*`를 **in-process 직호출**한다. 로직을 eval 쪽에 재구현하지 않는다 (기존 `eval.ts`가 지키는 규칙 그대로).
- 코어는 기능을 모른다. 어댑터가 선언한 지표 이름과 게이트만 본다.
- **파인만(`scripts/feynman-eval.ts`)은 건드리지 않는다.** 이미 검증된 형태라 코어 설계의 레퍼런스로만 쓴다. 회귀 위험 0. 인덱스 등록과 판정 담당 명시만 추가한다.

### 3.3 실행

```bash
npm run eval:<feature>          # 기능 하나
npm run eval:<feature> -- --dry # judge 생략, cheap check만 (싸게 스모크)
npm run eval:all                # 전체
```

**실행 위치: 로컬 스크립트만.** CI에는 올리지 않는다. API 키가 필요하고 비결정적이라 PR마다 돌리면 flaky + 비용이다. baseline은 `results/latest.json` 커밋으로 비교한다 (파인만의 현행 방식과 동일).

## 4. 기능별 지표와 합격선

파인만을 제외한 모든 임계값은 **잠정**이다. baseline 측정 후 확정한다.

| 영역 | 지표 (측정 방식) | 합격선 (게이트) |
|---|---|---|
| **위키 생성** `generate` | must.concept 재현율, 스키마 유효율, `must_not` 위반, `related_to` 비율, 관계 호환 매트릭스 위반, 지연 p50/max | must 실패 0 · 스키마 위반 0 · must_not 0 · `related_to` ≤ 30% · should 충족률 ≥ 60% |
| **위키 합성** `synthesize` | cheap: 언어·길이·헤딩 구조 / judge: 사실보존·누락·환각(근거 인용 강제) + 휴리스틱 폴백 채택 카운트 | 환각 0 · 핵심포인트 재현율 ≥ 0.8 · 폴백 채택 0 |
| **위키 병합** `mergeWiki` | 기존 문장 유실율, 중복 헤딩 수, `sourceRefs` 유실 | 기존 내용 삭제 0건 · sourceRefs 유실 0 · 중복 헤딩 0 |
| **개념 중복제거** `dedupConcepts` | 순수함수 — 병합쌍 재현율 / 오병합 정밀도 | 오병합 0 · 미병합 ≤ 10% |
| **파인만** `feynman` | 기존 그대로 (answerLeak 4단계 · judged · multiGap · cheap 5종) | 기존 표 유지 — 변경 없음 |
| **청킹** `chunk` | 경계 F1(±1문장 허용), 청크 크기 분포, 문장 유실, nodeType 태깅 정확도 | 문장 유실 0 · 경계 F1 ≥ 0.7 · `minSentences` 위반 0 |
| **분류** `classify` | 순수함수 — 타입별 confusion matrix, macro-F1 (코퍼스를 fixture로 이관) | 전체 정확도 ≥ 0.9(기존 유지) · macro-F1 ≥ 0.8 · 타입별 재현율 ≥ 0.7 |
| **OCR** `ocr` | 정규화 CER, 3-block 구조 준수, 출력 언어 준수, 수식·표 보존 | 구조 위반 0 · CER ≤ 0.15(인쇄) / ≤ 0.30(손글씨) |
| **PDF 요약** `pdfsummary` | 섹션 재현율, 환각, 콜아웃·수식 보존, `truncated` 처리, 언어 준수 | 환각 0 · 섹션 재현율 ≥ 0.8 · 수식 깨짐 0 |

`classify`와 `dedupConcepts`는 모델을 호출하지 않는 순수 함수다. 코퍼스/fixture는 `docs/30-llm/evals/<feature>/fixtures/`에 두어 확장 가능하게 하되, 러너는 모델 호출 없이 돌기 때문에 비용이 0이다.

### 4.1 "좋아졌다" 판정 금지

모든 지표는 **수치이거나 0/1 위반 카운트**다. 게이트는 `metric op threshold` 형태로만 선언한다. 자유서술 판정("품질이 개선됨", "자연스러움")은 게이트로 쓰지 않는다. LLM judge를 쓰는 경우에도 출력은 **강제 분류 라벨 + 근거 인용**이며(파인만의 `answerLeak`/`answerLeakEvidence` 방식), 라벨의 비율만 게이트가 본다.

## 5. 판정자 분리

> 평가지표를 만드는 사람과 그 지표로 판정하는 사람은 갈라야 한다. LLM Core 코드를 소유한 사람이 자기 기준으로 자기 코드를 판정하면 지표가 게이트로 기능하지 않는다.

두 층으로 구현한다.

**층 1 — 오케스트레이션 역할 분리.** 기능마다 두 에이전트를 서로 다른 인스턴스로 띄운다.

1. **작성 에이전트** — 지표·합격선·어댑터·fixture를 만든다.
2. **적대적 판정 에이전트** — 어댑터 구현을 보지 않고 README(지표·합격선)만 읽는다. 그리고 **게이트를 전부 통과하면서 실제로는 쓸모없는 출력**을 만들어 본다. 만들어지면 게이트가 헐거운 것이므로 반려하고 지표를 고친다.

게이트를 "그럴듯하다"로 승인하지 않고, **게이트가 나쁜 출력을 실제로 잡는지**로 검증한다.

**층 2 — 문서상 소유권 분리.** `docs/30-llm/evals.md`에 표를 둔다.

| 기능 | 코드 소유자 | 판정 담당 |
|---|---|---|
| … | … | *(비워둠 — 사용자가 채움)* |

에이전트는 이름을 추측해 채우지 않는다. 빈 칸과 규칙만 남긴다.

## 6. 문서 배치

- `docs/30-llm/evals.md` — 인덱스 + 공통 규칙 + 판정 담당 표. 기존 §1~§9 구조를 유지하며 확장한다.
- `docs/30-llm/evals/<feature>/README.md` — 기능별 평가 항목·합격선·fixture 규약. 파인만 README와 같은 골격을 따른다:
  1. 무엇을 왜 측정하나 (왜 단위 테스트로는 부족한가)
  2. 판정 층 (cheap checks / LLM judge)
  3. 합격선 표
  4. 현재 결과 (baseline — 2차까지는 `미측정`)
  5. fixture 추가하는 법

## 7. 디렉토리 최종 형태

```
docs/30-llm/evals/
  fixtures/ expected/          ← 기존 위키 생성 (유지)
  feynman/                     ← 기존 (유지, 인덱스 등록만)
  generate/README.md
  synthesize/{README.md,fixtures/}
  mergeWiki/{README.md,fixtures/}
  dedupConcepts/{README.md,fixtures/}
  chunk/{README.md,fixtures/}
  classify/{README.md,fixtures/}
  ocr/{README.md,fixtures/}
  pdfsummary/{README.md,fixtures/}
```

`results/run-*.json`은 `.gitignore` 대상, `latest.json`만 커밋한다 (파인만 규칙 그대로).

## 8. 검증 조건 (pass condition)

이 작업이 끝났다고 말하려면 아래가 전부 참이어야 한다.

1. `npm run eval:<feature>`가 8개 기능 각각에 대해 존재하고, mock/dry 모드에서 exit 0으로 완주한다.
2. 게이트를 일부러 깨는 mock 출력을 넣으면 러너가 `exit 1`로 죽고, 어떤 게이트가 깨졌는지 출력한다.
3. 기능마다 README에 지표 표와 합격선 표가 있고, 모든 임계값이 수치 또는 위반 카운트다.
4. `npm run check`(tsc)와 `npm run test`(vitest)가 통과한다.
5. 적대적 판정 에이전트가 각 기능에 대해 "게이트 통과 + 쓸모없음" 출력을 만들지 못했거나, 만들었다면 그에 맞춰 게이트가 조정됐다.
6. `docs/30-llm/evals.md`에 판정 담당 표가 있고 이름 칸이 비어 있다.

## 9. 범위 밖

- 실 API baseline 측정 (2차)
- CI 통합 (로컬 전용으로 확정)
- 파인만 러너 코드 변경
- `src/llm/*` 프로덕션 코드 변경 — eval이 결함을 찾더라도 이번 PR에서는 **보고만** 하고 고치지 않는다 (지표 PR과 수정 PR을 섞지 않는다)
