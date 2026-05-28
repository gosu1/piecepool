# 10-contracts (🔒 Single Source of Truth)

PiecePool 공유 계약. 모든 역할이 참조한다. **수정 시 4개 역할(Backend/Frontend/LLM/Design) owner review 필수**.

## 포함 문서

| 파일 | 내용 | 상태 |
|---|---|---|
| `workspace-layout.md` | Workspace 폴더 트리, `<space>/*` 디렉토리 규약 | ✍️ Phase 2 |
| `entities.md` | 핵심 엔티티 TypeScript 타입 9종 | ✍️ Phase 2 |
| `relation-types.md` | RelationType enum 12종 + 의미·사용 기준 | ✍️ Phase 2 |
| `markdown-frontmatter.md` | archive/wiki Markdown frontmatter 스키마 | ✍️ Phase 2 |
| `wikilink-embed.md` | `[[...]]` / `![[...]]` 문법 규약 | ✍️ Phase 2 |
| `llm-output-schema.md` | LlmWikiResult JSON Schema (provider 무관) | ✍️ Phase 2 |

## 규약

### SSOT 원칙
다른 폴더 문서는 본 계약을 **link로만 참조**한다. TS 코드/JSON Schema **복붙 금지**.

### 변경 절차
1. 본 폴더 수정 PR 생성
2. PR 라벨 `contracts-change` 부착
3. Backend, Frontend, LLM, Design 4개 owner 모두 review 승인
4. merge 후 의존 문서(`20-backend`, `30-llm`, `40-frontend`, `50-design`) 동기화 PR을 issue로 trace

## Owner

Tech Lead (서준). 변경은 4개 역할 합의 필요.

## 작성 일정

Phase 2 (PRD_REFACTOR_PLAN 참조)
