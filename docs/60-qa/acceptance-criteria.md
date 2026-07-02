# Acceptance Criteria (MVP)

MVP 합격선. **모든 항목이 통과해야 MVP 완료**다.

> 본 문서는 [`docs/archive/PRD-v1.md`](../archive/PRD-v1.md) §16 (line 1014-1062)을 분리·확장하고, 서준의 신규 결정사항(OCR MVP 흡수, packaging)을 반영한 결과다.

---

## 1. Workspace

- [ ] 앱이 단일 로컬 Workspace를 생성하거나 열 수 있다
- [ ] `<space>/{inbox, archive, wiki, relations, sources, config}` 디렉토리를 읽을 수 있다 ([workspace-layout](../10-contracts/workspace-layout.md))
- [ ] 앱 재실행 후 이전 상태(열린 문서, 검색어, Subject 필터)가 복원된다
- [ ] 여러 KnowledgeSpace 폴더(`deeplearning/`, `operating-systems/` 등)를 동시에 인식한다
- [ ] Subject 메타데이터가 `<space>/config/subjects.json`에서 로드된다

---

## 2. Markdown 파일

### 2.1 ArchiveNote
- [ ] 텍스트 입력 시 `<space>/archive/*.md` 파일이 생성된다
- [ ] PDF 가져오기 시 추출 텍스트가 `<space>/archive/*.md`로 저장된다
- [ ] OCR 결과 텍스트가 `<space>/archive/*.md`로 저장된다 (**OCR 신규 MVP 흡수**)
- [ ] LLM 결과가 archive 노트를 덮어쓰지 **않는다**
- [ ] Frontmatter가 [markdown-frontmatter §2](../10-contracts/markdown-frontmatter.md#2-archivenote)에 부합

### 2.2 WikiPage
- [ ] LLM 결과가 `<space>/wiki/*.md` 파일을 생성하거나 업데이트한다
- [ ] frontmatter에 `sourceRefs`가 저장된다
- [ ] 본문에 `![[파일.pdf#page=N]]` embed가 저장될 수 있다
- [ ] 편집기에서 수정한 wiki page가 실제 파일에 저장된다
- [ ] 앱 재실행 후 수정 내용이 유지된다
- [ ] Frontmatter가 [markdown-frontmatter §3](../10-contracts/markdown-frontmatter.md#3-wikipage)에 부합

### 2.3 Wikilink / Embed
- [ ] `[[파일]]` 링크가 클릭 가능하고 원본 파일을 연다
- [ ] `![[파일.pdf#page=N]]`가 해당 PDF page preview로 렌더링된다
- [ ] `![[이미지.png]]`가 이미지 inline preview로 렌더링된다
- [ ] 깨진 link는 시각 표식 + tooltip으로 표시 (전체 렌더링 실패 X)
- [ ] `sourceRefs` vs 본문 embed 충돌 시 자동 삭제·덮어쓰기 X, 사용자에게 충돌 상태 표시

---

## 3. LLM 처리 (OpenAI)

### 3.1 공통
- [ ] 텍스트 source가 실제 LLM 호출을 발생시킨다
- [ ] PDF 추출 텍스트가 실제 LLM 호출을 발생시킨다
- [ ] OCR 결과 텍스트가 실제 LLM 호출을 발생시킨다
- [ ] LLM 출력이 [llm-output-schema](../10-contracts/llm-output-schema.md) JSON Schema 통과
- [ ] Concept / WikiPage / Relation / Evidence / SourceRef가 LLM 출력에서 생성된다
- [ ] LLM 생성 WikiPage가 사용자 친화 설명 + 구조화 메타데이터 동시 보유

### 3.2 OpenAI
- [ ] `OPENAI_API_KEY`로 OpenAI 호출 성공
- [ ] LLM 출력이 `LlmWikiResult` schema 통과 ([evals](../30-llm/) 입증)
- [ ] 되묻기 round-trip 작동 (`PIECEPOOL_CLARIFY=true`)
- [ ] Fact-check 기본 흐름 작동 (웹 검색 → `evidence[].reason`에 URL 누적)

### 3.3 검증 규칙
- [ ] `related_to` 비율이 응답 전체 relation의 50% 초과 시 경고 로그
- [ ] 노드 호환성 매트릭스 위반 시 reject
- [ ] 부분 실패 시 유효 부분만 저장, 무효 부분은 ImportJob에 기록

---

## 4. PDF 파싱

- [ ] PDF 파일을 선택할 수 있다 (Inbox 또는 import 화면)
- [ ] 원본 PDF가 `<space>/sources/original-files/`에 보존된다
- [ ] PDF에서 텍스트가 추출된다
- [ ] 추출 텍스트가 `<space>/archive/*.md`로 저장된다
- [ ] Wiki에서 `![[파일.pdf#page=N]]`가 해당 page preview로 렌더링된다
- [ ] 파싱 실패 시 복구 흐름 제공 (원본 보존 + 사용자 텍스트 직접 입력)

---

## 5. OCR (MVP 신규 흡수)

- [ ] 이미지 파일 (PNG/JPG/JPEG/WebP) 입력 가능
- [ ] 필기 사진 → 텍스트 변환 통과 (한국어 + 영어)
- [ ] 칠판 사진 / 강의 슬라이드 스크린샷 → 텍스트 변환 통과
- [ ] OCR 결과가 `<space>/archive/*.md`로 저장
- [ ] 원본 이미지가 `<space>/sources/original-files/`에 보존
- [ ] OCR 실패 시 사용자에게 명시 (실패 메시지 + 직접 입력 fallback)

---

## 6. Graph View

- [ ] Graph가 `<space>/wiki/` + `<space>/relations/` 메타데이터에서 렌더링된다
- [ ] Node 클릭 시 연결된 `<space>/wiki/` 또는 `<space>/archive/` 문서가 열린다
- [ ] Edge 클릭 시 relation 상세 패널이 열린다
- [ ] 패널에 RelationType, strength, confidence, explanation, evidence가 표시된다
- [ ] Subject 필터가 node/edge 범위를 바꾼다
- [ ] 검색이 graph 표시 범위를 좁힌다
- [ ] RelationType 필터가 edge 종류를 제한한다
- [ ] 시각 표현: 타입별 색상 ([design-tokens](../50-design/)), 강도별 두께/거리

---

## 7. 화면 (Frontend)

- [ ] **첫 진입 = Inbox** 화면 (서준 결정 반영)
- [ ] Workspace 화면에 Subject 목록, archive/wiki/concept/relation 카운트 표시
- [ ] Markdown 편집기에서 archive/wiki 둘 다 편집 가능
- [ ] Wiki View가 Concept 중심 탐색 지원
- [ ] Graph View가 정적 이미지가 아닌 실제 클릭/필터/검색 작동
- [ ] 되묻기·fact-check 토글이 기본 on으로 동작 ([pricing-model](../00-overview/pricing-model.md))

---

## 8. 배포

- [ ] `.dmg` 또는 `.pkg` 빌드 산출물 생성 (`npm run build` 또는 동등)
- [ ] 빌드된 산출물이 macOS에서 설치 가능
- [ ] 첫 실행 시 Seed 데이터 자동 로드

---

## 9. Seed 데이터

- [ ] 첫 실행 Workspace에 AI, 운영체제, 자료구조 예시가 들어 있다
- [ ] Seed 데이터가 실제 Markdown 파일 + 메타데이터로 존재 (UI 하드코딩 X)
- [ ] 사용자가 자료를 넣기 전에도 Graph View를 확인할 수 있다
- [ ] Seed가 AI 대표 concept 6종 + Relation 5종 이상 포함 (PRD §14 기준)

---

## 10. 테스트

- [ ] `npm test` 통과
- [ ] `npm run build` 통과
- [ ] `npm run e2e` 통과
- [ ] `cargo test` 통과
- [ ] `cargo check` 통과
- [ ] CI docs-check workflow 통과 (link / SSOT / prettier)

---

## 11. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §16에서 분리·정렬한 결과다.
- §3 (OpenAI), §5 (OCR MVP), §7 첫 진입=Inbox, §8 (packaging), §10 CI 항목은 본 리팩토링 신규 결정사항이다.
