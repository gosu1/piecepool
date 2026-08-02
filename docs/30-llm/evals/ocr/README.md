# OCR eval

이미지 → 3-block 아카이브 노트([`src/llm/ocr.ts`](../../../../src/llm/ocr.ts))의 **문자 정확도와 구조 준수**를 측정한다. 러너: `npm run eval:ocr`

```bash
export GEMINI_API_KEY=...
npm run eval:ocr                             # 전체 fixture
npm run eval:ocr -- --case printed-formula   # 하나만
npm run eval:ocr -- --dry                    # 배선만 확인
```

## 왜 단위 테스트가 아닌가

`ocr.test.ts`는 요청 모양(비전 메시지 구성)과 오프라인 폴백, 응답 파싱을 본다. **읽어낸 글자가 맞는지는 다루지 않는다.** 그건 실제 이미지와 실제 모델 없이는 잴 수 없다.

OCR 실패는 이진이 아니라 **정도**다. "O(log n)"이 "0(log n)"이 되거나 "이진"이 "이전"이 되는 것은 `toBe()`로는 그냥 실패지만, 실제로는 사용자가 고칠 수 있는 수준인지 아닌지가 갈린다. 그래서 문자 오류율(CER)로 본다.

## 판정 층

전부 코드다. judge 없음.

- **CER(문자 오류율)** — 정답 대비 편집거리 / 정답 길이. 0이면 완전 일치, 1이면 정답 길이만큼 틀렸다.
- **3-block 구조** — `buildOcrRequest`가 `## 원문` / `## 구조` / `## 요약` 세 블록을 지시한다. 헤딩이 3개 미만이면 위반이다.
- **한국어 여부** — 한국어 설정에서 영어로 답하면 위반.

### CER 정규화 규칙

`cer(reference, hypothesis)`([`scripts/evals/core.ts`](../../../../scripts/evals/core.ts))는 양쪽을 **NFC 유니코드 정규화 → 소문자 → 연속 공백 1칸 → 앞뒤 트림** 한 뒤 편집거리를 잰다.

왜 정규화하는가: 한글은 조합형(NFD)과 완성형(NFC)이 코드포인트 수준에서 다르고, macOS 파일 경유 텍스트는 NFD로 오기도 한다. 정규화 없이 재면 눈에 보이지 않는 차이가 CER을 통째로 부풀린다. 공백·대소문자도 마찬가지다 — 줄바꿈 하나 차이로 게이트가 깨지면 지표가 노이즈를 재는 것이다.

정규화하지 **않는** 것: 구두점, 수식 기호, 숫자. 이것들은 OCR이 실제로 틀리는 지점이고 사용자에게 의미가 다르다.

### 인쇄체와 손글씨 임계값이 다른 이유

같은 잣대를 쓰면 둘 중 하나가 무의미해진다. 인쇄체는 폰트가 규칙적이라 잘 하는 모델이면 거의 완벽해야 하고, 여기서 CER 0.3이 나오면 심각한 회귀다. 손글씨는 사람마다 글씨체가 달라 최선의 모델도 오독이 남는다 — 손글씨 임계값을 인쇄체 수준으로 조이면 게이트가 상시 빨개져 아무도 안 보게 된다.

그래서 `kind` 필드로 fixture를 나누고 임계값을 따로 둔다: 인쇄체 `≤ 0.15`, 손글씨 `≤ 0.30`.

### 이미지가 없으면 실행 실패다

fixture의 `imageFile` 경로에 파일이 없으면 어댑터가 **throw한다.** 조용히 건너뛰지 않는다.

이유: 건너뛰면 `cases`가 0이 되고 `cerPrinted`는 `NaN`이 되며, 게이트를 "측정 대상이 없으니 통과"로 처리하는 순간 **0건 측정하고 초록불**이 된다. 그게 지표를 무력화하는 가장 흔한 방식이다. 러너 코어는 지표가 없거나 `NaN`이면 실패로 판정하고, 이미지 부재는 그 전에 `runFailed`로 먼저 잡힌다.

`runImageOcr`에도 같은 함정이 있다. 키가 없으면 throw하지 않고 `engine: "none"` 오프라인 폴백 마크다운을 돌려주는데, 그 폴백은 **헤딩 3개짜리 한국어**라 구조·언어 게이트를 그대로 통과한다. 그래서 `offlineFallback`을 별도 지표로 두고 0으로 막는다.

## 합격선

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `runFailed` | 0 — 실행 실패 0 |
| `offlineFallback` | 0 — 오프라인 폴백 채택 0건 |
| `structureViolation` | 0 — 3-block 구조 위반 0건 |
| `notKorean` | 0 — 한국어 아님 0건 |
| `cerPrinted` | ≤ 0.15 — 인쇄체 CER ≤ 0.15 *(잠정, baseline 측정 후 확정)* |
| `cerHandwritten` | ≤ 0.30 — 손글씨 CER ≤ 0.30 *(잠정, baseline 측정 후 확정)* |

## 현재 결과 — `results/latest.json`

**미측정 — 2차.** 모델 호출과 **실제 이미지 파일**이 둘 다 필요하다.

배선은 확인했다. `npm run eval:ocr -- --dry`를 돌리면:

```
💥 printed-formula 이미지 없음: images/printed-formula.png — fixture 에 실제 이미지를 넣어야 한다
runFailed 1  →  게이트 실패: 실행 실패 0 — 실측 1 (허용 <= 0)  →  exit 1
```

### 이미지 필요 (미해결)

baseline을 재려면 아래 두 장이 저장소에 들어와야 한다. **그때까지 `npm run eval:ocr`은 항상 빨갛다.**

1. **인쇄체** — `fixtures/images/printed-formula.png`. 현재 fixture의 `groundTruth`(`"이진 탐색의 시간복잡도는 O(log n)이다. 배열이 정렬되어 있어야 한다."`)와 **글자 그대로 일치하는** 내용이어야 한다. 이미지를 먼저 만들고 거기 보이는 텍스트를 `groundTruth`에 옮겨 적는 순서가 안전하다.
2. **손글씨** — `kind: "handwritten"` fixture가 **하나도 없다.** 없으면 `cerHandwritten`이 `NaN`이 되어 게이트가 "지표 없음"으로 실패한다. 손글씨 이미지 1장과 그 fixture가 있어야 그 게이트가 의미를 갖는다.

이미지는 저작권 문제가 없는 것(직접 촬영·직접 작성)만 넣는다.

## fixture 추가하기

`fixtures/<id>.json` 하나가 케이스 하나이고, 이미지는 `fixtures/` 기준 상대 경로다.

```jsonc
{
  "id": "printed-formula",
  "imageFile": "images/printed-formula.png",   // fixtures/ 기준 상대 경로
  "kind": "printed",                            // "printed" | "handwritten" — 임계값이 갈린다
  "groundTruth": "…이미지에 보이는 텍스트 그대로…",
  "whyHard": "이 케이스가 어떻게 함정인가"
}
```

- `groundTruth`는 `## 원문` 블록에 해당하는 **본문 텍스트만** 적는다. 모델 출력에는 헤딩과 구조·요약 블록이 붙으므로 CER은 항상 0보다 크게 나온다 — 임계값이 그것을 감안한 값이다.
- `kind`를 틀리게 붙이면 임계값이 뒤바뀐다. 손글씨를 `printed`로 넣으면 게이트가 상시 실패한다.

**좋은 fixture는 문자 집합을 섞는다.** 수식 기호(`O(log n)`, `Σ`, 첨자), 한글과 영어 혼용, 표, 흐린 촬영본. 깨끗한 한글 인쇄체만 넣으면 CER이 항상 0에 붙어 회귀를 못 잡는다.
