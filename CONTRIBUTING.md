# PiecePool 협업 가이드

## 읽는 순서

1. `PRD.md`
2. `docs/superpowers/plans/2026-05-28-piecepool-mvp.md`
3. `DEVELOPER_HANDOFF.md`

## 로컬 준비

```bash
npm run install:app
cp .env.example .env
```

`OPENAI_API_KEY`는 실제 LLM import 작업 전까지 비워둘 수 있습니다.

## 개발 명령

```bash
npm run dev
npm run desktop:dev
npm test
npm run build
```

## 작업 원칙

- 계획 파일의 작업 1부터 순서대로 진행합니다.
- 각 작업은 테스트 작성, 실패 확인, 구현, 통과 확인, 커밋 순서로 진행합니다.
- 작업 범위와 무관한 파일은 함께 수정하지 않습니다.
- PRD의 핵심 결정은 바꾸지 않습니다.
