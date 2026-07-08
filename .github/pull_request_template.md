## 요약

<!-- 이 PR이 무엇을 변경하는지 1-2문장 -->

## 영향 영역

- [ ] `docs/00-overview/`
- [ ] `docs/10-contracts/` ⚠️ **SSOT 변경** — `contracts-change` 라벨 부착 + 4개 역할(Backend/Frontend/LLM/Design) review 필수
- [ ] `docs/20-backend/`
- [ ] `docs/30-llm/`
- [ ] `docs/40-frontend/`
- [ ] `docs/50-design/`
- [ ] `docs/60-qa/`
- [ ] `docs/70-roadmap/`
- [ ] 코드 (src, src-tauri 등)
- [ ] 메타 (README, .github, CONTRIBUTING, docs 등)

## Phase

- [ ] Phase 1 (Skeleton)
- [ ] Phase 2 (SSOT)
- [ ] Phase 3 (Overview)
- [ ] Phase 4 (Roles)
- [ ] Phase 5 (QA & Roadmap)
- [ ] 범위 외

## 체크리스트

- [ ] 큰 변화(기능·피벗·확정 결정)면 [`docs/00-overview/journey.md`](../docs/00-overview/journey.md) 타임라인에 한 줄 추가 (보고서·PPT 원재료 — 머지 전에!)
- [ ] SSOT 원칙 준수: TS 타입/enum/JSON Schema가 `docs/10-contracts/` 외에 복붙되지 않음
- [ ] 변경된 모든 라인이 본 PR 목표와 직접 연결됨 (무관한 리팩터링 없음)
- [ ] 깨진 link 없음 (가능한 경우 markdown-link-check 실행)
- [ ] (contracts 변경 시) 의존 문서 동기화 PR을 issue로 trace
- [ ] UI/UX 변경이면 비포·애프터 스크린샷 첨부 (해당 없으면 skip)

## 검증

<!-- 어떻게 검증했는가. 명령어/스크린샷/체크리스트 등 -->

## 관련 이슈

Closes #
