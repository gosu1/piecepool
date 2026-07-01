# 기여 가이드 (Contributing)

PiecePool에 기여하기 전에 이 문서를 읽어주세요. 상세 스펙은 [`docs/`](docs/) 트리를 참조합니다.

## 읽는 순서

1. [README.md](README.md) — 프로젝트 개요, 상태, 문서 맵
2. [`docs/00-overview/`](docs/00-overview/) — 비전 / MVP 범위 / 용어 / 열린 질문
3. 본인 역할 폴더 — `docs/20-backend` · `docs/30-llm` · `docs/40-frontend` · `docs/50-design` · `docs/60-qa`
4. [`docs/10-contracts/`](docs/10-contracts/) — 공유 계약 6종 (SSOT)

## 개발 환경

- macOS (Apple Silicon 권장)
- **Node.js 22** (`.nvmrc` 참조 — `nvm use`)
- Rust + cargo (Tauri 빌드)
- `OPENAI_API_KEY` — [`.env.example`](.env.example)를 `.env`로 복사해 작성 (없으면 heuristic fallback 동작)

```bash
npm install
npm run tauri dev      # Tauri + Vite 동시 실행
```

환경변수 ([`.env.example`](.env.example)):

| 변수 | 필수 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI API 키 (없으면 heuristic fallback) |
| `PIECEPOOL_LLM_MODEL` | | 모델명 override (기본값 존재) |

## 브랜치 & PR

- **`main`에 직접 push 금지.** feature branch → PR → review → merge.
- 일반 변경: 최소 1인 리뷰. `docs/10-contracts/` 변경: `contracts-change` 라벨 + 4역할(Backend·Frontend·LLM·Design) 승인.
- CI(`docs-check`, `code-check`)가 red면 merge 금지.
- merge 후 feature branch 삭제.

## 커밋 컨벤션

Conventional Commits + 한국어 설명:

```
feat(pdf): PDF 텍스트 추출 — page 인덱싱
fix(llm): 스키마 위반 재시도 backoff 수정
docs(contracts): Source.tags 필드 추가
```

타입: `feat` · `fix` · `docs` · `chore` · `refactor` · `test`. 식별자/타입은 영어, 설명은 한국어.

## SSOT — 단일 진실 원천

[`docs/10-contracts/`](docs/10-contracts/) **에만** 정의합니다. 다른 곳에 복붙 금지 (CI `ssot-check`가 grep으로 차단).

| 자산 | 파일 |
|---|---|
| 엔티티 TS 타입 | `entities.md` |
| RelationType enum | `relation-types.md` |
| 폴더 트리 | `workspace-layout.md` |
| Frontmatter | `markdown-frontmatter.md` |
| Wikilink/embed | `wikilink-embed.md` |
| LLM 출력 schema | `llm-output-schema.md` |

- Rust `models/`는 `entities.md`를 1:1 미러 (`#[serde(rename_all = "camelCase")]`). TS 타입은 `npm run gen:types`로 자동 생성 — `src/lib/generated/`는 손으로 수정 금지.
- 계약 변경 절차: `contracts-change` 라벨 PR → 4역할 승인 → 의존 문서 동기화.

## 백엔드 모듈 경계 (Rust)

- `main.rs` 진입점 전용 · `lib.rs` 배선/커맨드 등록 · `commands/` 얇게(`Result<T, String>`, 비즈니스 로직 금지) · `storage/` 파일 I/O 전담(`tokio::fs`) · `import/` 상태머신 · `pdf/` 텍스트 추출 · `seed/` 데모 데이터.
- 프로덕션 코드에서 `unwrap()`/`expect()`/`panic!()` 금지 → `AppError` + `?` 전파.
- `archive/`는 LLM 관점에서 읽기 전용 — 원문 덮어쓰기 금지.

## 검증 게이트

```bash
# MUST (blocking)
npm run check && npm run build
cargo check --manifest-path src-tauri/Cargo.toml
# Quality
cargo test   --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

## 리뷰 할당

[`.github/CODEOWNERS`](.github/CODEOWNERS)가 폴더별 리뷰어를 자동 지정합니다. 행동 규범은 [행동 강령](.github/CODE_OF_CONDUCT.md)을 따릅니다.
