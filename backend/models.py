from typing import Literal

from pydantic import BaseModel


class Fragment(BaseModel):
    id: str
    title: str
    kind: Literal["pdf", "text", "image", "link", "audio"]
    source: str
    project: str
    summary: str
    status: str
    created_at: str


class CreateFragmentRequest(BaseModel):
    title: str
    kind: Literal["pdf", "text", "image", "link", "audio"]
    source: str
    project: str
    summary: str


class WikiConcept(BaseModel):
    id: str
    title: str
    tags: list[str]
    understanding: int
    related_fragments: list[str]
    summary: str


class StudyTask(BaseModel):
    id: str
    title: str
    project: str
    estimate: str
    reason: str
    done: bool


class CreateStudyTaskRequest(BaseModel):
    title: str
    project: str
    estimate: str
    reason: str


class UpdateStudyTaskRequest(BaseModel):
    done: bool


class Project(BaseModel):
    id: str
    title: str
    kind: str
    d_day: str
    progress: int
    next_action: str


class UpdateProjectRequest(BaseModel):
    progress: int | None = None
    next_action: str | None = None


class GraphNode(BaseModel):
    id: str
    label: str
    category: str
    summary: str


class GraphEdge(BaseModel):
    source: str
    target: str
    label: str


class Reminder(BaseModel):
    id: str
    title: str
    schedule: str
    project: str


class CreateReminderRequest(BaseModel):
    title: str
    schedule: str
    project: str


class Plan(BaseModel):
    tier: Literal["free", "pro"]
    cloudProvidersEnabled: bool


class LlmProvider(BaseModel):
    id: Literal["local", "openai", "gemini"]
    name: str
    mode: Literal["local", "cloud"]
    status: Literal["available", "locked", "not_configured"]
    requiredPlan: Literal["free", "pro"]
    selected: bool
    description: str


class ProviderSettings(BaseModel):
    plan: Plan
    providers: list[LlmProvider]


class SelectProviderRequest(BaseModel):
    provider_id: Literal["local", "openai", "gemini"]


class UpdatePlanRequest(BaseModel):
    tier: Literal["free", "pro"]


class LlmOperationResult(BaseModel):
    operation: str
    provider_id: str
    provider_name: str
    message: str
    suggested_actions: list[str]
