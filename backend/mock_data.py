from backend.models import (
    Fragment,
    GraphEdge,
    GraphNode,
    Project,
    Reminder,
    StudyTask,
    WikiConcept,
)

fragments = [
    Fragment(
        id="fragment-os-pdf",
        title="운영체제 5주차 CPU Scheduling PDF",
        kind="pdf",
        source="LMS",
        project="운영체제",
        summary="스케줄링 알고리즘과 평균 대기시간 계산 예제가 포함된 강의 자료입니다.",
        status="정리 완료",
        created_at="오늘 09:42",
    ),
    Fragment(
        id="fragment-deadlock-photo",
        title="칠판 필기 사진 - Deadlock 조건",
        kind="image",
        source="Gallery",
        project="운영체제",
        summary="Deadlock 발생 조건 네 가지를 칠판 필기로 저장한 이미지입니다.",
        status="정리 완료",
        created_at="어제 18:35",
    ),
    Fragment(
        id="fragment-attention-audio",
        title="딥러닝 수업 녹음 12분",
        kind="audio",
        source="Voice Memo",
        project="딥러닝",
        summary="Self-Attention 설명과 발표 질문 힌트가 포함된 녹음입니다.",
        status="정리 중",
        created_at="오늘 08:10",
    ),
    Fragment(
        id="fragment-transformer-link",
        title="Transformer 시각화 글 링크",
        kind="link",
        source="Browser",
        project="딥러닝",
        summary="Query, Key, Value 흐름을 시각적으로 설명하는 참고 링크입니다.",
        status="검토 필요",
        created_at="어제 14:20",
    ),
    Fragment(
        id="fragment-round-robin-note",
        title="Round Robin 예제 메모",
        kind="text",
        source="Inbox note",
        project="운영체제",
        summary="time quantum 변화가 context switching overhead에 미치는 영향을 정리한 메모입니다.",
        status="연결 필요",
        created_at="오늘 11:05",
    ),
]

wiki_concepts = [
    WikiConcept(
        id="wiki-cpu",
        title="CPU Scheduling",
        tags=["운영체제", "시험", "계산문제"],
        understanding=72,
        related_fragments=["fragment-os-pdf", "fragment-round-robin-note"],
        summary="FCFS, SJF, Round Robin을 시험 문제 관점으로 묶은 개념 페이지입니다.",
    ),
    WikiConcept(
        id="wiki-deadlock",
        title="Deadlock 4조건",
        tags=["운영체제", "개념암기"],
        understanding=58,
        related_fragments=["fragment-deadlock-photo"],
        summary="상호 배제, 점유 대기, 비선점, 순환 대기의 정의와 예방 전략을 정리했습니다.",
    ),
    WikiConcept(
        id="wiki-attention",
        title="Self-Attention",
        tags=["딥러닝", "발표", "Transformer"],
        understanding=64,
        related_fragments=["fragment-attention-audio", "fragment-transformer-link"],
        summary="Q/K/V 흐름과 발표용 설명을 함께 정리한 개념 페이지입니다.",
    ),
]

study_tasks = [
    StudyTask(
        id="task-cpu-review",
        title="CPU Scheduling 요약본 복습",
        project="운영체제",
        estimate="20분",
        reason="중간고사 D-6, 관련 자료 2개",
        done=False,
    ),
    StudyTask(
        id="task-deadlock-explain",
        title="Deadlock 4조건을 말로 설명하기",
        project="운영체제",
        estimate="10분",
        reason="이해도 58%",
        done=False,
    ),
    StudyTask(
        id="task-attention-quiz",
        title="Self-Attention 예상문제 3개 풀기",
        project="딥러닝",
        estimate="25분",
        reason="발표 질문 대비",
        done=True,
    ),
]

projects = [
    Project(
        id="project-os-midterm",
        title="운영체제 중간고사",
        kind="시험",
        d_day="D-6",
        progress=68,
        next_action="Deadlock 복습 카드 완성",
    ),
    Project(
        id="project-dl-presentation",
        title="딥러닝 발표",
        kind="발표",
        d_day="D-12",
        progress=44,
        next_action="Transformer 자료 2개 요약",
    ),
    Project(
        id="project-startup",
        title="창업 아이디어 스케치",
        kind="프로젝트",
        d_day="D-18",
        progress=31,
        next_action="문제 정의 인터뷰 정리",
    ),
]

graph_nodes = [
    GraphNode(id="fragment-os-pdf", label="운영체제 5주차 PDF", category="fragment", summary="CPU Scheduling 원본 자료"),
    GraphNode(id="fragment-round-robin-note", label="Round Robin 예제 메모", category="fragment", summary="텍스트 메모"),
    GraphNode(id="wiki-cpu", label="CPU Scheduling", category="concept", summary="스케줄링 개념"),
    GraphNode(id="project-os-midterm", label="운영체제 중간고사", category="project", summary="시험 목표"),
    GraphNode(id="task-cpu-review", label="CPU Scheduling 복습", category="task", summary="오늘 할 일"),
]

graph_edges = [
    GraphEdge(source="fragment-os-pdf", target="wiki-cpu", label="개념 추출"),
    GraphEdge(source="fragment-round-robin-note", target="wiki-cpu", label="예제 연결"),
    GraphEdge(source="wiki-cpu", target="project-os-midterm", label="시험 범위"),
    GraphEdge(source="wiki-cpu", target="task-cpu-review", label="복습 추천"),
]

reminders = [
    Reminder(id="reminder-os", title="운영체제 핵심 개념 복습", schedule="오늘 21:00", project="운영체제"),
    Reminder(id="reminder-dl", title="딥러닝 발표 질문 준비", schedule="내일 10:00", project="딥러닝"),
]
