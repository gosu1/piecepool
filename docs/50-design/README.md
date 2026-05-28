# 50-design

Figma 기반 UI/UX 디자인. **TS 타입/코드 직접 노출 금지**. 디자이너 친화 문서.

## 포함 문서 (작성 예정)

| 파일 | 내용 |
|---|---|
| `screen-inventory.md` | 5개 화면 카드 (목적, 인터랙션, Figma 파일 링크) |
| `user-flows.md` | Mermaid sequence: Import / Edit / Graph 탐색 |
| `component-states.md` | 화면 × {빈/로딩/성공/에러/충돌} 매트릭스 |
| `design-tokens.md` | RelationType 색상, edge 두께·강도 시각화 규칙 |
| `handoff-checklist.md` | Figma → React 컴포넌트 인수인계 절차 |

## 규약

- TypeScript 타입, JSON Schema, 코드블록 본문 노출 금지
- 필요 시 "→ 계약 명세는 [10-contracts](../10-contracts/) 참조" 한 줄 링크
- 표/Mermaid/스크린샷 placeholder 중심으로 작성

## Owner

Design / Figma (@Black-Tiger-h, git author name: `hyeon_nu`)

## 의존

- [`../00-overview/vision.md`](../00-overview/) — 비전·사용자 (필독)
- [`../40-frontend/screens/`](../40-frontend/screens/) — 화면별 기능 요구사항

## 작성 일정

Phase 4. 40-frontend와 양방향 검토.
