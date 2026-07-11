# Wiki QA Agent (질의 계층)

내 지식 지도에 **질문하고 근거와 함께 답받는** 에이전트. PiecePool의 빠진 "읽기(query)" 절반.

> **상태**: 제안 / post-MVP. MVP scope([`../00-overview/scope-mvp.md`](../00-overview/scope-mvp.md))엔 없음 — 신규 기능 → 이슈로 추적 후 도입.
> 외부 영감: research-wiki-skill-kit (vault → 에이전트, 근거 분리, 환각 가드).
> 근거 분리 규칙은 [`prompt-templates.md`](prompt-templates.md) §6과 SSOT 공유.

---

## 1. 동기

현재 PiecePool은 archive → wiki/relations를 **생성(write)**만 한다. 만들어진 위키·그래프에 **질문할 방법이 없다**. skill-kit이 정확히 이 빈칸: vault를 탐색해 출처 인용과 함께 답하는 에이전트.

핵심 차별: 일반 챗봇과 달리 **반드시 사용자 vault 파일에 근거**한다. 모르면 지어내지 않고 "근거 없음"을 반환한다.

---

## 2. 입력 (vault 경로)

[`../10-contracts/workspace-layout.md`](../10-contracts/workspace-layout.md) 구조를 읽기 전용으로 탐색.

| 경로 | 노트 타입 | 역할 |
|---|---|---|
| `<space>/wiki/*.md` | WikiPage | LLM 정리본 (1차 답변 출처) |
| `<space>/archive/*.md` | ArchiveNote | 사용자 원문 (근거 확정) |
| `<space>/relations/relations.json` | Relation | 개념 간 타입 관계 (탐색 확장) |
| `<space>/sources/original-files/*` | Source 원본 | PDF/이미지 인용 |

엔티티 정의: [`../10-contracts/entities.md`](../10-contracts/entities.md).

---

## 3. 검색 순서 (노트 타입 구분 — skill-kit 흡수)

질문 → 다음 순서로 좁힌다. **정리본(wiki)에서 시작해 원문(archive)으로 근거를 확정**한다.

```text
1. wiki/         제목·summary·aliases·frontmatter 매칭 → 후보 WikiPage
2. relations     후보 개념의 part_of/used_in/confused_with 등으로 이웃 확장
3. archive/      WikiPage.sourceIds → 원문에서 실제 근거 문장 확인
4. sources/      필요 시 PDF page/이미지 인용 ([[file#page=N]])
```

- WikiPage(정리본)와 ArchiveNote(원문)를 **섞지 않는다**. 답은 정리본 기반, 근거는 원문 기반.
- relations로 "헷갈리는 개념"(`confused_with`), "선행 개념"(`prerequisite`)을 자동 동반 제시.

---

## 4. 응답 규칙 + 인용 형식

```text
[응답 규칙]
- 모든 사실 주장 뒤에 출처를 단다.
- 출처는 WikiPage title 또는 원본 파일(SourceRef/Evidence) 단위.
- 저장된 노트 내용 vs 너의 추론을 라벨로 구분한다.
  · "[원문]" = archive/source 근거 있음
  · "[정리]" = wiki 정리본 기반
  · "[추론]" = 근거 없이 보충 (남용 금지, 명시 필수)
- 근거를 못 찾으면 "근거 없음 — vault에 관련 내용이 없습니다"를 반환한다.
```

인용 표기는 기존 모델 재사용(신규 타입 정의 안 함):

- 파일/페이지: `[[transformer-week3.pdf#page=12]]` ([`../10-contracts/wikilink-embed.md`](../10-contracts/wikilink-embed.md))
- 구조화 근거: `SourceRef` / `Evidence`([`../10-contracts/entities.md#sourceref`](../10-contracts/entities.md#sourceref), [`#evidence`](../10-contracts/entities.md#evidence)) — `quote`/`reason`/`page` 그대로 사용.

---

## 5. Grounding Guard (idea ② 상세)

저장형 앱이라 환각이 곧 신뢰 붕괴. 4중 가드:

| 가드 | 규칙 | 위반 시 |
|---|---|---|
| **무근거 차단** | 모든 주장에 wiki/archive/source 근거 1개 이상 | "근거 없음" 반환 |
| **추론 격리** | 일반지식 보충은 `[추론]` 라벨 강제 | 라벨 없으면 답변 거부 |
| **원문 우선** | wiki 정리본과 archive 원문 충돌 시 원문 채택 + 충돌 표시 | 자동 수정 금지(사용자에 표시) |
| **경로 검증** | 인용 파일·page가 실존하는지 확인 | 깨진 인용 표시, 답에서 제외 |

> 마지막 두 규칙은 [`../10-contracts/wikilink-embed.md`](../10-contracts/wikilink-embed.md) "자동 삭제·덮어쓰기 금지" 원칙과 정렬.

---

## 6. 모호 질문 — 파인만 연계

질문이 모호하거나 여러 개념에 걸치면 바로 답하지 말고 **되물어** 좁힌다. import 파인만과 같은 메커니즘 재사용: [`output-validation.md`](output-validation.md) §6.

- clarify round-trip 1회. 불충분하면 최선 후보 + 후보 목록 제시.

---

## 7. 출력 형태

```text
답변: <정리본 기반 서술, 문장마다 [원문]/[정리]/[추론] 라벨>

근거:
- [[self-attention]] (WikiPage)
- [[transformer-week3.pdf#page=12]] — "Self-Attention은 …" (quote)

관련:
- 헷갈리는 개념: [[multi-head-attention]] (confused_with)
- 선행 개념: [[attention]] (prerequisite)
```

---

## 8. 에이전트 Eval (idea ④ — 자동 테스트 질문)

skill-kit "난이도별 질문 10개로 검증"을 PiecePool eval에 흡수. **seed vault**(AI/OS/자료구조, [`../00-overview/scope-mvp.md`](../00-overview/scope-mvp.md) §2.9)로 회귀 테스트.

### 8.1 테스트 질문 자동 생성

각 WikiPage에서 난이도별 질문 파생:

| 난이도 | 패턴 | 정답 파일 |
|---|---|---|
| easy | "X가 뭐야?" (단일 개념 정의) | 해당 WikiPage |
| medium | "X와 Y 차이?" (`confused_with`/`contrasts`) | 두 WikiPage + relation |
| hard | "X는 어디에 쓰여?" (cross-subject `used_in`) | 다중 space WikiPage |
| trap | vault에 없는 개념 질문 | **"근거 없음" 반환해야 통과** |

### 8.2 통과 기준 (skill-kit QA 리뷰 축)

| 축 | 통과 |
|---|---|
| **파일 attribution** | 답이 정답 WikiPage/Source를 실제로 인용 |
| **환각 0** | trap 질문에 지어내지 않고 "근거 없음" |
| **추론 격리** | `[추론]` 라벨 없는 무근거 주장 0 |
| **경로 유효** | 인용한 파일·page 모두 실존 |

### 8.3 실행

[`evals.md`](evals.md) 하니스 확장: `npm run eval -- --agent --space <slug>`. 결과는 import eval과 같은 results/ 비교 표 형식.

---

## 9. 멀티에이전트 (idea ⑥) — 후속

단일 QA 에이전트로 시작. 추출/연결/근거/dedup을 분리한 **멀티에이전트 파이프라인은 호출 N배** → 비용모델과 충돌. **후속 구현**(사용자 결정). 설계 시 본 문서 §5 가드를 단계별로 분산.

---

## 10. 스코프 요약

- 전체 **post-MVP** 후보(품질·비용).
- §5 grounding guard는 우선순위 최상(저장형 신뢰 직결).
- 같은 검색/근거 규칙을 [`skill-export.md`](skill-export.md)와 공유(SSOT 1벌).
