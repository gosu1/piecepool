# 파인만 — 위키 전용으로 이전 · 설계

- 날짜: 2026-07-17
- 대상: `src/lib/feynmanSection.ts`(신규) · `src/store/feynmanStore.ts` · `src/app/panes/FeynmanPanel.tsx` · `src/app/PiecePoolApp.tsx` · `src/lib/llmApply.ts` · `src/lib/noteSections.ts` · `src/app/panes/InboxSection.tsx` · `src/app/panes/DocView.tsx`
- 선행 설계: [2026-07-10-feynman-clarify-design.md](./2026-07-10-feynman-clarify-design.md) — 철학(IOED·판정 금지·사용자 선언)은 전부 계승한다. 대상 단위만 뒤집는다.
- 계약 변경: **없음.** 새 엔티티 0, 새 파일 레이아웃 0, Rust 변경 0.

## 배경 / 문제

파인만은 지금 **사용자 노트**에 붙어 있다. `useFeynmanEditor.tsx` 가 헤딩·드래그 선택으로 `##`/`###` 섹션을 잘라 주제로 만들고(`noteSections.ts:127`), 사용자가 설명하면 그 기록이 위키 **생성 입력에 덧대어진다**(`importStore.ts:73-80` `feynmanTranscript` → `:203` `input.sourceText +=`).

이 배치가 목적과 어긋난다.

1. **노트는 학습자가 이미 쓴 글이다.** 자기가 쓴 필기를 자기가 설명하는 건 IOED를 깨는 힘이 약하다. 정작 학습자가 만들지 않은 것 — LLM이 생성한 위키 개념 — 은 검증 없이 통과한다.
2. **노트 헤딩은 개념 경계가 아니다.** `##`/`###` 은 필기 구조지 개념 구조가 아니다. 위키는 `개념 1개 = WikiPage 1개`(`entities.md:157`)라 경계가 이미 정확하다.
3. **순서가 거꾸로다.** 위키를 만들기 **전에** 설명시키고 있다. 학습자가 이해해야 할 대상은 만들어**진** 위키다.

핵심 문장:

> 위키 개념은 학습자가 만든 것이 아니다. 그러므로 학습자가 완전히 이해하고 넘어갔는지를, 그가 이해했다고 **선언한 시점의 사고 과정**과 함께 남겨야 한다.

## 목표 (성공 기준)

- 파인만의 대상은 **위키 페이지 통째**다. 페이지 1개 = 주제 1개.
- 기록(사용자 설명 + LLM 되물음 + 판정)이 **위키 `.md` 파일 안에** 남아 나중에 복기된다.
- 위키가 재생성·병합돼도 기록은 **코드로** 보존된다. 프롬프트 지시에 기대지 않는다.
- 노트 파인만은 완전히 사라진다.
- 계약 변경 0 · Rust 변경 0.

## 범위 밖 (Non-goals)

- **게이트.** "이해할 때까지 다음으로 못 넘어감" 같은 잠금은 만들지 않는다. 기록이 목적이지 통제가 아니다. (`feynmanStore.ts:195` `getSectionStatus` 는 "게이트가 조회하는 공개 인터페이스"라 주석돼 있으나 프로덕션 호출자가 없다 — 이번에 삭제한다.)
- **`review_needed` 연동.** 선행 설계(§2)가 `mark_review_needed` 커맨드를 만들었고 `graph.rs:305` 에 문구까지 있으나 호출자가 없다. 이번 범위에서 되살리지 않는다. 별도 PR.
- **AI 이해도 채점.** 선행 설계 §64와 동일하게 금지. 판정은 사용자만 한다.
- **노트 편집으로 위키 업데이트.** 후속 작업으로 남긴다.
- **`provider.ts:16` `features.clarify` 제거.** 이미 완전 데드지만 docs SSOT 동시 수정이 필요해 이번 범위 밖. 보고만 한다.

## 설계

### 1. 저장 — 위키 `.md` 본문의 `## 파인만 기록` 섹션

frontmatter 가 아니라 **본문**이다. 이유:

`wiki_to_md`(`frontmatter.rs:344`)는 frontmatter 를 통째로 재작성하므로, frontmatter 에 넣으려면 Rust `WikiPage` struct + `entities.md` + `markdown-frontmatter.md` 를 전부 고쳐야 한다(4명 승인 PR). 게다가 자체 YAML 파서가 자유 텍스트를 못 버틴다 — `yq`(`frontmatter.rs:252`)는 `\` 와 `"` 만 이스케이프하고 **개행은 안 하며**, `unquote`(`:157`)는 따옴표만 벗기고 **언이스케이프를 안 한다**. 파인만 기록은 여러 줄 + 따옴표 범벅이라 확정적으로 깨진다.

본문 섹션에는 선례가 있다 — `## 근거` 섹션이 정확히 같은 패턴이고 `stripEvidenceSection`(`noteSections.ts:170`)이 표시에서만 걷어낸다.

#### 포맷

```markdown
## 파인만 기록

### 2026-07-16T12:03:11.123Z · 이해함 · a1b2c3d4

**나:**

> 스레드는 프로세스 안에서 메모리를 공유하는 실행 단위고...

**되묻기:**

> 메모리를 공유한다고 하셨는데, 스택도 공유되나요?

**나:**

> 아, 스택은 따로일 것 같아요...

### 2026-04-02T09:11:02.000Z · 아직 모름 · 9f8e7d6c

**나:**

> ...
```

- 세션 헤더: `### <ISO> · <판정> · <bodyHash>`. 최신 세션이 위.
- 판정: `이해함` | `아직 모름`
- 화자 마커(`**나:**` / `**되묻기:**`)는 **인용 밖**, 발화 내용은 **전부 인용 안**.

**왜 마커를 인용 밖에 두는가** — 이것이 이스케이프를 통째로 없앤다. 발화의 모든 줄에 `> ` 가 붙으므로 사용자는 **인용 안 붙은 줄을 만들 수 없다**. 따라서 화자 경계는 위조 불가능하다. 사용자가 `**나:**` 라고 써도 `> **나:**` 로 저장되어 경계와 겹치지 않는다.

| 사용자 입력 | 저장 | 복원 |
|---|---|---|
| `**나:** 안녕` | `> **나:** 안녕` | 정확 |
| `> 교수님 말씀` | `> > 교수님 말씀` | 정확 (`/^> ?/` 로 **한 단계만** 벗김) |
| 빈 줄 | `>` (후행 공백 없음) | 정확 |
| `### 2026-01-01T00:00:00Z · 이해함 · deadbeef` | `> ### 2026-...` | 정확 (세션 위조 불가) |

발화 사이 경계를 공백에 의존하지 않는다. `> A\n>\n> B` (발화 2개) 와 `> A\n> \n> B` (빈 줄 포함 발화 1개) 는 후행 공백 하나만 다르고 포매터가 그걸 지우면 구분이 사라진다 — 마커가 이 문제를 원천 제거한다.

### 2. 신규 모듈 — `src/lib/feynmanSection.ts`

순수 함수만. IPC·store 의존 없음.

```ts
export interface FeynmanTurn { role: "user" | "probe"; text: string }
export interface FeynmanSession {
  at: string;                        // ISO
  verdict: "understood" | "not_yet";
  bodyHash: string;                  // 기록 제외 본문의 해시 (8자)
  turns: FeynmanTurn[];
}

/** 본문과 기록을 분리. 기록 없으면 sessions: []. */
export function splitFeynmanSection(md: string): { body: string; sessions: FeynmanSession[] };

/** 본문 + 기록 → md. sessions 비면 섹션을 안 만든다. */
export function joinFeynmanSection(body: string, sessions: FeynmanSession[]): string;

/** 표시·LLM 입력용. splitFeynmanSection(md).body 와 동일. */
export function stripFeynmanSection(md: string): string;

/** 기록 제외 본문의 해시. 배지 판정용. */
export function bodyHash(md: string): string;
```

**펜스 인식 필수.** `md.indexOf("## 파인만 기록")` 같은 소박한 구현은 본문 코드펜스 안에 그 문자열이 있으면 본문을 통째로 자른다(재현 확인됨). `scanHeadings`(`noteSections.ts:58`)가 이미 펜스를 토글 처리하므로(`:70` `if (FENCE.test(text)) fenced = !fenced;`) 그걸 **export 해서 공유한다.** 복붙 금지.

**fail-closed.** 헤더 파싱 실패·판정 문자열 미상·`bodyHash` 누락 → 그 세션을 버리지 말고 **원문 보존**을 우선한다. 파싱 못 한 기록 섹션은 그대로 두고 UI에서만 "읽을 수 없는 기록" 으로 표시한다. 사용자 데이터를 조용히 삭제하지 않는다.

### 3. 배지 — 본문 해시. `updatedAt` 이 아니다

**`updatedAt` 비교는 성립하지 않는다.** `commands/wiki.rs:70` 이 조건 없이 `page.updated_at = storage::now_iso()` 를 한다 (`created_at` 은 `:67` 에 `is_empty()` 가드가 있으나 `updated_at` 은 무조건). 파인만 기록을 저장하는 행위 자체가 `ipc.saveWiki` 를 타므로 `updatedAt` 이 항상 세션 시각 뒤로 밀린다 → 저장 직후 배지 100% 점등. 레이스가 아니라 결정적이다.

포맷까지 어긋나 있다. Rust `now_iso()`(`storage/mod.rs:261`)는 `2026-07-16T12:34:56Z`(초 단위), TS `toISOString()` 은 `...:56.789Z`(밀리초). 사전식 비교 시 20번째 문자에서 `.`(0x2E) < `Z`(0x5A) → **같은 초여도 세션이 항상 작다.** 시계 운으로도 못 피한다.

프론트가 보낸 `updatedAt` 은 전부 무시된다(`llmApply.ts:223` `updatedAt: now` 도 실은 죽은 값). "저장 시 updatedAt 유지" 는 Rust 를 고쳐야 하므로 계약 전제와 충돌한다.

**따라서:**

```
배지 = session.bodyHash !== bodyHash(page.markdown)
```

- `updatedAt` 과 완전히 무관 → Rust/계약 변경 없음이 지켜진다.
- 기록을 **strip 한 뒤** 해시하므로 세션 append 가 해시를 안 바꾼다 → 자기 자극 없음.
- 제목 변경(`rename_wiki`)·과목 토글(`PiecePoolApp.tsx:765`) 같은 본문 무관 변경에 안 켜진다 — `updatedAt` 방식은 이것도 오탐한다.
- "이 설명 이후 문서가 바뀌었나" 라는 질문에 직접 답한다. 파일이 저장됐는지가 아니라.

해시는 djb2 8자. `llmApply.ts:20-25` `hash8` 이 있으나 `normalizeTitle` 을 먹이므로 그대로 쓰면 안 된다 — djb2 루프만 `feynmanSection.ts` 로 가져온다.

`bodyHash` 없는 세션(손편집·구버전)은 배지 판정을 건너뛴다(fail-open). 시각은 표시용으로만 남는다.

### 4. strip 지점 — 전수

이 설계의 급소다. 기록이 본문에 살기 때문에 본문을 만지는 모든 경로가 대상이다.

| # | 지점 | 무엇이 깨지나 | 조치 |
|---|---|---|---|
| 1 | `llmApply.ts:174` merge | 기존 본문 통째가 LLM 입력(`mergeWiki.ts:59` `[기존 위키 본문]`)이 되고, 출력이 본문을 통째 교체 → **기록 소실 + 사용자 발화 전송** | `mergeMarkdown()` 래퍼(`:171-180`) 안에서 strip → 호출 → **성공 분기(`:175`)에서만** 재부착 |
| 2 | `llmApply.ts:111` 정리글 | 기존 본문을 **읽지도 않고** 폐기 → 기록 100% 소실 | `ex`(`:90`)에서 기록을 꺼내 `markdown` 에 덧붙임 |
| 3 | `feynmanStore` → `probeExplanation` 의 `note` | 이전 세션 발화가 `note`(`feynman.ts:119`)와 `conversation`(`:121`)에 **이중 노출**. 판정 문자열(`이해함`)이 재료로 들어가 `feynman.ts:67` "판정 금지" 를 흔들고, 과거의 옳은 설명이 `note` 에 있으면 되물음이 그걸 인용 = **답 누출**(`:60` 위반) | 호출부에서 strip. `feynman.ts` 안에서 자르지 않는다 — 거긴 위키를 모르는 순수 LLM 어댑터다 |
| 4 | `DocView.tsx:95` 읽기 표시 | 기록 원문이 본문에 날것으로 찍혀 패널과 **이중 노출** | `stripFeynmanSection(stripEvidenceSection(savedMd))` |
| 5 | `InboxSection.tsx:809` 참조 패널 | 동일 | 동일 |
| 6 | `PiecePoolApp.tsx:723`·`:936`·`:732` 편집 왕복 | draft 는 편집 진입 시 스냅샷(`:723`). 편집 중 패널에서 세션을 끝내면 저장(`:946`→`:732`)이 **그 세션을 날린다** | §5 |

**1번의 함정**: fallback 두 경로(`:172` 미주입 → `return ex.markdown`, `:177-178` 실패 → `return ex.markdown`)는 **기록 포함 원본**을 그대로 돌려주므로 이미 안전하다. 거기서도 재부착하면 **중복**이 된다. 재부착은 반드시 성공 분기 한 곳에서만.

**2번의 참고**: `runConvert` 는 현재 프로덕션 호출자가 없다(`convertStore.ts` 자기 정의뿐). 지금은 죽은 경로지만 배선되는 순간 무방비라 같이 고친다.

**strip 하지 않는 곳** (확인 완료):
- **임베딩** — `gemini-embedding-001` 은 위키 본문을 만지지 않는다. 오염 없음.
- **`gaps.ts`** — 프로덕션 호출자 없음. 위키 본문이 닿을 수 없다.
- **⌘K 검색**(`PiecePoolApp.tsx:830`) — **의도적으로 포함한다.** 자기가 쓴 설명을 검색으로 되찾는 건 복기 목적에 부합한다. 코드 변경 0.

### 5. 편집 모드 — 숨기고 저장 시 재부착

읽기 모드에선 패널이 기록을 렌더하고, 편집 모드에선 기록 원문을 **숨긴다**. `## 근거` 와 정책이 다른 이유: 근거 섹션은 `sourceRefs` 가 SSOT라 본문이 망가져도 복구되지만, **기록 섹션은 그 자체가 SSOT** 다. 사용자가 헤딩을 건드리면 파싱이 무너지고 복구 원본이 없다.

| 지점 | 변경 |
|---|---|
| `PiecePoolApp.tsx:723` | draft seed 를 `stripFeynmanSection(savedMd)` 로 |
| `PiecePoolApp.tsx:936` | `draft={drafts[key] ?? stripFeynmanSection(page.markdown)}` |
| `PiecePoolApp.tsx:732` | `saveWiki` 직전 기록 재부착 |
| `PiecePoolApp.tsx:944` | dirty 판정을 strip 기준으로 (오탐 방지) |

**재부착 소스가 중요하다.** 메모리의 `page.markdown` 이 아니라 `await ipc.readWiki(space, page.path)` 결과에서 꺼내야 한다. 그래야 편집 중 append 된 최신 세션이 살아남는다. `toggleWikiSubject`(`:763`)가 이미 쓰는 패턴이다.

이것이 stale draft 버그(`PiecePoolApp.tsx:729-730` 주석이 인지하고 있으나 저장 **후** 정리라 진입~저장 사이 창을 못 막는다)를 같이 죽인다.

### 6. UI — 위키 문서 하단 인라인 패널

`DocView.tsx:242` 의 `bottomSlot` 이 이미 있다. `wikiReader`(`PiecePoolApp.tsx:955`)가 안 넘길 뿐이다. **DocView 수정 불필요.** 스코프에 `space`·`page`(완전한 `WikiPage`)가 전부 있다.

`DocView.tsx:240` 의 기존 파인만 오버레이와 충돌하지 않는다 — 위키는 애초에 240을 렌더하지 않는다(`feynman` prop 미주입). 그 줄은 §7에서 삭제된다.

**패널 구성** (`FeynmanPanel.tsx` 는 다중주제 전제라 삭제하고 신규 작성):

```
[접힌 카드] 2026-07-16 · 이해함              ← 클릭하면 대화 전문 펼침
[접힌 카드] 2026-04-02 · 아직 모름  ⚠ 이후 문서 바뀜
─────────────────────────────
[다시 설명해보기]
```

세션 진행 중엔 대화 + textarea + 버튼 4개: `설명 보내기` / `나중에` / `아직 모르겠어요` / `네, 이해했어요`. 판정 버튼은 `answered` 일 때만 활성(현행 유지). `주제 N/M` 헤더는 `topics.length > 1` 조건이라 자동으로 사라진다 — 손댈 필요 없다.

#### 자동 열기 — 조건 4개 전부

```
기록 0개  AND  !dismissed[`${space}::${page.path}`]  AND  session == null  AND  hasGeminiKey()
```

각 조건에 이유가 있다:

- **`session == null`** — `session` 은 앱 전역 싱글턴이다(`feynmanStore.ts:50`, 노트별 맵 아님). `start`(`:106`)가 기존 세션 확인 없이 통째 교체하므로, 위키A에서 설명 쓰던 중 위키B를 열면 **A의 history 가 메모리에서 증발한다**(디스크에도 없다 — `:181` `partialize`). 수동 클릭이면 사용자의 선택이지만 자동 열기는 사용자가 부르지 않았다.
- **`!dismissed[...]`** — `skipTopic`(`:150`)·`cancel`(`:157`)은 아무것도 기록하지 않는다. "나중에" 를 눌러도 기록은 0개 그대로 → 탭 재방문마다 무한 재발화. `dismissed: Record<string, string>` 를 persist 슬라이스에 둔다. 키는 `${space}::${page.path}` — `path` 는 rename 에도 불변이다(`wiki.rs:106-107` "파일명(path)은 다른 곳에서 참조되므로 유지한다"). localStorage 선례와 정당화가 이미 코드에 있다(`feynmanStore.ts:10-13`) — 기록이 유실되면 "아직 안 함" 으로 되돌아갈 뿐이라 안전하다.

  **persist 마이그레이션**: 슬라이스의 모양이 `{ statuses }` → `{ dismissed }` 로 완전히 바뀐다. 기존 키(`pp-feynman-sections`, `version: 1`, `feynmanStore.ts:176-182`)를 재사용하면 구버전 `statuses` 가 남아 혼선이 된다. **새 키 `pp-feynman-dismissed`(`version: 1`)로 갈아탄다.** 구 키는 마이그레이션하지 않는다 — `statuses` 는 노트 단위(`sectionKey(noteId, topic.key)`)라 위키 페이지 키로 옮길 대응이 없고, 어차피 새 설계의 SSOT는 위키 `.md` 본문이다. 구 키 정리 코드는 넣지 않는다(사용자 localStorage 를 임의로 지우지 않는다).
- **`hasGeminiKey()`** — `begin()`(`useFeynmanEditor.tsx:43-47`)은 키 없으면 조용히 무시한다. 게이트 없이 자동 열면 **아무 반응 없는 빈 패널**이 뜬다. 키 없을 땐 버튼을 `파인만 — API 키 필요` 로 비활성(현행 `:54` 패턴 유지).

**트리거는 마운트가 아니라 문서 정체성.** `useEffect(..., [space, page.path])` 로 건다. `DocView` 에 `key` 가 없어(`PiecePoolApp.tsx:1249-1257`, `:894-956`) React 가 인스턴스를 재사용하므로 마운트 훅은 양방향으로 틀린다: 위키A→위키B 는 언마운트가 없어 **안 열리고**, 위키→그래프→위키 는 재마운트라 **또 열린다**.

`나중에` 와 `닫기(X)` 는 페이지=주제1개이므로 의미가 하나다. 둘 다 `dismissed` 를 쓴다.

### 7. 삭제 범위

#### 통째 삭제

| 파일 | 근거 |
|---|---|
| `src/app/panes/useFeynmanEditor.tsx` | 노트 진입점 배선 허브 |
| `src/app/panes/FeynmanPanel.tsx` | 유일 호출자가 `useFeynmanEditor.tsx:64`. 다중주제 전제(`:35` `topics[idx]`, `:62-66`, `:113-115`)라 개작보다 신규가 깨끗 |
| `src/lib/cmHeadingAction.ts` | 존재 이유가 파인만 헤딩 진입뿐. 새 진입점은 하단 패널 하나라 되살아날 자리가 없다 |
| `e2e/feynman-sections.spec.ts` | 9개 전부 노트 섹션 전제 |

#### 부분 삭제

| 파일 | 삭제 | 유지 |
|---|---|---|
| `src/lib/noteSections.ts` | `SectionTopic`(`:13-31`) · `toTopic`(`:90-100`) · `isTopic`(`:103`) · `wholeNoteTopics`(`:109-116`) · `topicsForSelection`(`:127-160`) · `Heading.key`(`:36`) · `seen` Map(`:60`) · slug 채번(`:71-74`) · `:1` `normalizeTitle` import(고아가 됨) | **파일 자체** · `stripEvidenceSection`(`:170-198`) · `scanHeadings`(`:58`, **export 로 승격**) · `sectionEnd` · `cleanTitle` · `ATX`/`FENCE`/`PDF_EMBED_LINE`. 소비자 2곳: `DocView.tsx:95`, `InboxSection.tsx:809`. 파일 상단 주석(`:3-11`)은 위키 표시 전처리 모듈로 재작성 |
| `src/store/feynmanStore.ts` | `draftNoteId`(`:31`) · `adopt`(`:65`,`:159-173`) · `Session.topics`/`idx`(`:38-39`) · `skipTopic`(`:58`,`:150-155`) · 다중주제 전이(`:142-146`) · `statuses`(`:51`) · `SectionStatus`(`:15-28`) · `sectionKey`(`:69`) · `NOT_YET`(`:186`) · `getSectionStatus`(`:186-206`) | `hasGeminiKey`(`:71-73`) · `apiKey`(`:75-77`) · stale 방어(`sessionSeq`·`fresh()`). persist 는 새 키 `pp-feynman-dismissed` 로 교체(§6) |
| `src/store/importStore.ts` | `:10` import · `:16-19` 주석 · `:37` `feynmanUsed` · `:63-64` `feynmanNoteId` · `:73-80` `feynmanTranscript` · `:188-192` adopt · `:201-203` transcript 주입 · `:206` · **`writeAndComplete` 의 `extra` 파라미터(`:139`,`:167`)** — `:206` 이 유일 전달부라 함께 고아 | `:7` `normalizeTitle`(`buildInput`(`:112`)이 씀) · `:194-197` `if (!p.withLlm)` 블록 |
| `src/app/panes/InboxSection.tsx` | `:7`·`:8` import · `:243-245` · `:610` · `:678-682` pill · `:699-700` · **`:727` `{fy.overlay}`**(빠뜨리면 컴파일 에러) · `:617-623` 토스트 3항→2항 · `:1105` 주석 | `PropertyPill`(`:1141`, `:674`/`:684` 가 씀) · `Icons.HelpCircleIcon`(`Ribbon.tsx:70`) · `FEYNMAN_FACTS`(`:62-77`, 인물 소개 로딩 문구 — 위키 생성에 계속 쓰임) |
| `src/app/panes/DocView.tsx` | `:7`·`:8` import · `:42` 구조분해 · `:74-75` prop 타입 · `:80-86` 훅 호출 · `:138-139` · `:239-240` | `:5`·`:95` `stripEvidenceSection`(파인만 무관) · `bottomSlot`(`:38`,`:68`) |
| `src/app/PiecePoolApp.tsx` | `:1054-1055` (주석 + `feynman={{ noteId, space }}` — 유일 주입부) | — |
| `src/lib/SlashBlockEditor.tsx` | `headingAction` 배선(`:13`,`:245`,`:261`,`:281-282`,`:304`) · `onSelect`/`EditorSelection`(소비자가 파인만뿐) · `.pp-heading-action` CSS(`:32`,`:48-49`) | — |

#### 삭제하지 않는다 — 함정

| 대상 | 이유 |
|---|---|
| **`e2e/feynman.spec.ts`** | 이름만 feynman. 실제로는 `review_needed`(복습 표시) e2e다. 3개 전부 생존. `:6` 주석이 "파인만 본체는 sections spec" 이라 명시 |
| `src/llm/feynman.ts` | UI 레이어 무관. **13개 테스트 중 하나도 안 깨진다** (14개가 아니다) |
| `scripts/feynman-eval.ts` · evals 픽스처 | 러너가 안 깨진다. §8 참조 |
| `.pp-feynman-select` | CSS 규칙이 없다 — e2e 훅 전용. `useFeynmanEditor` 삭제로 자동 소멸 |
| `provider.ts:16` `features.clarify` | 데드지만 docs SSOT 동시 수정 필요 → 범위 밖 |

**죽는 기능 명시**: "파인만에서 쓴 설명이 위키 생성 재료가 된다" 배선이 통째로 사라진다(`importStore.ts:203`). 파인만이 위키 **이후**로 옮겨가므로 구조적으로 성립할 수 없다. 의도된 것이다.

### 8. 테스트

#### 신규 — `src/lib/feynmanSection.test.ts`

라운드트립이 핵심이다. 적대적 케이스 필수:

- 발화에 `**나:**` / `**되묻기:**` → 인용되어 경계와 안 겹침
- 발화에 `> 교수님 말씀` → `> > ` 저장, **한 단계만** 벗겨 복원 (`/^> ?/`. `/^>\s*/` 쓰면 사용자의 `>` 가 뭉개진다)
- 발화 내부 빈 줄 vs 발화 경계 — 후행 공백 제거 후에도 구분됨
- 발화에 `### <ISO> · 이해함 · <hash>` → 세션 위조 안 됨
- 발화에 `## 파인만 기록` → 섹션 위조 안 됨
- **본문 코드펜스 안에 `## 파인만 기록`** → 본문이 안 잘림 (소박한 `indexOf` 구현에서 재현됨: `"# 개념\n\n```md\n## 파인만 기록\n예시\n```\n\n## 진짜 본문\n소중한 내용"` → `"# 개념\n\n```md"` 로 **본문 소실**)
- 펜스 미닫힘 본문에 append → parse 0개 → 섹션 중복 생성되지 않는지 (역방향 반례)
- CRLF
- 기록 없는 본문 → `sessions: []`, `strip` 이 원문 그대로
- 깨진 헤더 → fail-closed (원문 보존, 조용한 삭제 없음)
- `bodyHash` 가 세션 append 에 불변 (자기 자극 없음)

#### 회귀 — `src/lib/llmApply.test.ts`

기존 병합 describe(`:206`) 안에. `deps` 주입이라 LLM 없이 결정적 검증 가능:

- merge 후 기록이 **글자 그대로** 보존된다
- `deps.mergeMarkdown` 에 전달된 인자에 기록이 **없다** (입력 오염 차단)
- fallback 2경로(미주입·실패)에서 기록이 **중복되지 않는다**
- 정리글 재변환(`synthesisPage`) 후 기록 보존

#### 회귀 — `src/store/feynmanStore.test.ts`

13개 중 삭제 4 / 재작성 4 / **생존 5**(stale 응답 3종 · 실패 시 설명 보존 · probing 중 판정 차단). 추가:

- **기록 직후에는 배지가 뜨지 않는다** ← 이 테스트가 없으면 `updatedAt` 설계로 회귀해 배지가 상시 점등한다
- 자동 열기가 진행 중 세션을 파괴하지 않는다
- `나중에` → `dismissed` 기록 → 재방문 시 자동 안 열림

#### 정리

- `noteSections.test.ts` 24개 = `topicsForSelection` 17 + `stripEvidenceSection` 7 → **앞 17개 삭제, 뒤 7개 생존**
- `e2e` 신규: 위키 문서 → 자동 펼침 → 설명 → 되물음 → 판정 → 본문에 기록 확인

#### eval

`gate()`(`feynman-eval.ts:205-220`)는 그대로 재사용한다. 다만 fixture 18개의 `note` 가 전부 **사용자 필기 파편**이라 더 이상 프로덕션 입력(= LLM이 쓴 위키 본문)을 대표하지 않는다. 러너는 안 깨지므로 이번 PR 을 막지 않되, hint 기준선 재보정과 위키형 fixture 추가를 후속으로 남긴다.

부수 정정: `evals/feynman/README.md:6-10` 이 안내하는 `--all` 은 스크립트가 파싱하지 않고(기본이 전체 실행이라 무해), `--case trap-wrong-fact` 의 fixture id 는 존재하지 않는다(실제는 `clarify-03-wrong-pvalue-trap`).

### 9. 오류 처리

- LLM 실패 → 대화를 메모리에 유지한 채 재시도(현행 `runProbe`(`:84-100`) 유지). 사용자 설명을 잃지 않는다.
- 기록 저장(`saveWiki`) 실패 → 세션을 메모리에 유지하고 재시도 버튼. **세션을 날리지 않는다.**
- 파싱 실패 → fail-closed. 원문 보존, 조용한 삭제 금지.
- 키 없음 → 자동 열기 안 함, 버튼 비활성.

## 미결 사항

- 기록 섹션이 길어질 때의 상한. 세션 N개 누적 시 위키 `.md` 크기와 `probeExplanation` 의 `note.slice(0, 6000)`(`feynman.ts:119`) 예산 — strip 하므로 후자는 무관하나 파일 크기는 무한 증가한다.
- 위키형 eval fixture 를 언제 만들지.
- `review_needed` 연동을 되살릴지 (`graph.rs:305` 문구가 파인만을 기다리고 있다).
