import json
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.mock_data import (
    fragments,
    graph_edges,
    graph_nodes,
    projects,
    reminders,
    study_tasks,
    wiki_concepts,
)
from backend.models import (
    CreateFragmentRequest,
    CreateProjectRequest,
    CreateReminderRequest,
    CreateStudyTaskRequest,
    Fragment,
    GraphEdge,
    GraphNode,
    LlmOperationResult,
    LlmProvider,
    Plan,
    ProviderSettings,
    Project,
    ProjectGoal,
    Reminder,
    SelectProviderRequest,
    StudyTask,
    UpdatePlanRequest,
    UpdateProjectRequest,
    UpdateStudyTaskRequest,
    WikiConcept,
)

app = FastAPI(title="PiecePool Local API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mock_plan = Plan(tier="free", cloudProvidersEnabled=False)
selected_provider_id = "local"
workspace_path = Path.home() / ".piecepool" / "workspace.json"

default_graph_example_nodes = [
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

default_graph_example_edges = [
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


def add_default_graph_examples() -> bool:
    changed = False
    node_ids = {node.id for node in graph_nodes}

    for node in default_graph_example_nodes:
        if node.id not in node_ids:
            graph_nodes.append(node)
            node_ids.add(node.id)
            changed = True

    edge_pairs = {(edge.source, edge.target) for edge in graph_edges}
    for edge in default_graph_example_edges:
        if edge.source in node_ids and edge.target in node_ids and (edge.source, edge.target) not in edge_pairs:
            graph_edges.append(edge)
            edge_pairs.add((edge.source, edge.target))
            changed = True

    return changed


def save_workspace_state():
    workspace_path.parent.mkdir(parents=True, exist_ok=True)
    workspace_path.write_text(
        json.dumps(
            {
                "fragments": [item.model_dump() for item in fragments],
                "wiki_concepts": [item.model_dump() for item in wiki_concepts],
                "study_tasks": [item.model_dump() for item in study_tasks],
                "projects": [item.model_dump() for item in projects],
                "graph_nodes": [item.model_dump() for item in graph_nodes],
                "graph_edges": [item.model_dump() for item in graph_edges],
                "reminders": [item.model_dump() for item in reminders],
                "plan": mock_plan.model_dump(),
                "selected_provider_id": selected_provider_id,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def load_workspace_state():
    global mock_plan
    global selected_provider_id

    if not workspace_path.exists():
        return

    try:
        data = json.loads(workspace_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return

    fragments[:] = [Fragment(**item) for item in data.get("fragments", [])]
    wiki_concepts[:] = [WikiConcept(**item) for item in data.get("wiki_concepts", [])]
    study_tasks[:] = [StudyTask(**item) for item in data.get("study_tasks", [])]
    projects[:] = [Project(**item) for item in data.get("projects", [])]
    graph_nodes[:] = [GraphNode(**item) for item in data.get("graph_nodes", [])]
    graph_edges[:] = [GraphEdge(**item) for item in data.get("graph_edges", [])]
    reminders[:] = [Reminder(**item) for item in data.get("reminders", [])]
    mock_plan = Plan(**data.get("plan", mock_plan.model_dump()))
    selected_provider_id = data.get("selected_provider_id", selected_provider_id)
    if selected_provider_id != "local" and not mock_plan.cloudProvidersEnabled:
        selected_provider_id = "local"
    if add_default_graph_examples():
        save_workspace_state()


load_workspace_state()


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def find_or_404(items, item_id: str, label: str):
    item = next((candidate for candidate in items if candidate.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return item


def build_providers() -> list[LlmProvider]:
    providers = [
        LlmProvider(
            id="local",
            name="Local LLM",
            mode="local",
            status="available",
            requiredPlan="free",
            selected=selected_provider_id == "local",
            description="기기 안에서 실행됩니다. 기본값이며 외부 API 호출이 없습니다.",
        ),
        LlmProvider(
            id="openai",
            name="OpenAI GPT",
            mode="cloud",
            status="available" if mock_plan.cloudProvidersEnabled else "locked",
            requiredPlan="pro",
            selected=selected_provider_id == "openai",
            description="더 높은 품질을 위한 클라우드 모델입니다. Pro 플랜에서 선택할 수 있습니다.",
        ),
        LlmProvider(
            id="gemini",
            name="Google Gemini",
            mode="cloud",
            status="available" if mock_plan.cloudProvidersEnabled else "locked",
            requiredPlan="pro",
            selected=selected_provider_id == "gemini",
            description="긴 맥락의 학습 자료 정리에 적합한 클라우드 모델입니다. Pro 플랜에서 선택할 수 있습니다.",
        ),
    ]

    return providers


def selected_provider() -> LlmProvider:
    return next((provider for provider in build_providers() if provider.selected), build_providers()[0])


def default_goals_for_project(project: Project) -> list[ProjectGoal]:
    defaults = {
        "시험": ["핵심 개념 정리", "예상 문제 풀이", "오답/취약점 보강"],
        "발표": ["자료 조사", "발표 흐름 구성", "예상 질문 준비"],
        "프로젝트": ["문제 정의", "실행 계획 정리", "결과물 초안 만들기"],
        "대학교 수업용": ["강의 자료 수집", "핵심 개념 정리", "복습 태스크 만들기"],
        "대학교 프로젝트용": ["요구사항 정리", "자료 조사", "결과물 제작"],
        "운동": ["목표 설정", "운동 기록 수집", "주간 루틴 점검"],
    }
    titles = defaults.get(project.kind, ["목표 정의", "자료 수집", "다음 액션 실행"])
    return [ProjectGoal(id=make_id("goal"), title=title) for title in titles]


def fragment_matches_project(fragment: Fragment, project: Project) -> bool:
    fragment_project = fragment.project.strip().lower()
    project_title = project.title.strip().lower()
    project_kind = project.kind.strip().lower()

    if not fragment_project:
        return False

    return (
        fragment_project == project_title
        or fragment_project in project_title
        or project_title in fragment_project
        or fragment_project == project_kind
    )


def recalculate_project_progress(project: Project):
    if not project.goals:
        project.goals = default_goals_for_project(project)

    evidence_count = len([fragment for fragment in fragments if fragment_matches_project(fragment, project)])
    goal_count = max(1, len(project.goals))
    covered_count = min(evidence_count, goal_count)

    for index, goal in enumerate(project.goals):
        if index < covered_count:
            goal.status = "covered"
        elif index == covered_count and evidence_count > 0:
            goal.status = "in_progress"
        else:
            goal.status = "not_started"

    project.evidence_count = evidence_count
    project.progress = min(100, round((covered_count / goal_count) * 100))

    next_goal = next((goal for goal in project.goals if goal.status != "covered"), None)
    project.next_action = (
        f"{next_goal.title} 관련 자료를 Inbox에 추가하세요." if next_goal else "목표 자료가 충분합니다. Wiki와 Plan에서 마무리 점검하세요."
    )
    project.progress_note = f"로컬 AI가 프로젝트 목표 {goal_count}개와 연결 자료 {evidence_count}개를 기준으로 계산했습니다."


def recalculate_projects():
    for project in projects:
        recalculate_project_progress(project)


def infer_concept_id(fragment: Fragment) -> str | None:
    text = f"{fragment.title} {fragment.summary} {fragment.project}".lower()
    if any(keyword in text for keyword in ["deadlock", "교착", "상호 배제"]):
        return "wiki-deadlock"
    if any(keyword in text for keyword in ["attention", "transformer", "q/k/v", "self"]):
        return "wiki-attention"
    if any(keyword in text for keyword in ["cpu", "scheduling", "round robin", "스케줄"]):
        return "wiki-cpu"
    return None


def ensure_graph_node(node: GraphNode):
    if not any(candidate.id == node.id for candidate in graph_nodes):
        graph_nodes.append(node)


def ensure_graph_edge(edge: GraphEdge):
    if not any(candidate.source == edge.source and candidate.target == edge.target for candidate in graph_edges):
        graph_edges.append(edge)


def connect_fragment(fragment: Fragment) -> bool:
    concept_id = infer_concept_id(fragment)
    if concept_id is None:
        return False

    concept = next((item for item in wiki_concepts if item.id == concept_id), None)
    if concept is None:
        return False

    already_related = fragment.id in concept.related_fragments
    already_linked = any(edge.source == fragment.id and edge.target == concept.id for edge in graph_edges)

    if fragment.id not in concept.related_fragments:
        concept.related_fragments.append(fragment.id)

    ensure_graph_edge(GraphEdge(source=fragment.id, target=concept.id, label="AI 정리"))
    return not already_related or not already_linked


def llm_result(operation: str, message: str) -> LlmOperationResult:
    provider = selected_provider()

    return LlmOperationResult(
        operation=operation,
        provider_id=provider.id,
        provider_name=provider.name,
        message=message,
        suggested_actions=[
            "검토할 연결 후보를 확인하세요.",
            "중요한 개념은 Wiki에서 고정하세요.",
            "필요한 복습 태스크를 Plan에 남기세요.",
        ],
    )


@app.get("/health")
def health():
    return {"status": "ok", "app": "PiecePool Local API"}


@app.get("/workspace")
def workspace():
    return {
        "name": "PiecePool Local Workspace",
        "mode": "local-first",
        "plan": mock_plan,
        "selected_provider": selected_provider(),
    }


@app.get("/fragments")
def get_fragments():
    return fragments


@app.post("/fragments", response_model=Fragment)
def create_fragment(request: CreateFragmentRequest):
    fragment = Fragment(
        id=make_id("fragment"),
        title=request.title.strip(),
        kind=request.kind,
        source=request.source.strip() or "직접 입력",
        project=request.project.strip() or "미분류",
        summary=request.summary.strip() or "아직 요약이 없습니다.",
        status="Imported",
        created_at="방금 전",
    )

    fragments.insert(0, fragment)
    ensure_graph_node(GraphNode(id=fragment.id, label=fragment.title, category="fragment", summary=fragment.summary))
    recalculate_projects()
    save_workspace_state()

    return fragment


@app.delete("/fragments/{fragment_id}")
def delete_fragment(fragment_id: str):
    fragment = find_or_404(fragments, fragment_id, "Fragment")
    fragments.remove(fragment)
    graph_nodes[:] = [node for node in graph_nodes if node.id != fragment_id]
    graph_edges[:] = [edge for edge in graph_edges if edge.source != fragment_id and edge.target != fragment_id]

    for concept in wiki_concepts:
        concept.related_fragments = [item for item in concept.related_fragments if item != fragment_id]

    recalculate_projects()
    save_workspace_state()
    return {"ok": True}


@app.get("/wiki")
def get_wiki():
    return wiki_concepts


@app.get("/tasks/today")
def get_today_tasks():
    return study_tasks


@app.post("/tasks/today", response_model=StudyTask)
def create_today_task(request: CreateStudyTaskRequest):
    task = StudyTask(
        id=make_id("task"),
        title=request.title.strip(),
        project=request.project.strip() or "미분류",
        estimate=request.estimate.strip() or "15분",
        reason=request.reason.strip() or "직접 추가한 학습 액션",
        done=False,
    )
    study_tasks.insert(0, task)
    ensure_graph_node(GraphNode(id=task.id, label=task.title, category="task", summary=task.reason))
    save_workspace_state()
    return task


@app.patch("/tasks/today/{task_id}", response_model=StudyTask)
def update_today_task(task_id: str, request: UpdateStudyTaskRequest):
    task = find_or_404(study_tasks, task_id, "Task")
    task.done = request.done
    save_workspace_state()
    return task


@app.delete("/tasks/today/{task_id}")
def delete_today_task(task_id: str):
    task = find_or_404(study_tasks, task_id, "Task")
    study_tasks.remove(task)
    graph_nodes[:] = [node for node in graph_nodes if node.id != task_id]
    graph_edges[:] = [edge for edge in graph_edges if edge.source != task_id and edge.target != task_id]
    save_workspace_state()
    return {"ok": True}


@app.get("/projects")
def get_projects():
    recalculate_projects()
    return projects


@app.post("/projects", response_model=Project)
def create_project(request: CreateProjectRequest):
    goal_titles = [goal.strip() for goal in request.goals if goal.strip()]
    project = Project(
        id=make_id("project"),
        title=request.title.strip(),
        kind=request.kind.strip() or "기타",
        d_day=request.d_day.strip() or "상시",
        progress=0,
        next_action="프로젝트 목표와 관련된 첫 자료를 Inbox에 추가하세요.",
        goals=[ProjectGoal(id=make_id("goal"), title=goal) for goal in goal_titles],
        evidence_count=0,
    )

    if not project.title:
        raise HTTPException(status_code=400, detail="Project title is required")
    if not project.goals:
        project.goals = default_goals_for_project(project)

    recalculate_project_progress(project)
    projects.insert(0, project)
    ensure_graph_node(GraphNode(id=project.id, label=project.title, category="project", summary=project.kind))
    save_workspace_state()
    return project


@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    project = find_or_404(projects, project_id, "Project")
    projects.remove(project)
    graph_nodes[:] = [node for node in graph_nodes if node.id != project_id]
    graph_edges[:] = [edge for edge in graph_edges if edge.source != project_id and edge.target != project_id]
    save_workspace_state()
    return {"ok": True}


@app.patch("/projects/{project_id}")
def update_project(project_id: str, request: UpdateProjectRequest):
    project = find_or_404(projects, project_id, "Project")

    if request.next_action is not None:
        project.next_action = request.next_action.strip() or project.next_action

    recalculate_project_progress(project)
    save_workspace_state()
    return project


@app.get("/graph")
def get_graph():
    return {"nodes": graph_nodes, "edges": graph_edges}


@app.get("/reminders")
def get_reminders():
    return reminders


@app.post("/reminders", response_model=Reminder)
def create_reminder(request: CreateReminderRequest):
    reminder = Reminder(
        id=make_id("reminder"),
        title=request.title.strip(),
        schedule=request.schedule.strip() or "오늘 저녁",
        project=request.project.strip() or "미분류",
    )
    reminders.insert(0, reminder)
    save_workspace_state()
    return reminder


@app.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: str):
    reminder = find_or_404(reminders, reminder_id, "Reminder")
    reminders.remove(reminder)
    save_workspace_state()
    return {"ok": True}


@app.get("/settings/llm-providers", response_model=ProviderSettings)
def get_llm_providers():
    return ProviderSettings(plan=mock_plan, providers=build_providers())


@app.post("/settings/llm-provider", response_model=ProviderSettings)
def select_llm_provider(request: SelectProviderRequest):
    global selected_provider_id

    provider = next((item for item in build_providers() if item.id == request.provider_id), None)

    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")

    if provider.status == "locked":
        raise HTTPException(status_code=403, detail="This provider requires the Pro plan")

    selected_provider_id = provider.id
    save_workspace_state()

    return ProviderSettings(plan=mock_plan, providers=build_providers())


@app.post("/settings/plan", response_model=ProviderSettings)
def update_plan(request: UpdatePlanRequest):
    global mock_plan
    global selected_provider_id

    mock_plan = Plan(tier=request.tier, cloudProvidersEnabled=request.tier == "pro")
    if not mock_plan.cloudProvidersEnabled and selected_provider_id != "local":
        selected_provider_id = "local"

    save_workspace_state()
    return ProviderSettings(plan=mock_plan, providers=build_providers())


@app.post("/llm/wiki/ingest", response_model=LlmOperationResult)
def ingest_wiki():
    connected_count = 0

    for fragment in fragments:
        if connect_fragment(fragment):
            connected_count += 1
            fragment.status = "Organized"

    recalculate_projects()
    save_workspace_state()
    return llm_result("ingest", f"AI 정리가 완료되었습니다. {connected_count}개의 자료 연결을 확인했습니다.")


@app.post("/llm/wiki/lint", response_model=LlmOperationResult)
def lint_wiki():
    isolated_count = len(
        [
            node
            for node in graph_nodes
            if not any(edge.source == node.id or edge.target == node.id for edge in graph_edges)
        ]
    )
    return llm_result("lint", f"고립된 조각 {isolated_count}개를 찾았습니다. Inbox에서 연결 후보를 확인하세요.")


@app.post("/llm/wiki/suggest-connections", response_model=LlmOperationResult)
def suggest_connections():
    return llm_result("suggest-connections", "연결 후보를 만들었습니다. 관련 자료와 개념 페이지를 검토하세요.")


@app.post("/llm/wiki/approve-connections", response_model=LlmOperationResult)
def approve_connections():
    approved_count = 0

    for fragment in fragments:
        if connect_fragment(fragment):
            approved_count += 1
            fragment.status = "Organized"

    recalculate_projects()
    save_workspace_state()
    return llm_result("approve-connections", f"{approved_count}개의 연결을 승인하고 Graph에 반영했습니다.")
