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
    CreateReminderRequest,
    CreateStudyTaskRequest,
    Fragment,
    GraphEdge,
    GraphNode,
    Project,
    LlmOperationResult,
    LlmProvider,
    Plan,
    ProviderSettings,
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
        status="연결 필요",
        created_at="방금 전",
    )

    fragments.insert(0, fragment)
    ensure_graph_node(GraphNode(id=fragment.id, label=fragment.title, category="fragment", summary=fragment.summary))
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
    return projects


@app.patch("/projects/{project_id}")
def update_project(project_id: str, request: UpdateProjectRequest):
    project = find_or_404(projects, project_id, "Project")

    if request.progress is not None:
        project.progress = max(0, min(100, request.progress))
    if request.next_action is not None:
        project.next_action = request.next_action.strip() or project.next_action

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
            fragment.status = "정리 완료"

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
            fragment.status = "정리 완료"

    save_workspace_state()
    return llm_result("approve-connections", f"{approved_count}개의 연결을 승인하고 Graph에 반영했습니다.")
