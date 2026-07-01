# 40-frontend

React + TypeScript + Tailwind 프론트엔드. Markdown 편집기, Wiki/Graph View, **OCR 클라이언트**, **.dmg/.pkg 배포**.

## 핵심 책임 (서준 명시)

| 영역 | 내용 |
|---|---|
| **디자인 → 프로덕션 화면** | `docs/50-design/` 핸드오프 기반 화면 구현 |
| **첫 진입 INBOX** | 사용자 첫 화면 = Inbox |
| **OCR (다양한 input → text)** | 이미지/필기/스크린샷 등 모든 입력을 텍스트로 변환. **MVP 범위** (기존 §17.1 OCR을 MVP로 이동) |
| **.dmg/.pkg 배포** | macOS 설치 패키지 빌드 + 배포 |

## 포함 문서 (작성 예정)

### 루트
| 파일 | 내용 |
|---|---|
| `architecture.md` | React 라우팅, 상태 관리, IPC 호출 패턴 |
| `packaging.md` | Tauri bundle 설정, `.dmg`/`.pkg` 빌드, 코드 사이닝, 배포 채널 |
| `ocr-client.md` | OCR 통합 (Tesseract.js / Apple Vision / 외부 OCR API). 다양한 input 타입 처리 |

### `screens/`
| 파일 | 화면 |
|---|---|
| `workspace.md` | Workspace 상태/진입 |
| `inbox.md` | **첫 진입 화면**. Source 가져오기 (Inbox → archive). 다양한 input 타입 수용 |
| `markdown-editor.md` | archive/wiki 편집 |
| `wiki-view.md` | Concept 중심 탐색 |
| `graph-view.md` | 타입 있는 지식 그래프 (Graph 파트 전체는 @gosu1 직접 구현) |

### `components/`
| 파일 | 컴포넌트 |
|---|---|
| `embed-renderer.md` | `![[...]]` PDF/이미지 inline preview |
| `wikilink.md` | `[[...]]` 링크 렌더링 |
| `graph-canvas.md` | node/edge 인터랙션 (Graph 파트는 @gosu1 직접) |
| `ocr-dropzone.md` | 다양한 input 드롭/업로드 UI |

## Owner

Frontend (@gosu1, @dbstpgns789-eng)

- **Graph View 전체 구현 = @gosu1 직접** (graph-view.md, graph-canvas.md 포함)
- **OCR / 첫 진입 INBOX / .dmg/.pkg = @dbstpgns789-eng**

## 의존

- [`../10-contracts/`](../10-contracts/) — 엔티티/frontmatter/wikilink 계약 (SSOT)
- [`../20-backend/ipc-api.md`](../20-backend/) — Tauri command 호출
- [`../50-design/`](../50-design/) — 화면 시각 요구, 컴포넌트 상태, design tokens
- [`../00-overview/pricing-model.md`](../00-overview/) — 단일 tier · 기능 토글

## 작성 일정

Phase 4. Tracking issue: [#2](https://github.com/gosu1/piecepool/issues/2)
