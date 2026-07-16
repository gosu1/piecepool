# 본문 글자 크기 설정 — 설계

**날짜**: 2026-07-16 · **상태**: 설계 승인 (`feat/body-font-size`, base main a6e5113)

## 배경 (왜)

PDF 요약이 흘러드는 노트 본문의 글자 크기는 15px 고정(`SlashBlockEditor.tsx` CM6 테마,
읽기 모드 `markdown.tsx` 의 `text-[15px]`). 사용자가 자기 눈에 맞게 조절할 수 없다.

## 확정 결정 (사용자 승인)

1. **적용 범위**: 본문 텍스트 전부 — 노트 에디터(Inbox·DocView 편집) + 읽기 모드
   (DocView 읽기, 위키 패널 본문). UI(버튼·사이드바)는 불변.
2. **조절 UI**: 설정 모달의 **스테퍼** — `[-] 15px [+]`, 최소 13 · 최대 17 · 1px 단위.
   (프리셋 4개 안은 기각 — 사용자가 스테퍼 지정)
3. **구현 방식**: CSS 변수 — `:root` 의 `--pp-body-font-size`(기본 15px) 하나를
   에디터 테마와 읽기 모드 본문 클래스가 함께 참조. 리렌더·에디터 재구성 없이 즉시 반영,
   에디터 헤딩은 em 배율이라 자동 스케일. 읽기 모드 헤딩은 고정 유지(위계 이미 충분).

## 구성 요소

- `src/lib/settings.ts`: `getBodyFontSize(): number`(기본 15, 13~17 정수로 클램프) ·
  `setBodyFontSize(px)` (localStorage `body-font-size`) · `applyBodyFontSize(px)`
  (documentElement 에 `--pp-body-font-size` 주입 — 시작·변경 공용).
- `src/styles/index.css`: `:root { --pp-body-font-size: 15px; }` 기본값(주입 전 폴백).
- `src/app/PiecePoolApp.tsx`: 마운트 시 `applyBodyFontSize(getBodyFontSize())` 1회.
- `src/lib/SlashBlockEditor.tsx`: 테마 `fontSize: "var(--pp-body-font-size, 15px)"` 1줄.
- `src/lib/markdown.tsx`: 본문 텍스트 클래스(p·ul·ol·blockquote)의 `text-[15px]` →
  `text-[length:var(--pp-body-font-size,15px)]`. 테이블(14px)·코드(0.9em)는 불변.
- `src/app/shell/SettingsModal.tsx`: "본문 글자 크기" 행 — `[-] N px [+]` 스테퍼,
  경계에서 버튼 disabled, 클릭 즉시 `setBodyFontSize` + `applyBodyFontSize`(저장 버튼 없음,
  기존 출력 언어 토글과 같은 즉시 반영 결).

## 에러 처리

- localStorage 값이 없거나 파싱 불가·범위 밖 → 15 로 폴백(클램프).
- localStorage 접근 실패(사파리 프라이빗 등) → try/catch 후 기본값(기존 settings.ts 결).

## 테스트 (pass 조건)

- `settings.test.ts` 확장: 기본값 15 · set/get 라운드트립 · 클램프(12→13, 18→17, "abc"→15).
- 수동: 설정에서 13↔17 조절 시 에디터·위키 패널·DocView 즉시 반영, 재시작 후 유지.
- 기존 `npm test`·`npm run check` green. Rust·계약 변경 없음.
