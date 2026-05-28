# 40-frontend

React + TypeScript + Tailwind 프론트엔드. Markdown 편집기, Wiki/Graph View.

## 포함 문서 (작성 예정)

### 루트
| 파일 | 내용 |
|---|---|
| `architecture.md` | React 라우팅, 상태 관리, IPC 호출 패턴 |

### `screens/`
| 파일 | 화면 |
|---|---|
| `workspace.md` | Workspace 상태/진입 |
| `import.md` | Source 가져오기 (Inbox → archive) |
| `markdown-editor.md` | archive/wiki 편집 |
| `wiki-view.md` | Concept 중심 탐색 |
| `graph-view.md` | 타입 있는 지식 그래프 |

### `components/`
| 파일 | 컴포넌트 |
|---|---|
| `embed-renderer.md` | `![[...]]` PDF/이미지 inline preview |
| `wikilink.md` | `[[...]]` 링크 렌더링 |
| `graph-canvas.md` | node/edge 인터랙션 |

## Owner

Frontend (@dbstpgns789-eng, @gosu1)

## 의존

- [`../10-contracts/`](../10-contracts/) — 엔티티/frontmatter/wikilink 계약 (SSOT)
- [`../20-backend/ipc-api.md`](../20-backend/) — Tauri command 호출
- [`../50-design/`](../50-design/) — 화면 시각 요구, 컴포넌트 상태, design tokens

## 작성 일정

Phase 4. 50-design과 양방향 검토.
