# 블라인드 모델 A/B 하네스 (`scripts/model-ab.ts`) 설계

날짜: 2026-07-12 · 상태: 사용자 승인 · 브랜치: `feat/model-ab-eval`

## 1. 배경과 목적

Gemini 모델은 예고 없이 단종된다 (gemini-2.5-flash → 404, 2026-07). 현재
`GEMINI_MODEL = "gemini-3.1-flash-lite"`(`src/llm/gemini.ts:28`)는 임시 선택이고,
주석에 "품질이 아쉬우면 3.5로 승격" 메모만 있다. 승격 여부를 감이 아니라
**블라인드 사람 판정**으로 결정하고, 다음 단종 때도 같은 하네스를 재실행할 수 있게 한다.

- 후보 범위: **Gemini 가족 내** (ADR-0009 단일 프로바이더 유지). 임베딩 모델 제외.
- 평가 대상: 사용자 체감 품질에 직결되는 **주요 생성 3종** — 위키 생성 · 파인만 되묻기 · PDF 한국어 요약.
- 채점 방식: **사용자 직접 블라인드 A/B** (규칙 채점은 참고 지표로만 병기).

## 2. 전체 구조

```
scripts/model-ab.ts               ← 러너. eval.ts·feynman-eval.ts 와 동형:
                                     fixtures → src/llm in-process 직호출(재구현 없음) → results
docs/30-llm/evals/model-ab/
  fixtures/pdfsummary/            ← 신규 픽스처 2개 (영어 원문 JSON)
  results/<run-id>/               ← gitignore (기존 evals/results 규약과 동일)
    report.html                   ← 판정용 자급자족 HTML — 판정은 이 파일 하나로 완결
    raw/*.json                    ← 모델별 원본 출력 + 지연 기록
```

- npm 스크립트: `"eval:ab": "tsx --env-file-if-exists=.env scripts/model-ab.ts"`.
- 키: `.env` / 환경변수의 `GEMINI_API_KEY` (CLI 규약 — 앱의 localStorage 와 별개).
- `.gitignore`에 `docs/30-llm/evals/model-ab/results/` 1줄 추가.
- **앱 코드 변경 0줄.** 모델 주입 통로는 이미 존재:
  - 위키 생성 → `GeminiProvider` `config.model` (`src/llm/gemini.ts:166`)
  - 파인만 → `probeExplanation` `deps.model` (`src/llm/feynman.ts:33`)
  - PDF 요약 → `runPdfSummary` `opts.model` (`src/llm/pdfsummary.ts:24`)

## 3. CLI 인터페이스

```
npm run eval:ab -- --list                              # GET /models 로 현재 살아있는 모델 나열
npm run eval:ab                                        # 기본 후보로 전체 실행
npm run eval:ab -- --models gemini-3.1-flash-lite,gemini-3.5-flash
npm run eval:ab -- --task pdfsummary                   # 특정 작업만 (wiki|feynman|pdfsummary)
```

기본 후보: `gemini-3.1-flash-lite`(현재) + `gemini-3.5-flash`(승격 후보).

## 4. 실행 흐름

### 4.1 가용성 프로브

후보마다 초소형 chat 호출 1회. 404(단종)·지속 503(과부하)이면 해당 모델 탈락,
사유·지연시간을 리포트에 기록. 생존 모델이 1개 이하면 A/B 무의미 — 사실만 출력하고 종료.

### 4.2 생성 단계

작업 × 케이스 × 생존 모델을 **순차 호출** (무료 티어 429 배려, 재시도는 provider 내장 로직 그대로):

| 작업 | 케이스 | 호출 경로 | 비고 |
|---|---|---|---|
| 위키 생성 | 기존 `evals/fixtures` 5개 재사용 | `generateWikiStructured` | 기존 `assertCase` 규칙 채점 결과를 참고로 병기 |
| 파인만 되묻기 | 기존 18개 중 유형 다양성 기준 6개 선별 | `probeExplanation` | fixture 의 `studentSays` 라운드 전체 대화 재생 |
| PDF 한국어 요약 | 신규 픽스처 2개 | `runPdfSummary` | 스트리밍 아닌 완료 텍스트만 수집 |

호출마다 기록: 소요 ms · 실패 여부. (재시도 횟수는 provider 내부 로직이라 앱 코드 불변 제약상 기록하지 않는다.) 케이스 단위 실패는 "모델 X 실패"로
표기하고 계속 진행 (전체 중단 없음).

### 4.3 판정 HTML

- 케이스마다 모델 출력을 **랜덤 순서 컬럼**(A/B, 3모델이면 A/B/C)으로 배치 — 위치 편향 방지.
  모델↔라벨 매핑은 HTML 내 JS에 봉인, 개봉 전까지 화면에 노출 안 함.
- 렌더링: marked + KaTeX auto-render (CDN — 로컬 파일이라 CSP 무관). PDF 요약은 렌더된
  마크다운으로, 파인만은 대화 말풍선 형태로, 위키는 concepts/relations 표로 표시.
- 케이스별 라디오: A 승 / B 승 / 무승부. (3모델이면 best-of-N 단일 선택 + 무승부.)
- 전 케이스 판정 후 **개봉** 버튼 → 작업별·전체 승수 집계 + 모델명 공개 + 프로브·생성
  단계의 지연·에러 통계 병기. **결과 저장** 버튼 → verdicts JSON 다운로드(기록용, 선택).
- 별도 CLI 집계 단계 없음 — HTML 하나로 판정 완결.

## 5. 신규 픽스처 (pdfsummary)

퍼블릭 도메인/오픈액세스 영어 학습자료에서 발췌 2개:

1. **수식 많은 텍스트** — KaTeX 변환(`$...$`, `$$...$$`)과 콜아웃 생성 품질 확인용.
2. **산문형 개념 텍스트** — 섹션 구조화·번역 어투·용어 병기(「한국어(English)」) 확인용.

스키마: `{ id, title, sourceText }`. 길이는 `SUMMARY_MAX_CHARS`(48k) 이내 — 잘림은
코드 동작이지 모델 품질이 아니므로 테스트하지 않는다.

## 6. 테스트와 통과 조건

- 블라인딩 셔플·집계·리포트 조립은 순수 함수로 분리해 유닛 테스트 (LLM 호출부는 기존
  eval 러너 규약대로 테스트 제외).
- **통과 조건**: `npm run eval:ab` 1회 실행 → `report.html`에서 3작업 합계 13케이스
  (위키 5 + 파인만 6 + 요약 2) 블라인드 판정 → 개봉 시 모델별 승수·지연 통계가 보인다.
- 최종 행동은 하네스 밖: 사용자가 리포트 보고 결정 → `gemini.ts:28` 상수 한 줄 교체.

## 7. 비범위 (non-goals)

- 타 프로바이더(OpenAI 등) 비교 — ADR-0009 유지.
- 임베딩 모델(`gemini-embedding-001`) 비교.
- classify · gaps · OCR · synthesize 등 나머지 호출 지점 (동일 모델 상수를 따라간다고 가정).
- 앱 내 UI, CI 통합, LLM-as-judge 자동 채점.
- 스트리밍 체감 속도(UX) 측정 — 완료 텍스트 품질만 본다.
