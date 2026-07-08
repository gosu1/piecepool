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
- `OPENAI_API_KEY` · `LINER_API_KEY` — [`.env.example`](.env.example)를 `.env`로 복사해 작성

```bash
npm install
npm run tauri dev      # Tauri + Vite 동시 실행
```

환경변수 ([`.env.example`](.env.example)):

| 변수 | 필수 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI API 키 — Wiki 생성 · 타입 Graph |
| `LINER_API_KEY` | | Liner API 키 — 정보 간극 메우기(label↔user) 출처 검색 · fact-check |
| `PIECEPOOL_LLM_MODEL` | | 모델명 override (기본값 존재) |

## 브랜치 & PR

- **`main`에 직접 push 금지.** feature branch → PR → review → merge.
- 일반 변경: 최소 1인 리뷰. `docs/10-contracts/` 변경: `contracts-change` 라벨 + 4역할(Backend·Frontend·LLM·Design) 승인.
- CI(`docs-check`, `code-check`)가 red면 merge 금지.
- merge 후 feature branch 삭제.
- **큰 변화(기능·피벗·확정 결정)는 merge 전에 [`docs/00-overview/journey.md`](docs/00-overview/journey.md) 타임라인에 한 줄 추가** — 누가 merge하든 여정 기록이 남는다 (보고서·사업·PPT 원재료). PR 템플릿 체크리스트에 포함.
- **UI/UX 변경 PR은 비포·애프터 스크린샷 첨부** — 리뷰어가 시각 변화를 코드 없이 확인할 수 있게. PR 템플릿 체크리스트에 포함.

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

## 브랜치 보호

`main`은 GitHub Settings → Branches에서 보호 규칙을 적용한다(관리자 수동 또는 `gh api`):

- 필수 상태 체크: `code-check`, `docs-check`
- merge 전 최소 1인 review + CODEOWNERS review (`docs/10-contracts/`는 4역할)
- stale approval 자동 해제, merge 후 브랜치 자동 삭제
- `main` 직접 push 금지 (관리자 포함)

버전·릴리즈는 `release-please`가 관리한다. Conventional Commits가 다음 버전을 결정하고, 릴리즈 PR 머지 시 tag + Release + macOS 번들이 생성된다.
