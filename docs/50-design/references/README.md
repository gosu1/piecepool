# 50-design / references — 브랜드 DESIGN.md 레퍼런스

UI/디자인을 발전시킬 때 참고하는 **유명 기업 디자인 언어(DESIGN.md)** 를 모아두는 폴더.
출처: **https://getdesign.md/** (Google `DESIGN.md` 스펙, 75개+ 브랜드). 서준(gosu1)이 정한 팀 표준 포맷 — 앞으로 UI 작업은 이 포맷을 레퍼런스로 간다.

> **왜 레포에 두나:** 디자인 소스가 개인 `~/Downloads`에만 있으면 팀(public repo)이 공유·리뷰할 수 없다. 실제로 `src/ds/`가 참조하는 `DESIGN-notion.md`가 git·Downloads 어디에도 없어 재현 불가였다. 레퍼런스는 여기 커밋해서 SSOT로 관리한다.

## 워크플로우

1. **레퍼런스 고르기** — getdesign.md에서 제품 성격에 맞는 브랜드 DESIGN.md를 받는다.
   - PiecePool = 위키/세컨드브레인 · 그래프 기반 → **Notion · Obsidian · Linear** 계열 우선.
2. **여기 커밋** — `<brand>.design.md` 파일명으로 이 폴더에 추가 (예: `notion.design.md`).
3. **레퍼런스 기반 프롬프트로 적용** — Claude에게 파일을 넘기고:
   - "옵시디언은 이렇게 하는데 이 화면을 이렇게 바꿔줘"
   - "이 DESIGN.md 기준으로 `<컴포넌트>`를 restyle해줘 (하드코딩 hex 금지, `--ds-*` 토큰만)"
4. **feature 브랜치 → PR** — 화면 단위로 작게 올리고 회의에서 각자 설명·수정.

## 현재 채택

| 파일 | 브랜드 | 적용 범위 | 상태 |
|---|---|---|---|
| [`notion.design.md`](./notion.design.md) | Notion | `src/ds/` 전체 디자인 시스템 (#79) | 채택됨 · 발전 중 |

## 규약

- 색은 `src/styles/index.css`의 시맨틱 토큰(`--ds-*`)으로만. **하드코딩 hex 금지.**
- 계약(엔티티/스키마)은 절대 여기 복붙하지 않는다 → [`../../10-contracts/`](../../10-contracts/) 링크만.
- 브랜드를 **바꾸는**(예: Notion→Linear) 결정은 팀 회의 안건 — 개인이 단독으로 전면 교체하지 말 것.
