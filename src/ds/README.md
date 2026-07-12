# PiecePool Design System — 디자인 언어

디자인 레퍼런스(`docs/50-design/references/`)의 디자인 언어를 PiecePool 화면(`picecpool.fig`)에 입힌 React 컴포넌트 라이브러리.
**따뜻한 페이퍼 캔버스 · 흰 카드 · 단 하나의 구조적 액센트(프라이머리 블루) · 모노크롬 크롬 · Inter 음수 자간 · 헤어라인 + 거의 없는 그림자.**

```tsx
import { Button, SubjectCard, ThemeProvider, AppShell } from "./ds";
```

갤러리: `/` (DesignSystemScreen) · 홈 데모: `/home-demo` (HomeDemoScreen).

---

## 디자인 원칙 (디자인 레퍼런스)

- 색은 **시맨틱 토큰 유틸리티로만** (`src/styles/index.css`, `@theme inline` + `--ds-*` → `[data-theme]` 자동 반전). 하드코딩 hex 금지.
- **구조적 액센트는 프라이머리 블루 단 하나** (`primary` #0075de) — CTA·링크·active/focus·다크 그래프 코어. **빨강/크림슨 금지.**
- 스티커 팔레트(sky/purple/pink/orange/teal/green)는 **장식 전용** — CTA·구조에 절대 안 씀.
- 마케팅 CTA = 블루 **알약**(`rounded-full`), 유틸 버튼 = `rounded-md`, 인풋 = `rounded-xs`(각진 모서리).
- 면은 **헤어라인 + 거의 없는 다층 그림자**(`shadow-soft`), 무거운 그림자 금지.

| 유틸리티 | 라이트 → 다크 |
| --- | --- |
| `bg-canvas` 페이지 | `#f6f5f4`(따뜻한 페이퍼) → `#191817` |
| `bg-surface` 카드/필드/nav | `#ffffff` → `#242321` |
| `bg-surface-soft` featured/hover | `#f0eeea` → `#201f1d` |
| `text-ink` / `-ink-2` / `-ink-muted` / `-ink-faint` | 근검정 → 오프화이트 |
| `border-hairline` / `border-ink` | `#e6e6e6` → `#322f2c` |
| `bg-primary` `text-primary` (프라이머리 블루) | `#0075de` → `#4d8df0` |
| `bg-fill` `text-on-fill` (다크 아일랜드: 위키 헤더·AI 배너·solid 버튼) | `#1f1e1c` → `#0e0e0c` |
| `bg-secondary` (인디고 hero) | `#213183` → `#2c3aa0` |
| `*-graph-core` / `*-graph-result` | 그레이/연그레이 → **블루**/그레이 |

타이포 역할 클래스(정확값): `ds-display-1 ds-display-2 ds-h1 ds-h2 ds-h3 ds-title ds-body ds-body-sm ds-button ds-caption ds-eyebrow`.
폰트: Inter/Pretendard 시스템 스택(`--font-sans`). 반경: `rounded-xs`(4) `-sm`(5) `-md`(8) `-lg`(12) `-xl`(16) `-full`.

테마: 루트를 `<ThemeProvider>` 로 감싼다(`main.tsx`). 토글 `<ThemeToggle/>` / `useTheme()`.

---

## 컴포넌트

**Primitives** — `Button`(primary 블루알약·solid ink·secondary·utility·ghost·link) · `IconButton`(circular) · `Card`(flat/soft·featured) · `Input` · `Field` · `SearchInput` · `Badge`(pill) · `Avatar` · `Skeleton`/`SkeletonText` · `Tabs`(블루 인디케이터) · `Divider` · `Logo` · `Waveform`

**Composites** — `TopBar` · `Sidebar` · `TreeNav` · `AppShell` · `SubjectCard` · `PricingCard`(featured=surface-soft) · `ConceptGraph`(라이트 모노크롬/다크 블루) · `GraphLegend` · `WikiPage`(+`WikiHeading`/`WikiParagraph`, ink 밑줄) · `FileDropzone` · `EmptyState` · `AIWritingBanner`(검정 알약) · `PlaceholderPanel`

**Theme/기타** — `ThemeProvider` · `useTheme` · `ThemeToggle` · `Icons.*` · `cn`

---

## 출처

- 디자인 언어: [디자인 레퍼런스](../../docs/50-design/references/)
- 화면/레이아웃: `~/Downloads/picecpool.fig` (실제 화면 export 이미지로 충실도 검증)
