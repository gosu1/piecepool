# E2E Smoke Test Scenarios

End-to-end 시나리오. 각 시나리오는 사용자 관점 1회 흐름이며, 통과 시 [acceptance-criteria](acceptance-criteria.md) 해당 항목을 체크할 수 있다.

> 본 문서는 PRD-v1에 없던 신규 자산이다. MVP 출시 직전 수동·자동 양쪽으로 실행 가능해야 한다.

---

## 시나리오 1: 첫 실행 + Seed

**전제**: 깨끗한 환경 (Workspace 미생성).

**흐름**:
1. 앱 실행
2. Workspace 생성 (또는 자동 생성)
3. Seed 데이터 자동 로드
4. Graph View 열기

**검증**:
- AI / 운영체제 / 자료구조 Subject 3종 존재
- AI concept 6종 이상 (Transformer, Self-Attention, Multi-Head Attention, Attention Head, Embedding, Backpropagation)
- Relation 5종 이상 (Self-Attention `part_of` Transformer 등)
- 첫 진입 화면 = **Inbox** (서준 결정)

**acceptance**: §1 Workspace, §9 Seed, §7 화면

---

## 시나리오 2: 텍스트 입력 → archive → wiki → graph

**전제**: `OPENAI_API_KEY` 환경변수 설정.

**흐름**:
1. Inbox에서 Subject 선택 (AI)
2. 텍스트 영역에 강의 정리 1단락 붙여넣기
3. "가져오기" 클릭
4. ImportJob 진행 (parsing → archiving → llm_processing → writing → completed)
5. 생성된 WikiPage 확인
6. Graph View로 이동, 새 Concept node 확인

**검증**:
- `<space>/archive/*.md` 신규 파일 1개 생성
- `<space>/wiki/*.md` 신규 파일 1개 이상 생성 (Concept 수만큼)
- `<space>/relations/relations.json` 갱신
- Graph에 새 node + edge 표시

**acceptance**: §2 Markdown, §3.1+3.2 LLM, §6 Graph

---

## 시나리오 3: PDF 입력 → 추출 → wiki

**전제**: PDF 파일 1개 (한국어 + 영어 혼합).

**흐름**:
1. Inbox에 PDF 드래그앤드롭
2. 원본 PDF 보존 확인 (`<space>/sources/original-files/`)
3. 텍스트 추출 (Backend)
4. archive 노트 생성
5. LLM 호출 → WikiPage 생성
6. WikiPage에서 `![[파일.pdf#page=N]]` embed 클릭

**검증**:
- 원본 PDF가 `<space>/sources/original-files/` 안에 존재
- archive 노트 frontmatter에 `originalFilePath` 포함
- WikiPage embed가 해당 PDF page preview로 렌더링
- embed 클릭 시 PDF 뷰어 열림

**acceptance**: §4 PDF 파싱, §2.3 Wikilink/Embed

---

## 시나리오 4: OCR 이미지 → wiki (MVP 신규)

**전제**: 필기 사진 또는 칠판 사진 1장.

**흐름**:
1. Inbox에 이미지 드래그앤드롭
2. OCR 진행
3. 추출 텍스트가 archive 노트로 저장
4. LLM 호출 → WikiPage 생성
5. WikiPage에 `![[이미지.png]]` embed 확인

**검증**:
- 원본 이미지가 `<space>/sources/original-files/` 안에 존재
- archive 노트에 OCR 텍스트 보존
- WikiPage에 이미지 embed 표시
- OCR 실패 시 사용자가 텍스트 직접 입력 fallback 가능

**acceptance**: §5 OCR, §2.1 ArchiveNote

---

## 시나리오 5: Wiki 편집 → 저장 → 재실행 복원

**흐름**:
1. WikiPage 편집기에서 본문 수정
2. 저장 (Cmd+S 또는 자동)
3. 앱 종료
4. 앱 재실행
5. 동일 WikiPage 열기

**검증**:
- 수정 내용이 실제 `.md` 파일에 반영
- 재실행 후 수정 내용 유지
- Frontmatter `updatedAt` 갱신

**acceptance**: §2.2 WikiPage

---

## 시나리오 6: Graph node 클릭 → 문서 open

**흐름**:
1. Graph View 열기
2. Concept node 클릭 → 대응 WikiPage 열림
3. Source node 클릭 → 대응 ArchiveNote 열림

**검증**:
- node 클릭 1회로 해당 문서 편집기 열림
- 편집기 진입 후 본문 read/write 가능

**acceptance**: §6 Graph View

---

## 시나리오 7: Graph edge 클릭 → 근거 패널

**흐름**:
1. Graph View에서 임의 edge 클릭
2. 상세 패널 등장
3. RelationType / strength / confidence / explanation / evidence 확인
4. evidence의 archive 발췌 또는 PDF page 미리보기 클릭

**검증**:
- 패널에 모든 필드 표시
- evidence 클릭 시 source 위치(archive line 또는 PDF page) 점프

**acceptance**: §6 Graph View

---

## 시나리오 8: OpenAI 호출 경로

**전제**: `OPENAI_API_KEY` 환경변수 설정.

**흐름**:
1. 신규 텍스트 input 실행
2. ImportJob이 OpenAI API 호출

**검증**:
- 호출 로그에 OpenAI endpoint 확인
- `OPENAI_API_KEY` 미설정 시 명확한 오류 메시지
- 생성된 WikiPage가 schema 통과

**acceptance**: §3.3 LLM 호출, §7 화면

---

## 시나리오 9: 되묻기 round-trip

**전제**: 의도적으로 불명확한 input (예: 단어 1개만).

**흐름**:
1. Inbox에 짧고 모호한 텍스트 입력
2. LLM 1차 응답 → Backend가 불확실 판정 (`confidence < 임계값`)
3. **되묻기 UI**가 사용자에게 재확인 질문 표시
4. 사용자가 추가 정보 입력
5. LLM 2차 호출 → WikiPage 생성

**검증**:
- 되묻기 UI 트리거됨
- 사용자 응답이 LLM 2차 호출 input에 반영
- ImportJobStatus 전이에 round-trip 단계 기록

**acceptance**: §3.3 되묻기, [pricing-model §3.3](../00-overview/pricing-model.md)

---

## 시나리오 10: fact-check suggest

**전제**: `PIECEPOOL_FACT_CHECK=true`.

**흐름**:
1. WikiPage 생성 직후 fact-check 자동 실행 (또는 수동 트리거)
2. LLM이 웹 검색 도구 호출
3. 결과 차이 발견 → suggest 패널에 수정안 표시
4. 사용자가 승인 또는 거부
5. 승인 시 WikiPage 본문 업데이트, `evidence[].reason`에 URL 누적

**검증**:
- suggest 패널에 차이 부분 diff 표시
- 승인 시 본문 변경 + frontmatter `updatedAt` 갱신
- evidence에 fact-check 출처 URL 추가
- 거부 시 변경 없음

**acceptance**: §3.3 fact-check, [pricing-model §3.4](../00-overview/pricing-model.md)

---

## 시나리오 11: `.dmg` / `.pkg` 빌드

**흐름**:
1. CI 또는 로컬에서 `npm run tauri build` (또는 동등)
2. 산출물 확인

**검증**:
- `target/release/bundle/dmg/*.dmg` 또는 `target/release/bundle/macos/*.app` 생성
- 산출물이 macOS에서 실행 가능
- 첫 실행 시 Seed 자동 로드

**acceptance**: §8 배포, §9 Seed

---

## 시나리오 12: cross-subject 연결 (시나리오 2 누적)

**전제**: AI Subject Wiki + 운영체제 Subject Wiki 둘 다 존재.

**흐름**:
1. AI에 "Graph Neural Network" Concept 존재
2. 운영체제 강의 텍스트 입력 ("Resource Allocation Graph")
3. LLM이 두 Concept 간 `related_to` 또는 `used_in` Relation 추출
4. Graph View에서 cross-subject edge 확인

**검증**:
- Subject가 다른 두 Concept 사이에 edge 존재
- Subject 필터 해제 시 양쪽 동시 표시
- `vision §5.1` 시나리오 충족

**acceptance**: §6 Graph, [vision §5.1](../00-overview/vision.md#5-1-cross-subject-연결-예시)

---

## 실행 가이드

### 수동 (개발 단계)
- 위 12개 시나리오를 순서대로 클릭/입력으로 통과 확인
- 각 시나리오 통과 시 acceptance-criteria 해당 항목 체크

### 자동 (CI 단계)
- Playwright / Tauri test framework 검토 (선택 항목은 [open-questions](../00-overview/open-questions.md))
- 최소 1, 2, 5, 6, 7, 11 시나리오 자동화 권장

---

## 변경 이력 노트

- 본 문서는 신규 작성이다. PRD-v1에는 시나리오 분해가 없었다.
- 시나리오 4 (OCR), 8 (OpenAI 호출), 9~10 (되묻기·fact-check), 12 (cross-subject)는 본 리팩토링 결정사항 반영이다.
