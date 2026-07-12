# LLM 생성 언어 설정 + 용어 혼용 규칙 — 디자인 스펙

- 날짜: 2026-07-12
- 상태: 승인 대기 (브레인스토밍 세션에서 섹션별 구두 승인 완료)
- 관련 계약: `docs/10-contracts/relation-types.md`, `docs/10-contracts/llm-output-schema.md` (개정 필요 — contracts-change)

## 1. 목적

사용자가 설정에서 LLM 생성물의 언어(한국어 / English)를 선택한다. 선택한 언어로 위키·파인만 등 AI 생성 텍스트가 만들어지되, "완벽한 순수 한국어"가 아니라 **분야에서 영어로 통용되는 전문용어는 영어로 유지**하는 자연스러운 혼용 문체를 규칙으로 정의한다.

현재 상태: LLM 출력 언어는 어떤 설정값으로도 결정되지 않고 기능별 프롬프트에 분산 하드코딩되어 있다. 위키 생성(`src/llm/gemini.ts`)만 언어 지시가 전무해 입력 언어를 암묵적으로 따라간다.

## 2. 확정된 결정

| 결정 | 내용 |
| --- | --- |
| 혼용 규칙 | **도메인 관례 + 원문 존중** (아래 §4) |
| 적용 범위 | 노출 생성물 전부. **tidy는 제외** (학생 문체 보존이 기능 정체성) |
| 지원 언어 | `ko` / `en` 2개. 내부는 언어 코드로 설계해 추후 확장 열어둠 |
| 계약 처리 | 관계 explanation "한국어 1-2문장" 규정을 **언어 설정을 따르도록 개정** (contracts-change, 4역할 승인) |
| 구현 접근 | **공통 directive 모듈** (`src/llm/language.ts`)이 혼용 규칙의 SSOT |
| 설정 단위 | 전역 1개 (localStorage). 공간별 설정은 하지 않는다 (YAGNI + 계약 불변 유지) |
| 기본값 | `ko` — 기존 사용자 동작 100% 보존 |

## 3. 설정 계층

### `src/lib/settings.ts` (기존 getter/setter 패턴 그대로)

```ts
export type OutputLanguage = "ko" | "en";
export function getOutputLanguage(): OutputLanguage; // localStorage["output-language"], 무효값·부재·Node 환경 → "ko"
export function setOutputLanguage(v: OutputLanguage): void;
```

### `src/app/shell/SettingsModal.tsx`

- 항목 1개 추가: **"생성 언어"** — `한국어 / English` 버튼 토글 (기존 Fact-check·테마와 같은 `Button variant={on ? "solid" : "utility"} size="sm"` 패턴).
- 설명 한 줄: "위키·파인만 등 AI가 생성하는 글의 언어".

CLI 스크립트(`eval:feynman` 등)는 localStorage가 없으므로 자동으로 `ko` 기본값 — 기존 동작 불변.

## 4. directive 모듈 — 혼용 규칙의 SSOT

신규 파일 `src/llm/language.ts`. `languageDirective(lang: OutputLanguage): string` 하나가 프롬프트 블록을 반환한다. 규칙 튜닝은 이 파일 한 곳에서만 한다.

### `ko` 지시문 (핵심 산출물)

```
서술은 한국어로 쓴다. 용어 표기 규칙:
1. 입력 원문에 등장한 용어는 원문 표기를 그대로 따른다.
   (원문이 "mutex"면 mutex, "뮤텍스"면 뮤텍스)
2. 원문에 없는 전문용어는 해당 분야에서 영어 원어가 통용되면 영어로 쓴다
   (예: process, deadlock, gradient descent).
   한국어 용어가 표준인 것은 한국어로 쓴다 (예: 미분, 수요곡선).
3. 고유명사(알고리즘·라이브러리·인명)는 원어 표기.
4. 영어 용어에 조사는 자연스럽게 붙인다 (deadlock은, mutex를).
5. 문장 전체를 영어로 쓰지 않는다 — 영어는 용어 단위까지만.
```

### `en` 지시문

```
Write all prose in English. Use standard English technical terminology;
keep proper nouns in their original form.
```

각 기능의 build 함수는 시그니처에 `lang?: OutputLanguage`를 받고 기본값 `getOutputLanguage()` — 앱은 무인자 호출, 테스트는 명시 주입.

## 5. 기능별 적용

| 지점 | 변경 |
| --- | --- |
| 위키 `src/llm/gemini.ts` (buildMessages) | system에 directive 추가. 현재 언어 지시 전무 → 공백을 메운다. 관계 explanation도 이 프롬프트 산하라 함께 따라감 |
| 파인만 `src/llm/feynman.ts` | `"in Korean 존댓말"` → lang 분기: ko는 존댓말 유지, en은 "polite, encouraging English" |
| 간극질문 `src/llm/gaps.ts` | `"in Korean"` → directive. Liner 검색 쿼리 템플릿(`"핵심 개념 정의"`)도 en이면 영어 쿼리 |
| 핵심주제 `src/llm/coretopics.ts` | `reason` 언어만 lang 분기. system 본문은 한국어 유지(판별 품질 안 건드림). 캐시 키 `core-topics:<sourceId>`에 `:<lang>` suffix — 언어 변경 시 재판정. **⚠ 의존성**: 이 파일은 2026-07-12 현재 main 미도달 (게이트 PR #188이 `feat/feynman-sections`에 머지됨) — 게이트가 main에 올라온 뒤 **후속 PR로 분리**한다 |
| PDF 요약 `src/llm/pdfsummary.ts` | "영어→한국어"가 정체성 → "→ 설정 언어"로 일반화. en이면 번역 없이 영어 요약 노트. 병기 규칙(「한국어 번역(영어 원어)」)은 ko 전용 유지 |
| 합성 `src/llm/synthesize.ts` | 규칙 7 "본문은 한국어. 용어·식별자는 파편의 원문 표기를 따른다" → directive로 대체 (원문 표기 규칙은 directive §4-1에 포함됨) |
| OCR `src/llm/ocr.ts` | 출력 헤딩 lang 분기: `## 원문/구조/요약` ↔ `## Original/Structure/Summary`. 요약 블록 언어도 directive를 따름 |
| 휴리스틱 폴백 `src/llm/generate.ts` | 키 없는 오프라인 모드의 한국어 고정 문구("…하위 주제다. (휴리스틱)", `` `${title} 개념 정리` ``)를 2벌로 분기 |
| UI 문구 `src/app/panes/InboxSection.tsx` | "PDF를 한국어로 요약해요/요약하고 있어요" → 설정 언어명 보간 (문구 거짓말 방지) |

**스코프 밖**: UI 전체 i18n(컴포넌트의 한국어 리터럴, 날짜 `ko-KR` 로케일, 그래프 관계 라벨 `relationMeta.ts`), tidy, 임베딩·청킹·분류 등 내부 모듈.

## 6. 계약 개정 (contracts-change)

- `docs/10-contracts/relation-types.md` §4.3 및 explanation 필드 주석: "짧은 한국어 설명" → "사용자 언어 설정(ko/en)을 따르는 짧은 설명. 1-2문장."
- `docs/10-contracts/llm-output-schema.md`: `// 한국어 1-2문장` → `// 사용자 언어 설정을 따름, 1-2문장`
- PR에 `contracts-change` 라벨 + 4역할 승인 필요.

## 7. 엣지 케이스·에러 처리

- **기본값 ko**: 설정 안 만진 사용자·CLI·기존 테스트 전부 현행 동작 유지.
- **기존 콘텐츠**: 언어 변경은 이후 생성부터. 기존 위키·노트는 재생성하지 않는다.
- **알려진 한계 — 언어 혼재 병합**: 언어를 바꾼 뒤 `normalizedTitle`이 같은 개념이 병합되면 한 WikiPage에 두 언어가 섞일 수 있다. ko/en 제목은 보통 별개 normalizedTitle이라 실발생 빈도는 낮음. 자동 재작성은 하지 않는다(archive 불가침 원칙과 동일 철학).
- **coretopics 캐시**: lang을 캐시 키에 포함해 언어 전환 시 stale reason 방지. 게이트 판정 자체는 언어 무관, fail-open 유지.
- **스트리밍 3종(pdfsummary·synthesize)**: 프롬프트 조립 시점에 lang이 굳으므로 스트리밍 중 설정 변경은 다음 생성부터 반영 — 별도 처리 없음.

## 8. 테스트

- `src/llm/language.test.ts` (신규): ko directive에 원문 표기·영어 통용·조사 규칙 문구 포함, en directive에 "English" 지시 포함.
- 각 build 함수 단위 테스트: `lang: "en"` 주입 시 system에 directive 포함 + 한국어 고정 지시 부재 / `"ko"` 주입 시 현행 동작.
- `src/llm/pdfsummary.test.ts`: 기존 `toContain("한국어")` assert는 ko 케이스로 유지, en 케이스 추가.
- `settings.ts` getter/setter: 무효값 → `"ko"` 폴백.
- 실 스트리밍·실 Gemini 호출 품질(혼용 문체가 실제로 나오는지)은 수동 검증 항목.

## 9. 절차 체크리스트

- [ ] feat PR → `docs/00-overview/journey.md` 타임라인 한 줄 (journey-guard 훅이 강제)
- [ ] 설정 모달 UI 변경 → PR 본문에 Before / After 섹션 + 사용자에게 스크린샷 첨부 요청
- [ ] `contracts-change` 라벨 + 4역할 승인
- [ ] CI `docs-check` 그린 확인 후 머지
