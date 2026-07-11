# 보안 정책 (Security Policy)

## 지원 버전

PiecePool은 정식 릴리스 전(0.x)입니다. 최신 `main` 브랜치만 지원합니다.

## 취약점 신고

공개 이슈로 올리지 말고, GitHub의 **Security → Report a vulnerability**(Private vulnerability reporting)로 비공개 신고해 주세요. 응답까지 수일이 걸릴 수 있습니다.

## API 키 · 데이터 취급

- PiecePool은 **local-first** 앱입니다. API 키는 사용자 로컬 비밀이며 두 곳에 보관됩니다: 데스크톱 앱은 설정 모달 → 브라우저 `localStorage`(향후 OS 키체인), CLI 스크립트는 `.env`의 `GEMINI_API_KEY`.
- 키를 커밋하지 마세요. `.env`는 `.gitignore` 처리돼 있습니다 ([`.env.example`](../.env.example) 템플릿 사용).
- 워크스페이스 데이터(`~/PiecePool`)는 사용자 기기에만 저장되며 **동기화 서버가 없습니다.** 외부로 나가는 통신은 두 가지뿐입니다:
  - **Gemini API** — Wiki 생성·파인만·임베딩 시 해당 노트/PDF 발췌 텍스트가 전송됩니다.
  - **Liner API** — 정보 간극 메우기(fact-check)를 켠 경우에 한해 검색 질의가 전송됩니다(`LINER_API_KEY` 설정 시).

  두 키를 모두 비워 두면 앱은 휴리스틱 폴백으로 동작하며 **네트워크 통신이 발생하지 않습니다.**
