# 30-llm

LLM 호출 계층. **하이브리드 (OpenAI + Local Ollama)** adapter 패턴.

## 포함 문서 (작성 예정)

| 파일 | 내용 |
|---|---|
| `provider-config.md` | Adapter 인터페이스, 환경변수, fallback 정책 |
| `prompt-templates.md` | system/user 프롬프트 (한국어 학습 컨텍스트) |
| `output-validation.md` | 구조화 출력 schema 검증 + 재시도 + 부분 실패 |
| `evals.md` | 골든 케이스, 회귀 방지 |

## 환경변수

```bash
PIECEPOOL_LLM_PROVIDER=openai|local                  # 기본 openai
PIECEPOOL_LLM_MODEL=...                              # provider별 기본값
OPENAI_API_KEY=...                                   # openai일 때만
PIECEPOOL_LOCAL_LLM_ENDPOINT=http://localhost:11434  # local일 때만, Ollama 기본
PIECEPOOL_LOCAL_LLM_BACKEND=ollama                   # MVP 기본
```

## Owner

LLM (@gosu1)

## 의존

- [`../10-contracts/llm-output-schema.md`](../10-contracts/) — provider 무관 출력 JSON Schema (SSOT)
- [`../10-contracts/entities.md`](../10-contracts/) — Concept/WikiPage/Relation 엔티티

## 작성 일정

Phase 4. Phase 2 완료 후 시작.
