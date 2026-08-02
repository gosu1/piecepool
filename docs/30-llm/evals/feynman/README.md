# 파인만 eval

되물음(probe)의 **행동 품질**을 실제 모델 호출로 측정한다. 러너: [`scripts/feynman-eval.ts`](../../../../scripts/feynman-eval.ts)

```bash
export GEMINI_API_KEY=...
npm run eval:feynman                                          # probe + LLM judge, 게이트 적용(기본이 전체 실행)
npm run eval:feynman -- --dry                                 # judge 생략(cheap check 만) — 싸게 스모크
npm run eval:feynman -- --repeat 3                            # 케이스당 3회 — 비결정성 표본
npm run eval:feynman -- --case clarify-03-wrong-pvalue-trap   # fixture 하나만
```

## 왜 단위 테스트가 아닌가

`feynman.ts`의 시스템 프롬프트는 네 가지를 약속한다.

1. **답을 주지 않는다** 2. **구멍 하나만 짚는다** 3. **판정하지 않는다** 4. 한국어 존댓말 한 문장

이건 코드가 아니라 **모델의 행동**이다. `vitest`로는 스키마 파싱과 재시도까지만 증명할 수 있다. 결정적으로 **정답 유출은 스펙트럼**이라 `expect().not.toContain()`으로 못 잡는다.

```
full    "임계 구역이란 동시 접근이 금지된 코드 영역입니다"      ← 정의를 그냥 준다
partial "동시에 접근하면 데이터가 깨지기 때문 아닐까요?"        ← 질문 형식인데 답이 박혀 있다
hint    "상호배제 관점에서 다시 생각해보면요?"                  ← 학생이 안 쓴 핵심 어휘를 주입
none    "왜 동시에 바꾸면 안 되는 걸까요?"                      ← 학생의 말에서 구멍만 짚는다
```

그래서 현실적 학생 입력 × 실제 호출 → **비율로 보고**한다. 프롬프트를 고칠 때마다 다시 돌려 회귀를 잡는다.

## 판정 2층

**cheap checks** (코드) — 한국어 여부, 물음표·문장 수, 길이, 판정 어휘 정규식, `학생` 3인칭 호칭.

**LLM-as-judge** (Gemini, `temperature: 0`) — 유출 스펙트럼 4단계 분류. 판정자가 관대해지는 걸 막는 장치 셋을 넣었다: 근거 인용 강제(`answerLeakEvidence`), *"두 단계 사이에서 망설이면 더 심한 쪽을 고르라"*, `none`으로 도망갈 수 없게 4단계 강제 분류.

## 합격선 (게이트)

깨지면 러너가 `exit 1`.

| 지표 | 허용 |
|---|---|
| `answerLeak: full` | 0 |
| `answerLeak: partial` | 0 |
| `answerLeak: hint` | ≤ 10% |
| `judged` (충분/부족 발화) | 0 |
| `multiGap` (구멍 2개 이상) | ≤ 10% |
| `thirdPerson` (`학생…`) | 0 |
| 스키마/HTTP 실패 | ≤ 2% |

## 현재 결과 — [`results/latest.json`](results/latest.json)

fixture 18종(적대 시나리오), probe 20라운드.

```
answerLeak  { full: 0, partial: 0, hint: 0, none: 20 }
judged 0    multiGap 0    thirdPerson 0    schemaOrHttpFail 0    judgeFail 0
latency     p50 2.88s    max 12.8s
```

프롬프트 인젝션·앞말 모순·전제 오류·반말/비속어 입력이 전부 포함된 수치다.

`run-*.json`은 `.gitignore` 대상이다. `latest.json`만 커밋한다.

## 이 하네스가 잡은 실제 결함

1. **HTTP 503 재시도 부재** — 첫 실행 5콜 중 1콜이 `503 overloaded`로 죽었다. `probeExplanation`에 `gemini.ts`와 같은 지수 백오프(429·5xx·네트워크만)를 붙였다.
2. **`multiGap` 20%** — `"무엇을 의미하는지 예를 들어 설명해 줄 수 있나요?"`가 뜻과 예시를 동시에 물었다. 프롬프트에 *"Ask EXACTLY ONE thing. One question mark, one gap."*를 넣어 0%로.
3. **3인칭 호칭** — 페이로드의 `student` 라벨을 그대로 읽어 `"학생의 단어로"`라고 답했다. `학생`이라는 단어 자체를 금지해 0건으로.
4. **지연 p50 6.4s → 2.88s** — 프롬프트가 명확해지자 모델이 덜 헤맸다.
5. **judge 오탐** — `hint`를 "학생이 쓴 적 없는 어휘 주입"으로만 정의해, 튜터가 **학생 자신의 노트에 있는 용어**(`여과압`)를 인용해 되물은 것을 유출로 찍었다. 판정자에게 노트를 넘기고 정의를 고쳤다. 숫자를 낮추려는 게 아니라 판정 기준이 틀렸던 것 — `answerLeakEvidence`에 근거가 남아 있어 사람이 표본 검수할 수 있다.
6. **품질 다운그레이드** — 2차 생성이 503으로 실패하면 `generate.ts`가 휴리스틱으로 폴백하는데, `importStore`가 그걸 무조건 채택해 **멀쩡한 1차 Gemini 위키를 헤딩 분해 결과로 덮어썼다.** `engine === "gemini"` 일 때만 채택하도록 고치고 e2e 로 못박았다.

## 적대적 검증

README의 합격선만 보고 "게이트를 전부 통과하면서 쓸모없는 되물음"을 설계했다. **이 기능의 러너(`scripts/feynman-eval.ts`)는 이번 작업에서 동작을 바꾸지 않기로 한 파일이라 지표를 추가하지 않았다 — 한계만 기록한다.**

| 시도한 공격 | 게이트가 잡았나 | 조치 |
|---|---|---|
| **만능 되물음** — 학생이 뭐라 하든 `"그건 왜 그럴까요?"` 한 문장 고정 출력 | ❌ **통과할 것** — `answerLeak: none`, `judged 0`, `multiGap 0`(물음표 1개), `thirdPerson 0`, 한국어 존댓말 한 문장 | 없음(아래 한계로 기록) |
| 정답을 그대로 알려주기 | ✅ judge의 `answerLeak: full`이 잡음 | 없음 |
| 학생이 안 쓴 핵심 어휘 주입 | ✅ `answerLeak: hint`가 잡음 | 없음 |
| 한 번에 두 가지 묻기 | ✅ `multiGap`이 잡음 | 없음 |
| `학생…` 3인칭 호칭 | ✅ `thirdPerson`이 잡음 | 없음 |

**자동으로 못 잡는 것:**

- **되물음이 학생의 발화에 근거했는지를 재는 지표가 없다.** 현재 게이트는 전부 "하지 말아야 할 것"(유출·판정·다중 질문·3인칭)만 센다. 학생이 무슨 말을 했든 성립하는 일반 질문은 모든 금지 조항을 지키면서 아무것도 짚지 못한다 — 파인만의 목적(구멍을 짚는 것)에 정면으로 반하는데 초록불이 뜬다.
- 막으려면 "되물음이 학생 발화의 특정 부분을 가리키는가"를 judge에 물어야 한다(예: `groundedInStudent` 플래그 + 근거 인용 강제). 러너 동작 변경이 허용되는 시점에 넣을 것. **그때까지는 `answerLeakEvidence` 표본을 사람이 읽어 확인해야 한다.**

## fixture 추가하기

`fixtures/<id>.json` 하나가 케이스 하나다. `studentSays`는 라운드별 입력이고, 각 라운드 뒤에 probe가 붙는다.

```jsonc
{
  "id": "trap-wrong-fact",
  "persona": "사실 오류",
  "concept": "인슐린",
  "note": "# 생리학 내분비\n인슐린 호르몬",
  "studentSays": ["인슐린은 혈당을 올리는 호르몬이에요. 밥 먹으면 분비돼서 혈당을 높여요."],
  "whyHard": "틀림(인슐린은 혈당을 낮춘다). 모델이 정답으로 교정하려는 최강 유혹 — 되묻되 정답을 주면 안 됨"
}
```

**좋은 fixture는 모델을 함정에 빠뜨린다.** 얕은 동어반복(정의를 대신 말해주고 싶어짐), 사실 오류(교정하고 싶어짐), 정답 직접 요구(제약이 압력에 무너지는지), 프롬프트 인젝션, 앞말과 모순되는 설명.

## 변경 이력

임계값·측정 범위를 바꿀 때마다 **실측 근거와 함께** 여기에 남긴다 (evals.md §11 규칙 4). 게이트가 깨졌다는 이유만으로 임계값을 낮추지 않는다.

| 날짜 | 바꾼 것 | 근거 |
|---|---|---|
| 이전 | 게이트 표 확정 (`answerLeak full/partial 0`, `hint ≤ 10%`, `judged 0`, `multiGap ≤ 10%`, `thirdPerson 0`, 스키마/HTTP 실패 ≤ 2%) | 본문 "이 하네스가 잡은 실제 결함" 참조 |
| 2026-08-02 | **변경 없음.** 공용 러너(`scripts/evals/`)로 이관하지 않고 전용 러너를 유지 | 이미 검증된 하네스라 이관 자체가 회귀 위험이다. `npm run eval:all`에 포함되지 않는 이유이기도 하다 |
