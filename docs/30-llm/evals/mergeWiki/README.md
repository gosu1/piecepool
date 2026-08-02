# 위키 병합 eval

기존 위키 본문 + 새 노트에서 추출한 같은 개념 → 한 편의 글로 통합([`src/llm/mergeWiki.ts`](../../../../src/llm/mergeWiki.ts))을 측정한다. 러너: `npm run eval:mergeWiki`

```bash
export GEMINI_API_KEY=...
npm run eval:mergeWiki                            # 전체 fixture
npm run eval:mergeWiki -- --case append-section   # 하나만
npm run eval:mergeWiki -- --dry                   # judge만 생략 — 대상 모델 호출은 나간다(키 필요)
```

## 왜 단위 테스트가 아닌가

`mergeWiki.ts`의 주석이 스스로 한계를 적어 놨다. **"LLM이 기존 문장을 다시 쓴다. 사용자가 위키 편집기로 직접 쓴 문단을 건드리지 말라고 프롬프트로 지시하지만, 그것은 지시일 뿐 보장이 아니다."**

지시가 지켜지는지는 코드로 증명할 수 없고 **매 호출마다 다르다.** 단위 테스트는 요청 모양과 빈 응답 방어까지만 본다. 실제로 기존 본문이 살아남았는지는 출력 문자열을 원본과 대조해야 알 수 있고, 그건 실제 호출 없이는 불가능하다.

### 기존 내용 삭제가 최악인 이유

이것은 [`docs/10-contracts/workspace-layout.md`](../../../10-contracts/workspace-layout.md)의 **archive 불변 원칙과 같은 정신**이다. 그 문서는 `archive/`를 LLM 관점에서 읽기 전용으로 못박는다 — 사용자가 쓴 원문을 LLM 출력이 덮으면 안 된다.

`wiki/`는 LLM이 쓰는 디렉토리라 그 규칙의 직접 대상은 아니다. 하지만 병합은 **이미 쌓인 위키 본문 위에 덮어쓰는** 연산이고, 그 본문에는 사용자가 편집기로 직접 넣은 문단이 섞여 있다. 병합이 한 문장을 지우면 사용자 자산이 사라지고 복구 경로가 없다. `mergeWiki.ts`가 빈 응답을 저장하는 대신 throw하는 것도 같은 이유다 — "차라리 실패시킨다".

새 내용이 안 붙는 것은 다음 import에서 다시 시도하면 된다. 지워진 문장은 돌아오지 않는다.

## 판정 층

**전부 코드다. judge 없음.** 병합의 실패 모드가 전부 문자열 대조로 잡히기 때문이다 — 유실은 `mustKeepLines`의 부분 문자열 포함으로, 중복 헤딩은 헤딩 목록의 중복으로, 구조 붕괴는 기대 헤딩 존재로 확인된다. judge를 붙이면 비용과 비결정성만 늘고 잡히는 것은 같다.

- **`lostLines`** — `mustKeepLines`의 각 줄이 병합 결과에 **글자 그대로** 남아 있는가.
- **`duplicateHeadings`** — 같은 헤딩 텍스트가 두 번 나오는가. 모델이 통합 대신 새 절을 덧붙이면 여기서 잡힌다.
- **`missingHeadings`** — `expectHeadings`가 결과 헤딩 중 하나에 포함되는가.

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `lostLines` | 0 — 기존 내용 삭제 0건 |
| `duplicateHeadings` | 0 — 중복 헤딩 0건 |
| `missingHeadings` | 0 — 기대 헤딩 누락 0건 *(잠정, baseline 측정 후 확정)* |
| `newContentMissing` | 0 — 새 내용 누락 0건 *(잠정, baseline 측정 후 확정)* |

`lostLines`는 타협 불가다. 이 게이트가 이 eval의 존재 이유다.

`newContentMissing`은 `mustAddTerms`(새 노트 쪽에서 반드시 살아남아야 할 짧은 어휘)가 결과에 있는지 센다. 유실만 재면 **아무것도 하지 않은 병합이 만점**이 되기 때문이다 — 아래 적대적 검증 참조.

## 현재 결과 — `results/latest.json`

**실측 완료 — 게이트 전부 통과** (`gemini-3.5-flash`, 2026-08-02, fixture 1종).

| 지표 | 실측 | 허용 |
|---|---|---|
| `runFailed` | 0 | 0 |
| `lostLines` | 0 | 0 |
| `duplicateHeadings` | 0 | 0 |
| `missingHeadings` | 0 | 0 |
| `newContentMissing` | 0 | 0 |

`newContentMissing`은 적대적 검증에서 **무연산 병합이 만점을 받은 뒤** 추가된 지표다(아래 절 참조). 지금 통과했다는 것은 모델이 기존 본문을 지키면서 새 내용도 실제로 넣었다는 뜻이다.

**fixture가 1건이다.** 이 기능의 최악은 사용자가 쓴 글의 소실인데, 케이스 하나로는 "안 지운다"를 주장할 수 없다. 병합 유형(절 추가·같은 절 보강·모순 내용 유입)별로 케이스가 더 필요하다.

## 적대적 검증

README의 합격선만 보고 "게이트를 전부 통과하면서 쓸모없는 병합"을 설계한 뒤, mock `run()`으로 확인했다.

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| **무연산 병합** — 기존 본문을 글자 그대로 돌려주고 새 노트 내용을 통째로 무시 | ❌ **통과함** — `lostLines 0` · `duplicateHeadings 0` · `missingHeadings 0`, `게이트 통과 ✅` **exit 0** | fixture에 `mustAddTerms` 추가 + `newContentMissing` 지표 추가 (실측: 공격 2건) |
| 기존 본문의 한 줄을 삭제 | ✅ `lostLines`가 잡음 | 없음 |
| 통합 대신 같은 헤딩으로 새 절 덧붙이기 | ✅ `duplicateHeadings`가 잡음 | 없음 |

무연산 병합이 만점을 받은 이유는 단순하다 — **모든 지표가 "잃지 않았는가"만 물었고 "얻었는가"를 묻지 않았다.** 병합은 교체가 아니라 축적이므로 양쪽을 다 봐야 한다.

**자동으로 못 잡는 것:**

- **헤딩 텍스트를 조금 바꿔 새 절을 덧붙이는 것**(`## 필요조건` 옆에 `## 발생 필요조건`)은 `duplicateHeadings`가 정확 일치로만 세므로 잡히지 않는다. 통합이 아니라 나열이어도 초록불이다.
- `mustAddTerms`는 **부분 문자열 포함**이라 새 내용이 문맥 없이 단어만 박혀 있어도 통과한다. 새 내용이 실제로 기존 글에 녹아들었는지는 사람 표본 검수가 필요하다.
- **사용자가 직접 쓴 문단의 재작성**(프롬프트 규칙 3이 금지한 것)은 `mustKeepLines`에 그 줄을 명시적으로 넣지 않는 한 잡히지 않는다. 유실이 아니라 변형이므로 글자 대조를 빠져나간다.

## fixture 추가하기

`fixtures/<id>.json` 하나가 케이스 하나다. `runWikiMerge`의 실제 시그니처가 `(existingMarkdown, concept, source, apiKey)`이므로 **`incoming`은 마크다운이 아니라 `LlmConcept`이다.**

```jsonc
{
  "id": "append-section",
  "existing": "# 교착상태\n\n## 정의\n…\n\n## 필요조건\n…",   // 이미 쌓인 위키 본문
  "incoming": {                                              // LlmConcept (src/llm/provider.ts)
    "title": "교착상태",
    "summary": "…",
    "explanation": "…",
    "examples": ["…"],
    "sourceRefs": [],
    "sourceEmbeds": []
  },
  "source": { "sourceId": "src-os-week3", "title": "운영체제 3주차" },   // MergeSource
  "mustKeepLines": ["…기존 본문의 한 줄…"],
  "mustAddTerms": ["전역 순서", "오름차순"],                  // incoming 쪽에서 반드시 살아남아야 할 어휘
  "expectHeadings": ["교착상태", "정의", "필요조건"],
  "whyHard": "이 케이스가 어떻게 함정인가"
}
```

- `mustKeepLines`는 `existing`에서 **정확히 복사**한다. 한 글자라도 다르면 정상 병합인데도 유실로 잡힌다.
- `mustAddTerms`는 `incoming`의 `explanation`/`examples`에서 **짧고 고유한 기술 용어**를 고른다. 모델이 문장을 다시 쓰더라도 유지할 어휘여야 한다 — 문장 전체를 넣으면 재서술만으로 오탐이 난다. 프롬프트 규칙 2("주어진 두 재료 안에 있는 것만 쓴다")가 이 어휘의 보존을 강제한다.
- `expectHeadings`에는 **결과를 예측할 수 있는 헤딩만** 넣는다. `incoming`이 `LlmConcept`이라 새로 생길 절의 제목은 모델이 정하므로 예측할 수 없다. 반면 첫 줄 `# <title>`은 `buildMergeBody`의 시스템 프롬프트 규칙 5가 강제하므로 넣어도 된다.

**좋은 fixture는 유실 유혹을 만든다.** 기존 본문과 새 내용이 겹치는 케이스(모델이 "중복이니 하나만 남기자"고 판단할 여지), 사용자가 쓴 것처럼 보이는 개인 메모가 섞인 본문(*"시험에 나온다"* 같은 줄 — 프롬프트 규칙 3이 보호 대상으로 지정한 것), `[[위키링크]]`와 `![[임베드]]`가 박힌 본문(규칙 4가 글자 그대로 유지를 요구한다).

## 변경 이력

임계값·측정 범위를 바꿀 때마다 **실측 근거와 함께** 여기에 남긴다 (evals.md §11 규칙 4). 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

| 날짜 | 바꾼 것 | 근거 |
|---|---|---|
| 2026-08-02 | `newContentMissing` 지표 + fixture `mustAddTerms` 신설 | 적대적 검증에서 **무연산 병합**(기존 본문 그대로 반환, 새 내용 전부 무시)이 만점을 받았다. 모든 지표가 "잃지 않았는가"만 묻고 "얻었는가"를 안 물었다 |
