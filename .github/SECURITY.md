# 보안 정책 (Security Policy)

## 지원 버전

PiecePool은 정식 릴리스 전(0.x)입니다. 최신 `main` 브랜치만 지원합니다.

## 취약점 신고

공개 이슈로 올리지 말고, GitHub의 **Security → Report a vulnerability**(Private vulnerability reporting)로 비공개 신고해 주세요. 응답까지 수일이 걸릴 수 있습니다.

## API 키 · 데이터 취급

- PiecePool은 **local-first** 앱입니다. `OPENAI_API_KEY`는 사용자 로컬 비밀이며, 앱 설정(향후 OS 키체인)에 저장됩니다.
- 키를 커밋하지 마세요. `.env`는 `.gitignore` 처리돼 있습니다 ([`.env.example`](../.env.example) 템플릿 사용).
- 워크스페이스 데이터(`~/PiecePool`)는 사용자 기기에만 저장되며 서버로 전송되지 않습니다. 유일한 외부 통신은 OpenAI API 호출입니다.
