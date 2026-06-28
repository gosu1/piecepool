# SKILL.md Export (vault → 외부 에이전트)

PiecePool workspace를 **SKILL.md 한 장으로 내보내** Claude Code / Codex가 그 vault를 직접 질의하게 한다.

> **상태**: 제안 / post-MVP. roadmap §6 "Obsidian 호환 vault mode"([`../70-roadmap/post-mvp.md`](../70-roadmap/post-mvp.md))와 연계.
> 외부 영감: research-wiki-skill-kit (vault → SKILL.md 변환 + 4단계 파이프라인).
> in-app 질의는 [`wiki-qa-agent.md`](wiki-qa-agent.md) — 본 문서는 **외부** 에이전트용.

---

## 1. 동기 (거의 공짜인 이유)

PiecePool은 이미 **로컬 Markdown vault + Obsidian 호환**([`../00-overview/vision.md`](../00-overview/vision.md) §6). vault 구조([`../10-contracts/workspace-layout.md`](../10-contracts/workspace-layout.md))와 노트 타입([`../10-contracts/entities.md`](../10-contracts/entities.md))이 **이미 고정**돼 있다.

→ skill-kit이 사람한테 시키는 "vault 구조 발견"을 PiecePool은 **이미 안다**. SKILL.md를 자동 생성만 하면 사용자가 자기 지식 지도를 Claude Code/Codex에서 바로 질의. 앱 밖 확장.

---

## 2. 출력물

`<workspaceRoot>/SKILL.md` (또는 사용자 지정 경로). 내용 = skill-kit식 4부:

1. **vault 구조**: `wiki/` `archive/` `relations/` `sources/` 경로와 노트 타입 의미.
2. **검색 순서**: wiki → relations → archive → sources ([`wiki-qa-agent.md`](wiki-qa-agent.md) §3과 동일).
3. **응답 규칙**: 근거 인용, 저장내용 vs 추론 분리, "없는 내용 금지" ([`wiki-qa-agent.md`](wiki-qa-agent.md) §4~§5).
4. **인용 형식**: `[[file#page=N]]`, SourceRef/Evidence.

> 검색·근거 규칙은 in-app agent와 **SSOT 1벌 공유**(중복 금지). SKILL.md는 그 규칙을 외부 런타임용으로 직렬화한 산출물.

---

## 3. 생성 파이프라인 (skill-kit 4단계)

```text
1. 구조 발견   : workspace-layout + spaces.json 읽어 실제 경로/공간 수집
2. SKILL 생성  : 위 경로 + relation 타입 12종 + 노트 타입을 SKILL.md로 직렬화
3. QA 리뷰     : 환각/추측/경로의존 가드 문구 삽입 (wiki-qa-agent §5)
4. 테스트      : 생성 직후 자동 질문 N개로 self-test (wiki-qa-agent §8)
```

1·2는 PiecePool이 메타데이터를 이미 알아서 **결정적(deterministic)** — LLM 없이 템플릿 채우기로 가능. 3·4는 [`wiki-qa-agent.md`](wiki-qa-agent.md) 규칙 재사용.

---

## 4. SKILL.md 골격 (생성 결과 예시)

```markdown
---
name: piecepool-research-wiki
description: 내 PiecePool 학습 vault를 근거와 함께 질의
---

# 검색 순서
1. <space>/wiki/*.md — 개념 정리본 (먼저)
2. <space>/relations/relations.json — 타입 있는 관계로 이웃 확장
3. <space>/archive/*.md — 사용자 원문 (근거 확정)
4. <space>/sources/original-files/* — PDF/이미지 인용

# 관계 타입 (12종)
extracted_from, explained_by, prerequisite, part_of, used_in,
causes, solves, contrasts, confused_with, related_to, tested_in, review_needed

# 응답 규칙
- 모든 사실에 출처(WikiPage/Source)를 단다.
- 저장된 노트 내용과 추론을 구분한다([원문]/[정리]/[추론]).
- vault에 없으면 "근거 없음"을 반환한다. 지어내지 않는다.
- 인용: [[file.pdf#page=N]]
```

> relation enum은 생성 시 [`../10-contracts/relation-types.md`](../10-contracts/relation-types.md)에서 **런타임 주입**(문서 복붙 아님 — 생성기는 SSOT를 읽어 채운다).

---

## 5. 사용 흐름

1. 앱에서 "에이전트 스킬로 내보내기" → `SKILL.md` 생성.
2. 사용자가 vault 폴더를 Claude Code/Codex로 연다.
3. SKILL.md가 로드돼 외부 에이전트가 같은 검색·근거 규칙으로 vault 질의.

→ PiecePool UI 밖(터미널/IDE)에서도 지식 지도 활용. Obsidian vault export([`../70-roadmap/post-mvp.md`](../70-roadmap/post-mvp.md) §6)와 한 묶음으로 출시 가능.

---

## 6. in-app QA agent와 관계

| | [`wiki-qa-agent.md`](wiki-qa-agent.md) | 본 문서 |
|---|---|---|
| 실행 위치 | PiecePool 앱 내부 | 외부 Claude Code/Codex |
| 규칙 출처 | SSOT | **같은 SSOT 직렬화** |
| 비용 | 앱 LLM provider | 사용자 외부 도구 |

규칙이 한 곳에서 나오므로 둘은 항상 같은 답 정책을 따른다.

---

## 7. 스코프

- **post-MVP**. roadmap §6(vault mode)와 동반.
- 1·2단계(구조 발견·생성)는 LLM 없이 결정적 — 구현 부담 작음.
- 3·4단계는 [`wiki-qa-agent.md`](wiki-qa-agent.md) 의존 → 그 다음.
