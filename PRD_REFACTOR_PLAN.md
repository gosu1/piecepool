# PRD 리팩토링 Plan

> 본 문서는 **PiecePool PRD.md (1152줄 모놀리식)** 를 4개 역할(Backend / Frontend / 로컬+API 하이브리드 LLM / Figma UI·UX) 협업용 다중 문서 구조로 재편하기 위한 실행 계획이다.
>
> 산출물은 본 plan만. 실제 분할 작업은 다음 턴.

---

## 0. 의사결정 요약 (확정)

| 항목 | 결정 |
|---|---|
| LLM provider 방향 | **하이브리드** (Local + OpenAI 둘 다 지원, adapter 패턴) |
| 기존 PRD.md 처리 | **archive 이동** → `docs/archive/PRD-v1.md`, 새 구조로 완전 대체 |
| 문서 언어 | **한국어 유지** (식별자·타입명·코드만 영문) |
| 이번 턴 산출물 | **Plan 문서만** |

---

## 1. 현재 진단

### 1.1 정량
- PRD.md = **1152줄, 18개 절**, 31KB
- DEVELOPER_HANDOFF.md = 147줄
- mvp.md = **0줄 (빈 파일)** — 의도 불명
- README.md = 10줄 (단순 진입 안내)

### 1.2 정성 문제

| 문제 | 영향 |
|---|---|
| 비전·데이터모델·화면·검증·후속이 한 파일에 혼재 | 역할별 필요 정보 격리 불가 |
| TS 타입 9종이 본문 중간에 인라인 | Figma 디자이너 진입 장벽 |
| Workspace 폴더 구조가 §7, §9, §11에 분산 중복 | 변경 시 표류 위험 |
| RelationType enum 12종이 §8.8 안에만 정의 | 시각화/검증 다른 절에서 hard reference 어려움 |
| LLM 요구가 §10 단일 절 | 프롬프트/스키마/provider 분리 불가 |
| OpenAI `gpt-5-mini` 가정만 존재 | **로컬 LLM 추가**(결정사항) 시 전면 재구성 필요 |

### 1.3 핵심 모순 (해소 필요)
- HANDOFF는 `OPENAI_API_KEY` 환경변수만 명시 → 하이브리드 결정에 따라 `PIECEPOOL_LLM_PROVIDER` 추가 필요

---

## 2. 목표 구조

### 2.1 디렉토리 트리

```text
piecepool/
  README.md                       # 진입점 (역할별 경로 1-click)
  DEVELOPER_HANDOFF.md            # 갱신: 새 docs/ 트리 가리킴
  docs/
    archive/
      PRD-v1.md                   # 기존 PRD 보존 (read-only)
      mvp.md                      # 빈 파일 archive (또는 삭제)
    00-overview/                  # 모두 읽음
      README.md                   # docs 전체 nav + 역할별 진입 경로
      vision.md                   # 제품 정의, 핵심 사용자, 장기 시나리오
      scope-mvp.md                # MVP 포함/제외, 완료 기준
      glossary.md                 # 용어 (Workspace, KnowledgeSpace, Subject, Concept, WikiPage, Relation, Evidence...)
      open-questions.md           # 구현 계획에서 결정할 항목
    10-contracts/                 # 🔒 SINGLE SOURCE — 모든 역할 공유
      README.md                   # 계약 변경 절차 안내
      workspace-layout.md         # 폴더 트리 + <space>/* 규약
      entities.md                 # 모든 TS 타입 (Workspace ~ ImportJob 11종)
      relation-types.md           # 12개 RelationType enum + 의미·사용 기준
      markdown-frontmatter.md     # archive/wiki frontmatter 스키마
      wikilink-embed.md           # [[...]] / ![[...]] 문법 규약
      llm-output-schema.md        # LlmWikiResult JSON Schema (provider 무관)
    20-backend/                   # Owner: Backend
      README.md
      architecture.md             # Tauri + Rust, 모듈 경계
      storage-io.md               # 파일 atomic write, 경로 해석, 충돌
      pdf-extraction.md           # PDF → text 파이프라인
      import-pipeline.md          # Inbox → archive → LLM → wiki/relations
      import-job-states.md        # ImportJobStatus 전이 다이어그램
      ipc-api.md                  # Tauri command (frontend 호출용)
      seed-data.md                # Seed 생성 절차/데이터 정의
      error-handling.md           # PDF/LLM/저장/embed/relation 오류 처리
    30-llm/                       # Owner: LLM 개발자
      README.md
      provider-config.md          # 하이브리드 adapter, 환경변수, fallback
      prompt-templates.md         # system/user 프롬프트 (한국어/영어)
      output-validation.md        # schema 검증 + 재시도 + 부분 실패
      evals.md                    # 골든 케이스, 회귀 방지
    40-frontend/                  # Owner: Frontend
      README.md
      architecture.md             # React 라우팅, 상태 관리, IPC 호출 패턴
      screens/
        workspace.md
        import.md
        markdown-editor.md
        wiki-view.md
        graph-view.md
      components/
        embed-renderer.md         # ![[...]] PDF/이미지 inline preview
        wikilink.md               # [[...]] 링크 렌더링
        graph-canvas.md           # node/edge 인터랙션
    50-design/                    # Owner: Figma 디자이너
      README.md
      screen-inventory.md         # 화면 카드 (스크린샷 placeholder + 인터랙션 요약)
      user-flows.md               # Mermaid sequence (Import / Edit / Graph 탐색)
      component-states.md         # 빈/로딩/에러/성공 매트릭스
      design-tokens.md            # RelationType 색상, edge 두께·강도 시각화 규칙
      handoff-checklist.md        # Figma → 코드 인수인계 절차
    60-qa/                        # Owner: QA / PM
      README.md
      acceptance-criteria.md      # 검증 기준 (Workspace/Markdown/LLM/PDF/Graph/Seed)
      e2e-scenarios.md            # smoke test 시나리오
    70-roadmap/                   # Owner: PM
      README.md
      post-mvp.md                 # OCR, 장기 지식 지도, Today Task, Project Flow, 저장 확장, Relation scoring
```

### 2.2 파일 크기 목표
- 한 파일 **200줄 이하** (스키마/표 위주 파일은 예외 명시 가능)
- 한 화면 = 한 파일
- 한 엔티티 그룹 = 한 파일

---

## 3. 역할별 필독 매트릭스

| 역할 | 필독 (always) | 참고 (on demand) | 작성 권한 |
|---|---|---|---|
| **Backend** | 00, 10, 20 | 30 (schema), 60 | 20 |
| **LLM** | 00, 10, 30 | 20 (pipeline 연동) | 30 |
| **Frontend** | 00, 10, 40, 50 | 20 (IPC), 60 | 40 |
| **Figma 디자이너** | 00 (vision/scope만), 50 | 40 screens (시각 요구만) | 50 |
| **QA / PM** | 00, 60 | 전체 | 00, 60, 70 |

**규칙**: 디자이너는 10-contracts/entities.md 직접 안 봐도 됨. 50-design 문서가 필요 시 "엔티티 명세 → [link]"만 둠.

---

## 4. PRD §1~18 → 새 구조 매핑 (100% coverage)

| PRD 절 | 줄 범위 | 새 경로 | 비고 |
|---|---|---|---|
| §1 문서 목적 | 3-9 | 00-overview/README.md | 압축 |
| §2 제품 정의 | 11-17 | 00-overview/vision.md | |
| §3 핵심 사용자/시나리오 | 19-37 | 00-overview/vision.md | 같은 파일 합본 |
| §4 MVP 목표 | 39-58 | 00-overview/scope-mvp.md | |
| §5 MVP 제외 | 60-73 | 00-overview/scope-mvp.md | 같은 파일 |
| §6 기술 방향 | 75-93 | 20-backend/architecture.md + 40-frontend/architecture.md | 분리 |
| §7 Workspace 구조 (서두) | 95-129 | 10-contracts/workspace-layout.md | |
| §7.1 지식 영역 폴더 | 131-141 | 10-contracts/workspace-layout.md | |
| §7.2 inbox | 143-156 | 10-contracts/workspace-layout.md | |
| §7.3 archive | 158-169 | 10-contracts/workspace-layout.md | |
| §7.4 wiki | 171-229 | 10-contracts/workspace-layout.md + 10-contracts/wikilink-embed.md | embed 규약은 분리 |
| §7.5 relations | 231-235 | 10-contracts/workspace-layout.md | |
| §7.6 sources | 237-258 | 10-contracts/workspace-layout.md | |
| §7.7 config | 260-268 | 10-contracts/workspace-layout.md | |
| §8.1~8.7 엔티티 | 270-450 | 10-contracts/entities.md | TS 타입 통합 |
| §8.7.1 SourceRef | 404-438 | 10-contracts/entities.md | |
| §8.8 Relation | 452-486 | 10-contracts/entities.md + 10-contracts/relation-types.md | enum 분리 |
| §8.9 Evidence | 488-505 | 10-contracts/entities.md | |
| §8.10 Question | 507-522 | 10-contracts/entities.md | |
| §8.11 ImportJob | 524-547 | 10-contracts/entities.md | |
| §9 Import 흐름 (공통) | 549-567 | 20-backend/import-pipeline.md | |
| §9.1 텍스트 입력 | 569-581 | 20-backend/import-pipeline.md | |
| §9.2 수업 정리 텍스트 | 583-587 | 20-backend/import-pipeline.md | |
| §9.3 PDF 입력 | 589-607 | 20-backend/pdf-extraction.md + 20-backend/import-pipeline.md | |
| §9.4 이미지 입력 | 609-630 | 70-roadmap/post-mvp.md (OCR 절) + 20-backend/import-pipeline.md (진입점만) | |
| §10 LLM 요구 | 632-678 | 30-llm/output-validation.md + 30-llm/prompt-templates.md + 10-contracts/llm-output-schema.md | LlmWikiResult는 계약 |
| §11.1 Markdown 편집기 | 682-695 | 40-frontend/screens/markdown-editor.md | |
| §11.2 Frontmatter | 697-750 | 10-contracts/markdown-frontmatter.md | |
| §11.3 Wiki 링크/embed | 752-774 | 10-contracts/wikilink-embed.md | |
| §12.1 Node | 781-792 | 40-frontend/screens/graph-view.md + 40-frontend/components/graph-canvas.md | |
| §12.2 Edge | 794-805 | 40-frontend/screens/graph-view.md | |
| §12.3 시각 표현 | 807-828 | 50-design/design-tokens.md + 40-frontend/components/graph-canvas.md | |
| §12.4 Graph 조작 | 830-840 | 40-frontend/screens/graph-view.md | |
| §13.1 Workspace 화면 | 844-863 | 40-frontend/screens/workspace.md + 50-design/screen-inventory.md | |
| §13.2 Source 가져오기 | 865-883 | 40-frontend/screens/import.md + 50-design/screen-inventory.md | |
| §13.3 Markdown 편집기 | 885-900 | 40-frontend/screens/markdown-editor.md | |
| §13.4 Wiki View | 902-918 | 40-frontend/screens/wiki-view.md | |
| §13.5 Graph View | 920-935 | 40-frontend/screens/graph-view.md | |
| §14 Seed 데이터 | 937-964 | 20-backend/seed-data.md | |
| §15.1~15.6 오류 처리 | 966-1012 | 20-backend/error-handling.md + 50-design/component-states.md (UI 부분) | |
| §16.1~16.6 검증 기준 | 1014-1062 | 60-qa/acceptance-criteria.md | |
| §17.1 OCR | 1066-1085 | 70-roadmap/post-mvp.md | |
| §17.2 장기 지식 지도 | 1087-1101 | 70-roadmap/post-mvp.md | |
| §17.3 Today Task | 1103-1112 | 70-roadmap/post-mvp.md | |
| §17.4 Project Flow | 1114-1115 | 70-roadmap/post-mvp.md | |
| §17.5 저장 구조 확장 | 1117-1126 | 70-roadmap/post-mvp.md | |
| §17.6 Relation scoring | 1128-1140 | 70-roadmap/post-mvp.md | |
| §18 결정할 항목 | 1142-1152 | 00-overview/open-questions.md | |

**검증**: 위 매핑 표가 PRD 1152줄 100% cover (절 누락 0). 분할 작업 시 매핑 미달 = 즉시 중단.

---

## 5. Single Source 원칙 (필수 규약)

### 5.1 SSOT 5개

| 자산 | 위치 | 사본 금지 |
|---|---|---|
| 엔티티 TS 타입 | `10-contracts/entities.md` | 다른 곳에 `type X = {...}` 재정의 금지 |
| RelationType enum | `10-contracts/relation-types.md` | 12개 값을 코드/문서 어디에도 복붙 금지, link만 |
| Workspace 폴더 트리 | `10-contracts/workspace-layout.md` | 트리 그림 중복 금지 |
| Markdown frontmatter 스키마 | `10-contracts/markdown-frontmatter.md` | 다른 곳에 frontmatter 예시 추가 시 link 의무 |
| LLM 출력 JSON Schema | `10-contracts/llm-output-schema.md` | provider별 raw도 여기서 정규화 |

### 5.2 계약 변경 절차
1. `10-contracts/` 파일 수정 PR
2. PR 라벨 `contracts-change` 필수
3. 4개 역할 owner 모두 review 승인 필요
4. merge 후 의존 문서(20/30/40/50) 동기화 PR을 후속 작업으로 trace

### 5.3 다른 폴더의 link 규칙
- 엔티티 언급 시: `[Source](../10-contracts/entities.md#source)` 형식
- RelationType 값 언급 시: `[part_of](../10-contracts/relation-types.md#part_of)` 형식
- 본문에 TS 코드블록 복붙 금지 (계약 표류 1순위 원인)

---

## 6. 하이브리드 LLM 설계 (신규 작업)

PRD가 OpenAI 단일 가정이므로 본 리팩토링이 **추가 설계 필요**.

### 6.1 환경변수 (신규)

```bash
# 공통
PIECEPOOL_LLM_PROVIDER=openai|local   # 기본 openai
PIECEPOOL_LLM_MODEL=...               # provider별 기본값 존재

# openai일 때만
OPENAI_API_KEY=...

# local일 때만
PIECEPOOL_LOCAL_LLM_ENDPOINT=http://localhost:11434  # Ollama 기본
PIECEPOOL_LOCAL_LLM_BACKEND=ollama|mlx|llamacpp      # 기본 ollama
```

### 6.2 adapter 인터페이스 (30-llm/provider-config.md에 정의)

```ts
interface LlmProvider {
  id: "openai" | "local";
  generateWikiStructured(input: LlmWikiInput): Promise<LlmWikiResult>;
}
```

- `LlmWikiResult` 자체는 `10-contracts/llm-output-schema.md` 소유 (provider 무관)
- provider별 raw → 공통 schema 변환은 `30-llm/output-validation.md` 책임
- fallback 정책: local 실패 시 openai 자동 fallback 여부는 `provider-config.md`에서 결정 (기본은 fallback 없음, 사용자 명시 재시도)

### 6.3 프롬프트 분리
- system prompt: provider 무관 공통 (한국어 학습 컨텍스트)
- user prompt: Source 내용 주입
- 둘 다 `30-llm/prompt-templates.md`에 버전 관리 (v1, v2 ...)

---

## 7. Figma 디자이너 친화 장치 (50-design 설계)

### 7.1 원칙
- TS 타입/코드 직접 노출 **금지**
- 필요 시 "→ 계약 명세는 10-contracts/* 참조" 1줄 링크만
- 문서 형식: 표 + Mermaid + 스크린샷 placeholder 중심

### 7.2 파일별 책임

| 파일 | 핵심 내용 |
|---|---|
| screen-inventory.md | 5개 화면 카드 (Workspace/Import/Editor/Wiki/Graph). 각 카드: 목적, 핵심 인터랙션 3-5개, 진입 경로, 종료 경로, Figma 파일 링크 placeholder |
| user-flows.md | Mermaid sequence: ① Import 흐름 (text/PDF) ② Edit 흐름 (wiki 수정→저장) ③ Graph 탐색 (search→node click→edge click) |
| component-states.md | 매트릭스: 화면 × {빈/로딩/성공/에러/충돌}. 각 셀에 디자인 요구 |
| design-tokens.md | RelationType 12종 색상표, edge 두께 공식 `width = f(strength)`, 강도별 거리 `getLinkDistance(strength)` 노출 (코드 아닌 표) |
| handoff-checklist.md | Figma 컴포넌트 → React 인수인계 절차 (네이밍, 자산 export 형식, 토큰 동기화) |

### 7.3 Frontend↔Designer 양방향 검토
- 40-frontend/screens/* 변경 시 50-design/screen-inventory.md 동기화 PR
- 50-design/design-tokens.md 변경 시 40-frontend가 Tailwind config/CSS variable 갱신

---

## 8. 실행 순서 (단계별)

> 각 단계 끝에서 git commit. 한 단계 = 한 PR 원칙.

### Phase 1: 골격
1. `docs/archive/` 생성 → `git mv PRD.md docs/archive/PRD-v1.md`, `git mv mvp.md docs/archive/mvp.md`
2. `docs/00-overview/ ~ 70-roadmap/` 디렉토리 생성 + 각 `README.md` placeholder
3. 루트 `README.md` 갱신 (새 docs 트리 가리킴)
4. 검증: `docs/archive/PRD-v1.md` 존재 + 새 디렉토리 8개 모두 생성

### Phase 2: SSOT 먼저 (10-contracts)
5. `workspace-layout.md` 작성 (PRD §7 통합)
6. `entities.md` 작성 (PRD §8.1~8.7, 8.9~8.11)
7. `relation-types.md` 작성 (PRD §8.8에서 enum 분리)
8. `markdown-frontmatter.md` 작성 (PRD §11.2)
9. `wikilink-embed.md` 작성 (PRD §7.4 일부 + §11.3)
10. `llm-output-schema.md` 작성 (PRD §10에서 schema만)
11. 검증: 모든 PRD 인용이 새 파일로 cover. 새 파일에서 PRD-v1 라인 번호 trace 가능

### Phase 3: 00-overview (모두의 진입점)
12. `vision.md` (PRD §2+§3)
13. `scope-mvp.md` (PRD §4+§5)
14. `glossary.md` (신규 — 용어 정의)
15. `open-questions.md` (PRD §18 + 하이브리드 LLM 추가 결정 사항)
16. `README.md` (역할별 진입 경로 nav)

### Phase 4: 역할별 (병렬 가능)
17. **20-backend**: architecture, storage-io, pdf-extraction, import-pipeline, import-job-states, ipc-api, seed-data, error-handling
18. **30-llm**: provider-config (하이브리드 신규), prompt-templates, output-validation, evals
19. **40-frontend**: architecture, screens/* 5개, components/* 3개
20. **50-design**: screen-inventory, user-flows, component-states, design-tokens, handoff-checklist

### Phase 5: 마무리
21. **60-qa**: acceptance-criteria (PRD §16), e2e-scenarios
22. **70-roadmap**: post-mvp (PRD §17 통합)
23. `DEVELOPER_HANDOFF.md` 갱신 (새 docs 경로, 하이브리드 env vars, 환경변수 안내)
24. 깨진 link 전수 검사 (스크립트 또는 수동)
25. 4개 역할 sign-off (각 owner 폴더 review)

---

## 9. 검증 기준 (refactor 자체)

| 기준 | 측정 |
|---|---|
| 매핑 완전성 | PRD §1~§18 모든 절이 매핑 표에 존재 ✓ (이미 §4에서 완료) |
| SSOT 준수 | 10-contracts 외에 `type X = ` 정의 0건 (grep) |
| 파일 크기 | 평균 < 200줄, 최대 < 400줄 (스키마 파일 예외 명시) |
| 역할 진입성 | 각 역할 필독 3~4개 파일 안에서 작업 착수 가능 |
| 깨진 링크 | `markdown-link-check` 0건 |
| PRD-v1 보존 | `docs/archive/PRD-v1.md` git history 추적 가능 |
| 하이브리드 LLM | `30-llm/provider-config.md`에 openai+local 두 adapter 명시 |

---

## 10. 위험 & 대응

| 위험 | 대응 |
|---|---|
| 분할 중 정보 누락 | §4 매핑 표 100% cover 강제, Phase 2 끝나면 PRD-v1과 diff 점검 |
| 계약 표류 | §5 SSOT 원칙 + `contracts-change` PR 라벨 |
| Figma↔코드 불일치 | design-tokens.md를 양쪽 SSOT, 후속에 자동 생성 검토 |
| 로컬 LLM 품질 차이 | 30-llm/evals.md에 골든 케이스 필수, schema 엄격 |
| 외부에서 PRD.md 직접 link 깨짐 | `docs/archive/PRD-v1.md` 상단에 "이 문서는 archive. 최신은 루트 `README.md` 참조" 안내 |
| 한국어 문서 + 영문 코드 충돌 | 식별자/타입명/enum 값은 영문 유지, 본문 설명만 한국어. 표 머리글도 한국어 |
| `mvp.md` 빈 파일 의도 불명 | archive로 보존 (삭제 X). 의도 확인 후 후속 처리 |

---

## 11. 후속 (이 plan 이후)

- **다음 턴**: Phase 1 (디렉토리 골격) 실행
- 그 다음: Phase 2 (10-contracts SSOT) — 가장 중요, 다른 역할 작업 unblock
- Phase 4 (역할별)는 병렬 진행 가능 — 서준이 혼자 작업할 경우 우선순위 = backend > frontend > llm > design
- 본 plan은 refactor 완료 후 `docs/archive/` 또는 삭제

---

## 12. Plan에 대한 열린 질문 (서준 확인 필요)

1. **`mvp.md` 빈 파일**: 삭제 vs archive 보존 vs 의도 명세 추가 중?
2. **로컬 LLM 기본 backend**: Ollama 기본 가정인데 MLX/llama.cpp 우선 순위 다른가?
3. **Figma 파일 URL**: 50-design에 placeholder만 둘지, 실제 Figma 파일이 이미 있는지?
4. **`docs/superpowers/plans/tasks` 파일**: 본 refactor와 별개로 유지? 새 구조로 통합?
5. **자동 검증 도구**: `markdown-link-check`, `prettier --check`, grep 기반 SSOT 검사 등 CI 도입할지?

위 5개는 다음 턴 Phase 1 들어가기 전 결정 필요.

---

**[Fact-check]**
- PRD §1~§18 라인 번호: 직접 Read 결과 기반 (line 3-1152). 매핑 표 항목별 라인 범위는 PRD 본문 직접 인용
- DEVELOPER_HANDOFF.md `OPENAI_API_KEY` 명시: line 84-91 확인
- mvp.md 0줄: Read 도구 "file is shorter than offset 1, has 1 lines" 응답
- 하이브리드 LLM 환경변수/adapter 인터페이스: 본 plan 신규 제안 (PRD에 없음, 결정사항 기반 설계)
- `docs/superpowers/plans/tasks` 파일 존재: `find docs/` 결과 확인. 내용은 미확인
- 정확성: 매핑 표는 PRD 절 제목과 1:1 대응. 추측 0
