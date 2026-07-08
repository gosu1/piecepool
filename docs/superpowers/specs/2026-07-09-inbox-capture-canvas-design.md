# Inbox 중앙 노트 에디터 리디자인 — "수집 캔버스" (B안)

- 날짜: 2026-07-09
- 대상: `src/app/panes/InboxSection.tsx` 의 **중앙 노트 패널(`notePane`)** 만
- 브랜치: `feat/inbox-capture-canvas`
- 관련: StudyHome 브랜드 리디자인(#146)과 같은 시각 언어(primary 블루·온기·위계) 연장

## 배경 / 문제

Inbox는 "수집 작업공간"의 심장인데, 중앙 노트 에디터가 밋밋하다.
브레인스토밍에서 확인된 개선 후보 5곳 중 **영향이 가장 큰 2곳**을 이번 범위로 잡는다:

1. **밋밋한 에디터** — "새 페이지" 빈 화면 + 평면적 속성 행(저장위치·AI생성·되묻기). 가장 많이 보고 쓰는 곳인데 위계·완성도가 약함.
2. **주액션 묻힘** — "저장 + AI 정리"가 하단 우측에 회색으로 조용히 있음. Inbox의 핵심 행동인데 눈에 안 띔.

부수적으로 **온보딩(후보 3)** 도 한 줄 안내로 함께 해소한다.

## 목표 (성공 기준)

- 노트 패널이 "수집 캔버스"답게 **의도적·따뜻**하게 보인다(StudyHome 톤 일관).
- **주액션(저장 + AI 정리)** 이 primary 블루로 확실히 산다.
- 처음 열었을 때 **뭘 하는 곳인지** 한 줄로 전달된다.
- 저장/AI/되묻기 **기능 로직·상태는 100% 그대로**(시각·배치만 변경). 백엔드·계약 변경 없음.
- 라이트/다크 양쪽 자동 대응(디자인 토큰만 사용, 신규 색 없음).

## 범위 밖 (Non-goals)

- PDF 패널 / 위키 패널 폴리시(후보 4)
- 업로드 진입점 정리(후보 5)
- 위키 임베드 파일명 불일치("0902 16.pdf" vs "0902-16.pdf") — 별개 데이터/import 이슈
- `clarify_pending` 되묻기 패널의 **동작** 변경(시각은 기존 유지, 손대지 않음)

## 디자인

세 조각으로 나눈다. 모두 `notePane` 내부 변경.

### 1. 헤더 밴드 (제목 + 안내 + 속성 pill 을 감싸는 존)

- 노트 본문 상단(제목~속성 영역)을 **은은한 primary 틴트 그라데이션 밴드**로 감싼다.
  - 라이트: `linear-gradient(180deg, color-mix(primary 5.5%), transparent)` + 하단 hairline.
  - 다크: 동일 방식(primary 다크 토큰 기준 ~10%). → `--color-primary` / 토큰으로 자동 대응.
- 밴드 안 구성(위→아래): **제목 input** → **한 줄 안내** → **속성 pill 행**.
- 밴드는 `px-5 py-4` 정도, 에디터 본문(캔버스)과 배경 대비로 "머리/몸통" 구분.

### 2. 온보딩 한 줄 안내

- 제목 바로 아래: `생각의 파편을 담아보세요 — 저장하면 AI가 위키로 정리해요.` (muted, 13px).
- **항상 표시**(짧고 브랜드/가이드 역할). 별도 상태 없음.

### 3. 속성 pill (저장위치·AI생성·되묻기)

기존 3개의 평면 행(w-40 라벨 + 컨트롤)을 **컴팩트 pill 행**으로 바꾼다. 기능·상태는 기존 state 그대로 연결.

- **저장 위치**: `📁 <공간명> ▾` pill(내부에 기존 `<select>`). `spaces.length > 1` 일 때만 표시(기존 조건 유지).
- **AI 생성**: `✦ AI 생성` **토글 pill**. 켜짐(`withLlm`) → 파란 pill(`chip.on`), 꺼짐 → 중립 pill. 클릭으로 토글(기존 checkbox 대체, `setWithLlm`).
- **되묻기**: `❔ 되묻기` **토글 pill**. `withLlm` 꺼지면 비활성(흐리게, 클릭 불가) — 기존 `disabled` 규칙 유지. 켜짐 → 파란 pill.
- pill 은 `rounded-full border px-3 py-1 text-[12px]`, 켜짐 상태만 primary 계열 테두리·배경·글자.
- 접근성: 토글 pill 은 `role="button"`/`aria-pressed` 또는 `<button aria-pressed>`. 저장위치는 select 유지.

### 4. 주액션 CTA (저장 + AI 정리)

- 에디터 캔버스 아래, **좌: `⌘Enter 로 저장` 힌트 / 우: 파란 CTA**.
- CTA: 기존 `<Button variant="solid">` → **primary 블루 알약 + `✦`(SparkleIcon)**. (후광은 실제로 보니 과해서 제외 — 사용자 결정)
  - 라벨: `withLlm` → `저장 + AI 정리`, 아니면 `원본으로 저장`, busy/pdfBusy 시 기존 진행 라벨. (기존 로직 그대로)
  - disabled: `busy || pdfBusy || !title.trim()` (기존 그대로).
- SparkleIcon 은 이미 아이콘 세트에 있음(`Icons.SparkleIcon`).

### 유지되는 것 (변경 없음)

- 패널 토글(PDF/위키)은 `PaneHeader` 우측 슬롯 그대로.
- `SlashBlockEditor`(본문 에디터) 그대로, `frameless`, `⌘Enter=run`.
- `clarify_pending` 되묻기 패널, busy 라벨, 업로드 팝업/드롭존, PDF·위키 패널 전부 그대로.

## 컴포넌트 경계

- 변경은 `InboxSection.tsx` 의 `notePane` JSX + 작은 로컬 헬퍼(pill 토글 컴포넌트) 한정.
- 필요 시 `PropertyPill`(로컬 함수 컴포넌트)로 토글 pill 을 추출해 3곳 재사용 — 파일 내 응집 유지.
- 색·틴트는 전부 기존 토큰(`--color-primary`, `hairline`, `ink-*`, `surface-*`). 신규 전역 토큰/색 없음.
- CSS: Tailwind 유틸리티로 처리 가능. 그라데이션·후광은 arbitrary value(`bg-[linear-gradient(...)]`, `shadow-[...]`)로. 필요 시 `index.css`에 유틸 클래스 1~2개만 추가.

## 검증

- `npx tsc --noEmit` 통과.
- 수동(Tauri 앱): 라이트/다크 × (빈 상태 / 작성 중) × (AI 생성 on/off) 조합에서:
  - 헤더 밴드 틴트가 양 테마에서 자연스러운지.
  - pill 토글이 기존 checkbox와 동일하게 `withLlm`/`clarify` 를 바꾸는지(되묻기 비활성 규칙 포함).
  - CTA 라벨·disabled·저장 동작이 기존과 동일한지.
  - 되묻기(clarify) 플로우가 그대로 뜨는지.
- UI 변경이므로 PR 에 **비포/애프터 스크린샷** 첨부(팀 규칙).

## 위험 / 주의

- 토글 pill 로 바꾸며 **기능 회귀** 위험 — checkbox→button 전환 시 `withLlm`/`clarify` state 연결과 disabled 규칙을 정확히 옮긴다. 가장 신경 쓸 부분.
- 헤더 밴드 틴트가 다크에서 과하지 않게 — 낮은 불투명도로.
