# 위키 병합 eval

기존 위키 본문 + 새 노트에서 추출한 같은 개념 → 한 편의 글로 통합([`src/llm/mergeWiki.ts`](../../../../src/llm/mergeWiki.ts))을 측정한다. 러너: `npm run eval:mergeWiki`

```bash
export GEMINI_API_KEY=...
npm run eval:mergeWiki                            # 전체 fixture
npm run eval:mergeWiki -- --case append-section   # 하나만
npm run eval:mergeWiki -- --dry                   # 배선만 확인
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

`lostLines`는 타협 불가다. 이 게이트가 이 eval의 존재 이유다.

## 현재 결과 — `results/latest.json`

**미측정 — 2차.** 모델 호출이 필요하다.

배선은 확인했다. 키 없이 `npm run eval:mergeWiki -- --dry`를 돌리면:

```
💥 append-section [mergeWiki] auth: GEMINI 키 없음
runFailed 1  →  게이트 실패: 실행 실패 0 — 실측 1 (허용 <= 0)  →  exit 1
```

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
  "expectHeadings": ["교착상태", "정의", "필요조건"],
  "whyHard": "이 케이스가 어떻게 함정인가"
}
```

- `mustKeepLines`는 `existing`에서 **정확히 복사**한다. 한 글자라도 다르면 정상 병합인데도 유실로 잡힌다.
- `expectHeadings`에는 **결과를 예측할 수 있는 헤딩만** 넣는다. `incoming`이 `LlmConcept`이라 새로 생길 절의 제목은 모델이 정하므로 예측할 수 없다. 반면 첫 줄 `# <title>`은 `buildMergeBody`의 시스템 프롬프트 규칙 5가 강제하므로 넣어도 된다.

**좋은 fixture는 유실 유혹을 만든다.** 기존 본문과 새 내용이 겹치는 케이스(모델이 "중복이니 하나만 남기자"고 판단할 여지), 사용자가 쓴 것처럼 보이는 개인 메모가 섞인 본문(*"시험에 나온다"* 같은 줄 — 프롬프트 규칙 3이 보호 대상으로 지정한 것), `[[위키링크]]`와 `![[임베드]]`가 박힌 본문(규칙 4가 글자 그대로 유지를 요구한다).
