from backend.models import (
    Fragment,
    GraphEdge,
    GraphNode,
    Project,
    ProjectGoal,
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
        status="Organized",
        created_at="오늘 09:42",
    ),
    Fragment(
        id="fragment-deadlock-photo",
        title="칠판 필기 사진 - Deadlock 조건",
        kind="image",
        source="Gallery",
        project="운영체제",
        summary="Deadlock 발생 조건 네 가지를 칠판 필기로 저장한 이미지입니다.",
        status="Organized",
        created_at="어제 18:35",
    ),
    Fragment(
        id="fragment-attention-audio",
        title="딥러닝 수업 녹음 12분",
        kind="audio",
        source="Voice Memo",
        project="딥러닝",
        summary="Self-Attention 설명과 발표 질문 힌트가 포함된 녹음입니다.",
        status="Processing",
        created_at="오늘 08:10",
    ),
    Fragment(
        id="fragment-transformer-link",
        title="Transformer 시각화 글 링크",
        kind="link",
        source="Browser",
        project="딥러닝",
        summary="Query, Key, Value 흐름을 시각적으로 설명하는 참고 링크입니다.",
        status="Needs Review",
        created_at="어제 14:20",
    ),
    Fragment(
        id="fragment-round-robin-note",
        title="Round Robin 예제 메모",
        kind="text",
        source="Inbox note",
        project="운영체제",
        summary="time quantum 변화가 context switching overhead에 미치는 영향을 정리한 메모입니다.",
        status="Imported",
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
        kind="대학교 수업용",
        d_day="D-6",
        progress=68,
        next_action="Deadlock 복습 카드 완성",
        goals=[
            ProjectGoal(id="goal-os-1", title="CPU Scheduling 계산 문제 정리", status="covered"),
            ProjectGoal(id="goal-os-2", title="Deadlock 4조건 설명 연습", status="covered"),
            ProjectGoal(id="goal-os-3", title="예상 문제 풀이", status="in_progress"),
        ],
        evidence_count=3,
        progress_note="로컬 AI가 강의 PDF, 필기 사진, 메모를 기준으로 계산했습니다.",
    ),
    Project(
        id="project-dl-presentation",
        title="딥러닝 발표",
        kind="대학교 프로젝트용",
        d_day="D-12",
        progress=44,
        next_action="Transformer 자료 2개 요약",
        goals=[
            ProjectGoal(id="goal-dl-1", title="Self-Attention 자료 조사", status="covered"),
            ProjectGoal(id="goal-dl-2", title="발표 구조 만들기", status="in_progress"),
            ProjectGoal(id="goal-dl-3", title="예상 질문 준비", status="not_started"),
        ],
        evidence_count=2,
        progress_note="로컬 AI가 수업 녹음과 링크 자료를 기준으로 계산했습니다.",
    ),
    Project(
        id="project-startup",
        title="창업 아이디어 스케치",
        kind="기타/추후 확장",
        d_day="D-18",
        progress=31,
        next_action="문제 정의 인터뷰 정리",
        goals=[
            ProjectGoal(id="goal-startup-1", title="문제 정의 정리", status="in_progress"),
            ProjectGoal(id="goal-startup-2", title="사용자 인터뷰 메모 수집", status="not_started"),
            ProjectGoal(id="goal-startup-3", title="가설 검증 계획 작성", status="not_started"),
        ],
        evidence_count=1,
        progress_note="로컬 AI가 프로젝트 목표와 연결 자료를 기준으로 계산했습니다.",
    ),
]

graph_nodes = [
    GraphNode(id="fragment-os-pdf", label="운영체제 5주차 PDF", category="fragment", summary="CPU Scheduling 원본 자료"),
    GraphNode(id="fragment-deadlock-photo", label="Deadlock 칠판 필기", category="fragment", summary="교착 상태 발생 조건을 정리한 필기 사진"),
    GraphNode(id="fragment-attention-audio", label="딥러닝 수업 녹음", category="fragment", summary="Self-Attention 설명과 발표 질문 힌트가 담긴 녹음"),
    GraphNode(id="fragment-transformer-link", label="Transformer 시각화 글", category="fragment", summary="Query, Key, Value 흐름을 설명하는 참고 링크"),
    GraphNode(id="fragment-round-robin-note", label="Round Robin 예제 메모", category="fragment", summary="텍스트 메모"),
    GraphNode(id="wiki-cpu", label="CPU Scheduling", category="concept", summary="스케줄링 개념"),
    GraphNode(id="wiki-deadlock", label="Deadlock 4조건", category="concept", summary="상호 배제, 점유 대기, 비선점, 순환 대기 개념"),
    GraphNode(id="wiki-attention", label="Self-Attention", category="concept", summary="Q/K/V 흐름과 발표용 설명을 묶은 개념"),
    GraphNode(id="project-os-midterm", label="운영체제 중간고사", category="project", summary="시험 목표"),
    GraphNode(id="project-dl-presentation", label="딥러닝 발표", category="project", summary="발표 준비 프로젝트"),
    GraphNode(id="project-startup", label="창업 아이디어 스케치", category="project", summary="문제 정의와 사용자 인터뷰를 모으는 프로젝트"),
    GraphNode(id="task-cpu-review", label="CPU Scheduling 복습", category="task", summary="오늘 할 일"),
    GraphNode(id="task-deadlock-explain", label="Deadlock 말로 설명", category="task", summary="교착 상태 4조건을 말로 설명하는 복습"),
    GraphNode(id="task-attention-quiz", label="Self-Attention 예상문제", category="task", summary="발표 질문 대비용 예상문제 풀이"),
]

graph_edges = [
    GraphEdge(source="fragment-os-pdf", target="wiki-cpu", label="개념 추출"),
    GraphEdge(source="fragment-round-robin-note", target="wiki-cpu", label="예제 연결"),
    GraphEdge(source="fragment-deadlock-photo", target="wiki-deadlock", label="필기 정리"),
    GraphEdge(source="fragment-attention-audio", target="wiki-attention", label="녹음 요약"),
    GraphEdge(source="fragment-transformer-link", target="wiki-attention", label="참고 자료"),
    GraphEdge(source="wiki-cpu", target="project-os-midterm", label="시험 범위"),
    GraphEdge(source="wiki-deadlock", target="project-os-midterm", label="시험 범위"),
    GraphEdge(source="wiki-attention", target="project-dl-presentation", label="발표 핵심"),
    GraphEdge(source="wiki-cpu", target="task-cpu-review", label="복습 추천"),
    GraphEdge(source="wiki-deadlock", target="task-deadlock-explain", label="복습 추천"),
    GraphEdge(source="wiki-attention", target="task-attention-quiz", label="질문 대비"),
    GraphEdge(source="project-dl-presentation", target="task-attention-quiz", label="다음 액션"),
    GraphEdge(source="project-os-midterm", target="task-cpu-review", label="오늘 할 일"),
    GraphEdge(source="project-os-midterm", target="task-deadlock-explain", label="오늘 할 일"),
]

reminders = [
    Reminder(id="reminder-os", title="운영체제 핵심 개념 복습", schedule="오늘 21:00", project="운영체제"),
    Reminder(id="reminder-dl", title="딥러닝 발표 질문 준비", schedule="내일 10:00", project="딥러닝"),
]
