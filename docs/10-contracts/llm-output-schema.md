# LLM Output Schema (SSOT)

PiecePool LLM 호출의 **provider 무관 출력 JSON Schema**. OpenAI / 로컬 Ollama 등 어떤 provider를 쓰든 본 schema로 변환되어 저장된다.

> **본 문서가 단일 출처**다. provider별 raw 응답은 본 schema로 정규화 후에만 다른 계층에 노출된다.
> **계약 변경**: [README.md#변경-절차](README.md#변경-절차) 참조.

---

## 1. 최상위 타입

```ts
type LlmWikiResult = {
  concepts: LlmConcept[];
  relations: LlmRelation[];
};
```

LLM은 항상 본 구조로 응답하거나, provider adapter가 이 구조로 변환한다.

**adapter 책임**: `docs/30-llm/output-validation.md` (작성 예정).

---

## 2. LlmConcept

```ts
type LlmConcept = {
  title: string;                  // 사용자 표시명
  aliases?: string[];             // 동의어
  summary: string;                // 1-2문장 요약
  explanation: string;            // 자세한 설명 (Markdown)
  examples: string[];             // 예시 목록 (Markdown 가능)
  sourceRefs: LlmSourceRef[];     // 본문 embed/link에 대응
  sourceEmbeds: string[];         // 본문에 삽입할 ![[...]] 문자열 목록 (참고)
  confusingConcepts?: string[];   // 헷갈리는 개념 title 목록
  relatedQuestions?: string[];    // 관련 질문 텍스트 목록
};
```

### 2.1 LlmSourceRef

```ts
type LlmSourceRef = {
  sourceId: string;          // 호출 시 LLM에 입력으로 준 Source.id
  file: string;              // 파일명
  page?: number;             // PDF page (1-indexed)
  embed: boolean;            // true=![[...]], false=[[...]]
  label?: string;
  reason?: string;
};
```

**엔티티 SourceRef와의 관계**: 저장 시 SourceRef.id가 부여되어 [entities.md#sourceref](entities.md#sourceref)로 변환된다.

---

## 3. LlmRelation

```ts
type LlmRelation = {
  sourceConceptTitle: string;        // LlmConcept.title 참조
  targetConceptTitle: string;        // LlmConcept.title 참조
  relationType: RelationType;        // 12종 enum
  strength: number;                  // 0.0 ~ 1.0
  confidence: number;                // 0.0 ~ 1.0
  explanation: string;               // 한국어 1-2문장
  evidence: LlmEvidence[];           // 최소 1개 권장
};
```

**RelationType enum**: [relation-types.md](relation-types.md)

### 3.1 LlmEvidence

```ts
type LlmEvidence = {
  sourceId: string;
  archivePath?: string;              // <space>/archive/*.md
  originalFilePath?: string;         // <space>/sources/original-files/*
  page?: number;
  quote?: string;                    // 발췌 텍스트
  location?: string;                 // 자유 형식 위치
  reason: string;                    // 필수
};
```

저장 시 [entities.md#evidence](entities.md#evidence)로 변환.

---

## 4. JSON Schema (Draft 2020-12)

LLM provider에 structured output 요청 시 사용한다.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LlmWikiResult",
  "type": "object",
  "additionalProperties": false,
  "required": ["concepts", "relations"],
  "properties": {
    "concepts": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["title", "summary", "explanation", "examples", "sourceRefs", "sourceEmbeds"],
        "properties": {
          "title": { "type": "string", "minLength": 1 },
          "aliases": { "type": "array", "items": { "type": "string" } },
          "summary": { "type": "string", "minLength": 1 },
          "explanation": { "type": "string", "minLength": 1 },
          "examples": { "type": "array", "items": { "type": "string" } },
          "sourceRefs": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["sourceId", "file", "embed"],
              "properties": {
                "sourceId": { "type": "string" },
                "file": { "type": "string" },
                "page": { "type": "integer", "minimum": 1 },
                "embed": { "type": "boolean" },
                "label": { "type": "string" },
                "reason": { "type": "string" }
              }
            }
          },
          "sourceEmbeds": { "type": "array", "items": { "type": "string" } },
          "confusingConcepts": { "type": "array", "items": { "type": "string" } },
          "relatedQuestions": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "relations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["sourceConceptTitle", "targetConceptTitle", "relationType", "strength", "confidence", "explanation", "evidence"],
        "properties": {
          "sourceConceptTitle": { "type": "string" },
          "targetConceptTitle": { "type": "string" },
          "relationType": {
            "type": "string",
            "enum": [
              "extracted_from",
              "explained_by",
              "prerequisite",
              "part_of",
              "used_in",
              "causes",
              "solves",
              "contrasts",
              "confused_with",
              "related_to",
              "tested_in",
              "review_needed"
            ]
          },
          "strength": { "type": "number", "minimum": 0, "maximum": 1 },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "explanation": { "type": "string", "minLength": 1 },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["sourceId", "reason"],
              "properties": {
                "sourceId": { "type": "string" },
                "archivePath": { "type": "string" },
                "originalFilePath": { "type": "string" },
                "page": { "type": "integer", "minimum": 1 },
                "quote": { "type": "string" },
                "location": { "type": "string" },
                "reason": { "type": "string", "minLength": 1 }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 5. 검증 규칙 (저장 전)

1. JSON Schema 통과
2. `relations[].sourceConceptTitle` / `targetConceptTitle`이 같은 응답의 `concepts[].title` 또는 기존 Workspace의 Concept.title과 일치
3. `relations[].relationType`이 [노드 호환성 매트릭스](relation-types.md#노드-호환성-매트릭스)에 부합
4. `concepts[].sourceRefs[].sourceId`가 호출 입력에 포함된 Source.id 중 하나
5. `concepts[].sourceRefs[].page`가 해당 PDF 범위 내
6. `related_to` 비율이 응답 전체 relation의 50% 초과 시 경고 로그 (저장은 허용)

위반 시 처리: `docs/30-llm/output-validation.md` (작성 예정).

---

## 6. 변환: LLM 결과 → 저장 엔티티

```text
LlmConcept       → Concept + WikiPage + SourceRef[]
LlmRelation      → Relation
LlmEvidence      → Evidence
```

- `LlmConcept.title`에서 Concept.normalizedTitle 생성 (소문자, 공백 정규화)
- 기존 Concept과 normalizedTitle 일치 시 merge (새 WikiPage 생성 대신 업데이트)
- WikiPage 본문은 `summary` + `explanation` + `examples` + `sourceEmbeds` + 헷갈리는 개념 / 관련 질문 섹션으로 조합
- `sourceRefs`는 그대로 WikiPage frontmatter에 직렬화

변환 책임은 Backend (`docs/20-backend/import-pipeline.md` 작성 예정).

---

## 7. Provider 무관성 보장

본 schema는 어떤 LLM provider를 사용하더라도 일정해야 한다.

- OpenAI: Responses API + `response_format: { type: "json_schema", ... }` 사용
- Local (Ollama): `format: "json"` + schema는 system prompt에 명시 + adapter가 검증
- 추가 provider: 동일 JSON Schema 통과 강제

adapter 인터페이스 정의: `docs/30-llm/provider-config.md` (작성 예정).

---

## 8. 변경 이력 노트

- 본 문서는 `docs/archive/PRD-v1.md` §10 (line 632-678)을 분리·확장한 SSOT다.
- JSON Schema(§4) 전체 명세는 본 리팩토링에서 신규 작성했다.
- Provider 무관성 보장(§7)은 본 리팩토링의 하이브리드 결정에 따라 신규 추가했다.
