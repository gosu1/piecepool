# BUILD PROGRESS — MVP 빌드 루프 ledger

> 자율 빌드 루프(`/loop`)의 orient 기준. 매 iteration 시작 시 이 파일을 읽고, 끝에 갱신한다.
> 북극성 = [acceptance-criteria.md](docs/60-qa/acceptance-criteria.md) + [e2e-scenarios.md](docs/60-qa/e2e-scenarios.md).
> 브랜치 = `feat/mvp-build` (origin/main에서 분기). 로컬 전용 — push/PR/이슈 write 안 함.

## 상태 범례
- `todo` 미착수 · `doing` 진행중 · `done` 코드+자동테스트 green · `manual` 구현됐으나 사람 수동확인 필요

## VERIFY GATE
- MUST: `npm run check` · `npm run build` · `cargo check --manifest-path src-tauri/Cargo.toml`
- 품질: `npm test`(vitest) · `cargo test --manifest-path src-tauri/Cargo.toml` · `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
- 마지막 결과(2026-06-30, #2 후): MUST 3종 green. `npm test` 5 green. `cargo test` 25(15 ts-rs + 10 storage)+1(smoke) green. clippy 0 lint.
- 기존 경고(내 코드 아님, drive-by 수정 안 함): models/mod.rs ts-rs "failed to parse serde attribute"(skip_serializing_if) — 런타임 매크로 노이즈, clippy lint 아님. CI(code-check.yml)는 cargo check만 돌려 무관.

## WORK ORDER
| # | 단위 | status | 비고 |
|---|---|---|---|
| 1 | 베이스라인(ledger·vitest·rust test 골격) | **done** | vitest 도입, `test` 스크립트, validate.test.ts(normalize-drop 회귀), tests/smoke.rs |
| 2 | storage/ (경로해석·atomic write·space read) | **done** | safe_join(.. /절대/null 차단)·write_atomic(tmp→fsync→rename)·list_files/read_to_string/ensure_dir. 단위테스트 10. notify watcher(§3)는 #2 밖→보류 |
| 3 | commands/ + src/lib/ipc.ts (IPC surface) | todo | spec: 20-backend/ipc-api.md. 타입은 models/mod.rs·src/lib/generated/*만 |
| 4 | seed/ (AI 6 concept + relation 5↑ 실제 파일) | todo | spec 문서 없음 → acceptance §9 + e2e 시나리오1에서 도출 |
| 5 | 프론트 ipc 래퍼 + Inbox 화면(첫 진입) | todo | spec: 40-frontend/screens/inbox.md, architecture.md |
| 6 | Workspace 화면(Subject·카운트) | todo | |
| 7 | import 파이프라인(TS 서비스, ImportJob 상태기계) | todo | parsing→archiving→llm→writing→completed. src/llm 어댑터 호출 |
| 8 | pdf/ extract_pdf_text(page 단위) | todo | 라이브러리 미결 → 결정 시 아래 로그 |
| 9 | MarkdownEditor 화면(read/write·저장·복원) | todo | |
| 10 | WikiView 화면(Concept 중심) | todo | |
| 11 | GraphView 화면(node/edge·클릭·필터·검색) | todo | spec 없음 → acceptance §6 + e2e 6·7 |
| 12 | wikilink/embed 렌더 컴포넌트 | todo | spec: 40-frontend/components/* |
| 13 | packaging(.dmg/.pkg) | todo | GUI/설치는 manual |

## 이미 구현된 것 (기존 코드, 재작성 금지)
- `src/llm/*` — 3-provider 어댑터(local/openai/gemini) + validate.ts(normalize-drop) + eval 러너.
- `src-tauri/src/models/mod.rs` — 엔티티 struct(ts-rs). `src/lib/generated/*` — 생성된 TS 타입.
- `src-tauri/src/llm_sidecar/mod.rs` — llama-server sidecar lifecycle.
- IPC: `get_workspace`, `llm_sidecar_status`만 등록됨(lib.rs).

## MANUAL VERIFY (헤드리스로 못 닫음 — 사람 확인)
- 실제 LLM 호출(Free=llama-server+Gemma GGUF / Premium=API 키): acceptance §3.1~3.3, e2e 2·3·8·9·10
- GUI 클릭/렌더(Graph 클릭·필터, embed preview, 편집기): acceptance §6·§7·§2.3, e2e 5·6·7
- OCR 이미지→텍스트: acceptance §5, e2e 4
- `.dmg`/`.pkg` 빌드·설치: acceptance §8, e2e 11
- (자동테스트로 덮는 로직은 done 처리; 위는 코드 구현 후 "구현됨, 수동확인 필요"로 남김)

## 설계 결정 로그
- 2026-06-30: 테스트 러너 = vitest(TS), cargo test(Rust). e2e(Playwright 등)는 GUI라 MANUAL 처리, 자동화는 post.
- 2026-06-30(#2): storage가 tokio::fs 의무(storage-io.md §2.3) → Cargo에 tokio(fs,io-util,rt,macros) + tempfile(dev) 추가. storage는 엔티티 무관(byte/string·경로만 주고받음); relations.json serde는 import/ 계층 몫.
- 2026-06-30(#2): storage §3 외부수정감지(notify watcher)는 #2 범위 밖 → 보류. 필요 시 별도 단위로.
- 2026-06-30 ⚠HAZARD: 인터럽트 시 'epitaxy' 도구가 feat/mvp-build→main 전환 + 미커밋 변경 stash함. ORIENT 브랜치체크로 복구(git checkout feat/mvp-build → git stash pop). 교훈: 게이트 green 되면 즉시 커밋해 stash 유실 위험 최소화.

## NEXT
→ WORK ORDER #3: commands/ + src/lib/ipc.ts. ipc-api.md 🔜 command 구현 + lib.rs invoke_handler 등록 + TS 래퍼. storage 모듈(safe_join/write_atomic/list_files) 활용. 데모 핵심 경로 우선: save_source → save_wiki_page + save_relations → list_wiki_pages/read_wiki_page → list_relations. 페이로드 타입은 models/mod.rs·src/lib/generated/*만.
