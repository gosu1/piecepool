PiecePool MVP 개발 기준 문서입니다.

읽는 순서:
1. PRD.md
2. docs/superpowers/plans/tasks
3. DEVELOPER_HANDOFF.md

핵심은 단일 로컬 Workspace, archive/wiki Markdown 파일 저장, 실제 LLM 호출, PDF 파싱, Graph View입니다.
구현은 계획 파일의 작업 1부터 순서대로 진행하면 됩니다.


## 아이디어 구조화
<img width="1096" height="1098" alt="image" src="https://github.com/user-attachments/assets/83bc4471-7813-4a4f-b4f1-ef7dac97073c" />
## Inbox
inbox의 들어오는 것

- PDF,이미지,음성,웹

---

MVP단계에서는 mock text까지만


## LLM 내용정리
 
    Semaphore Wiki Page
    Deadlock Wiki Page
    Mutex Wiki Page
    Race Condition Wiki Page
    
    ---
    
    서울이라는 Wiki페이지를 만든다면 이렇게 생성될 수 있음
    <img width="1004" height="1032" alt="image" src="https://github.com/user-attachments/assets/ea948660-df86-43b9-898c-5fe5335ef6c9" />
이런 방식으로 계속해서 WIKI페이지를 업데이트함


## 그래프 뷰
<img width="142" height="150" alt="image" src="https://github.com/user-attachments/assets/169628d6-3179-49cf-9a6f-6425a2f3c055" />









