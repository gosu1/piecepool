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
- [Gemini API 키](https://aistudio.google.com/apikey) — 무료 등급으로 충분하다

```bash
npm install
npm run tauri dev      # Tauri + Vite 동시 실행
```

> `tauri.conf.json`의 `beforeDevCommand`는 `npm run dev`가 아니라 **`node node_modules/vite/bin/vite.js`**다.
> `npm run dev`로 두면 프로세스 사슬이 `tauri → npm → vite` 3단이 되는데, Tauri 가 자식(`npm`)을 SIGKILL 할 때
> 손자(`vite`)는 살아남아 포트 1420을 계속 물고 `Port 1420 is already in use`로 다음 실행을 막는다.
> vite 를 직접 실행하면 Tauri 의 자식이 곧 vite 라 항상 함께 종료된다. **되돌리지 말 것.**
> (그래도 포트가 막히면: `lsof -ti:1420 | xargs kill -9`)

### API 키를 넣는 곳이 두 군데다

가장 자주 막히는 지점이다. **앱은 `.env`를 읽지 않는다.**

| 실행 대상 | 키 위치 | 넣는 법 |
|---|---|---|
| 데스크톱 앱 (`npm run tauri dev`) | `localStorage` | 앱 좌하단 계정 → **설정** → `Gemini API Key` |
| CLI 스크립트 (`npm run eval:feynman`, `chunk`, `eval` …) | `.env` | `cp .env.example .env` 후 `GEMINI_API_KEY=` 채우기 |

키가 없어도 앱은 죽지 않는다 — 휴리스틱 폴백(문서 헤딩 분해)으로 내려간다. **파인만 패널이 안 뜨면 키부터 의심할 것.**

환경변수 ([`.env.example`](.env.example)) — CLI 전용:

| 변수 | 필수 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Gemini API 키 — Wiki 생성 · 파인만 · 임베딩 |
| `LINER_API_KEY` | | Liner API 키 — 정보 간극 메우기(label↔user) 출처 검색 · fact-check |
| `PIECEPOOL_LLM_MODEL` | | 모델명 override (기본 `gemini-2.5-flash`) |
| `PIECEPOOL_EMBED_MODEL` | | 임베딩 모델 override (기본 `gemini-embedding-001`) |

## 브랜치 & PR

- **`main`에 직접 push 금지.** feature branch → PR → review → merge.
- 일반 변경: 최소 1인 리뷰. `docs/10-contracts/` 변경: `contracts-change` 라벨 + 계약 담당 1인 승인.
- CI(`docs-check`, `code-check`)가 red면 merge 금지.
- merge 후 feature branch 삭제.
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
- 계약 변경 절차: `contracts-change` 라벨 PR → 계약 담당 1인 승인 → 의존 문서 동기화.

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

[`.github/CODEOWNERS`](.github/CODEOWNERS)에 경로별 리뷰어가 적혀 있습니다.

2026-08-16 저장소가 공개로 전환되면서 **깃허브의 CODEOWNERS 자동 지정 기능이 켜졌습니다** — PR이 열리면 이 파일 기준으로 리뷰어가 자동으로 붙습니다. [`assign-reviewers`](.github/workflows/assign-reviewers.yml) 워크플로도 같은 파일을 읽어 리뷰어를 요청하는 이중 안전망이며, `docs/10-contracts/` 변경을 감지해 `contracts-change` 라벨을 붙이는 것은 워크플로 몫입니다.

행동 규범은 [행동 강령](.github/CODE_OF_CONDUCT.md)을 따릅니다.

## 브랜치 보호 — 켤 수 있게 됐지만 아직 안 켰다

비공개 + GitHub Free 플랜 시절에는 브랜치 보호 기능 자체가 잠겨 있었으나, **2026-08-16 공개 전환으로 설정할 수 있게 됐다.** 설정 권한은 저장소 소유자(팀장)에게만 있고 아직 켜지지 않았다. 켜기 전까지 아래는 전부 사람이 지키는 약속이며, 기계가 막아주지 않는다.

- `main` 직접 push — 기술적으로 막혀 있지 않다. 그래도 하지 않는다.
- CI 빨간불 머지 — 머지 버튼이 눌린다. 그래도 하지 않는다.
- 최소 1인 승인 — 강제되지 않는다. 그래도 받는다.

팀장에게 요청할 설정 (PIE-71 안건):

- 필수 상태 체크: `code-check`, `docs-check`
- merge 전 최소 1인 review
- stale approval 자동 해제, merge 후 브랜치 자동 삭제
- `main` 직접 push 금지 (관리자 포함)
- ⚠️ "Require review from Code Owners" 는 그대로 켜지 말 것 — `docs/10-contracts/` owner 가 계약 담당 1인뿐인데 깃허브는 PR 작성자 본인의 승인을 막으므로, 켜면 계약 담당이 올리는 계약 PR 은 승인할 사람이 없어 영구 차단된다. 끄고 가거나 계약 폴더에 2번째 owner 를 추가한 뒤 켠다 (PIE-71 에서 결정).

버전·릴리즈는 `release-please`가 관리한다. Conventional Commits가 다음 버전을 결정하고, 릴리즈 PR 머지 시 tag + Release + macOS 번들이 생성된다.
