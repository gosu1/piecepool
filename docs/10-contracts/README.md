# 10-contracts (🔒 Single Source of Truth)

PiecePool 공유 계약. 모든 역할이 참조한다. **수정 시 4개 역할(Backend/Frontend/LLM/Design) owner review 필수**.

## 포함 문서

| 파일 | 내용 | 상태 |
|---|---|---|
| [`workspace-layout.md`](workspace-layout.md) | Workspace 폴더 트리, `<space>/*` 디렉토리 규약 | ✅ |
| [`entities.md`](entities.md) | 핵심 엔티티 TypeScript 타입 11종 (Workspace ~ ImportJob) | ✅ |
| [`relation-types.md`](relation-types.md) | RelationType enum 12종 + 의미·사용 기준 + 노드 호환성 매트릭스 | ✅ |
| [`markdown-frontmatter.md`](markdown-frontmatter.md) | archive/wiki Markdown frontmatter 스키마 | ✅ |
| [`wikilink-embed.md`](wikilink-embed.md) | `[[...]]` / `![[...]]` 문법 규약, 충돌 처리 4종 | ✅ |
| [`llm-output-schema.md`](llm-output-schema.md) | LlmWikiResult JSON Schema (provider 무관: Gemini) | ✅ |

## 규약

### SSOT 원칙
다른 폴더 문서는 본 계약을 **link로만 참조**한다. TS 코드/JSON Schema **복붙 금지**.

CI workflow `docs-check.yml`의 `ssot-check` job이 grep으로 누출 자동 차단.

### 변경 절차
1. 본 폴더 수정 PR 생성
2. PR 라벨 `contracts-change` 부착
3. Backend, Frontend, LLM, Design 4개 owner 모두 review 승인
4. merge 후 의존 문서(`20-backend`, `30-llm`, `40-frontend`, `50-design`) 동기화 PR을 issue로 trace

## Owner

Tech Lead (@gosu1). 변경은 4개 역할 합의 필요. CODEOWNERS:
```
/docs/10-contracts/  @gosu1 @ChangSik88 @O6west @dbstpgns789-eng @Black-Tiger-h
```

## 작성 일정

Phase 2 — ✅ 완료 (2026-05-28).
LLM provider = Google Gemini 단일 (feature 3 출처 검색 = Liner API) — ✅ 단일 tier, 2026-07-10 ([ADR-0009](../adr/0009-llm-provider-gemini.md)가 2026-06-30 OpenAI 결정을 대체).
