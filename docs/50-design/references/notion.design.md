# DESIGN.md — Notion (PiecePool 채택본)

PiecePool `src/ds/` 디자인 시스템이 채택한 **Notion 디자인 언어**의 레포 내 정본.
원본 `~/Downloads/DESIGN-notion.md`가 유실되어, `src/ds/README.md`와 `src/styles/index.css`에서 실제 채택된 토큰·원칙을 역으로 정리해 git에 고정한다. 코드가 SSOT이며 이 문서는 그 요약 레퍼런스다.

## 한 줄 언어

> 따뜻한 페이퍼 캔버스 · 흰 카드 · **단 하나의 구조적 액센트(Notion 블루)** · 모노크롬 크롬 · Inter 음수 자간 · 헤어라인 + 거의 없는 그림자.

## 원칙

- 색은 **시맨틱 토큰 유틸리티로만** (`--ds-*` → `[data-theme]` 자동 반전). 하드코딩 hex 금지.
- **구조적 액센트는 Notion 블루 단 하나** (`primary` #0075de) — CTA·링크·active/focus·다크 그래프 코어. **빨강/크림슨 금지.**
- 스티커 팔레트(sky/purple/pink/orange/teal/green)는 **장식 전용** — CTA·구조에 절대 안 씀.
- 마케팅 CTA = 블루 **알약**(`rounded-full`), 유틸 버튼 = `rounded-md`, 인풋 = `rounded-xs`(각진 모서리).
- 면은 **헤어라인 + 거의 없는 다층 그림자**(`shadow-soft`), 무거운 그림자 금지.

## 토큰 (라이트 → 다크)

| 유틸리티 | 라이트 → 다크 |
| --- | --- |
| `bg-canvas` 페이지 | `#f6f5f4`(따뜻한 페이퍼) → `#191817` |
| `bg-surface` 카드/필드/nav | `#ffffff` → `#242321` |
| `bg-surface-soft` featured/hover | `#f0eeea` → `#201f1d` |
| `text-ink` / `-ink-2` / `-ink-muted` / `-ink-faint` | 근검정 → 오프화이트 |
| `border-hairline` / `border-ink` | `#e6e6e6` → `#322f2c` |
| `bg-primary` `text-primary` (Notion 블루) | `#0075de` → `#4d8df0` |
| `bg-fill` `text-on-fill` (다크 아일랜드: 위키 헤더·AI 배너·solid 버튼) | `#1f1e1c` → `#0e0e0c` |
| `bg-secondary` (인디고 hero) | `#213183` → `#2c3aa0` |

## 타이포 · 반경

- 역할 클래스: `ds-display-1 ds-display-2 ds-h1 ds-h2 ds-h3 ds-title ds-body ds-body-sm ds-button ds-caption ds-eyebrow`.
- 폰트: Inter/Pretendard 시스템 스택(`--font-sans`), 음수 자간.
- 반경: `rounded-xs`(4) `-sm`(5) `-md`(8) `-lg`(12) `-xl`(16) `-full`.

## 컴포넌트 (구현: `src/ds/`)

- **Primitives:** Button(primary 블루알약·solid ink·secondary·utility·ghost·link) · IconButton · Card(flat/soft·featured) · Input · Field · SearchInput · Badge · Avatar · Skeleton · Tabs · Divider · Logo · Waveform
- **Composites:** TopBar · Sidebar · TreeNav · AppShell · SubjectCard · PricingCard · ConceptGraph · GraphLegend · WikiPage · FileDropzone · EmptyState · AIWritingBanner · PlaceholderPanel

## 발전 메모

Notion은 문서/블록 제품의 언어라 PiecePool의 **그래프·백링크·vault** 성격과 일부 미스매치가 있다. 후보 대안: Obsidian(vault·그래프 네이티브), Linear(키보드·밀도·크리스프함). 전면 교체는 회의 안건.
