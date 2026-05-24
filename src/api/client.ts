import type {
  CreateFragmentPayload,
  CreateProjectPayload,
  CreateReminderPayload,
  CreateStudyTaskPayload,
  Fragment,
  GraphData,
  LlmOperationResult,
  ProviderSettings,
  Project,
  Reminder,
  StudyTask,
  WikiConcept
} from "../types";

const API_BASE = "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  fragments: () => request<Fragment[]>("/fragments"),
  createFragment: (payload: CreateFragmentPayload) =>
    request<Fragment>("/fragments", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteFragment: (fragmentId: string) =>
    request<{ ok: boolean }>(`/fragments/${fragmentId}`, {
      method: "DELETE"
    }),
  wiki: () => request<WikiConcept[]>("/wiki"),
  todayTasks: () => request<StudyTask[]>("/tasks/today"),
  createTodayTask: (payload: CreateStudyTaskPayload) =>
    request<StudyTask>("/tasks/today", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateTodayTask: (taskId: string, done: boolean) =>
    request<StudyTask>(`/tasks/today/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ done })
    }),
  deleteTodayTask: (taskId: string) =>
    request<{ ok: boolean }>(`/tasks/today/${taskId}`, {
      method: "DELETE"
    }),
  projects: () => request<Project[]>("/projects"),
  createProject: (payload: CreateProjectPayload) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteProject: (projectId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}`, {
      method: "DELETE"
    }),
  graph: () => request<GraphData>("/graph"),
  reminders: () => request<Reminder[]>("/reminders"),
  createReminder: (payload: CreateReminderPayload) =>
    request<Reminder>("/reminders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteReminder: (reminderId: string) =>
    request<{ ok: boolean }>(`/reminders/${reminderId}`, {
      method: "DELETE"
    }),
  providers: () => request<ProviderSettings>("/settings/llm-providers"),
  selectProvider: (provider_id: string) =>
    request<ProviderSettings>("/settings/llm-provider", {
      method: "POST",
      body: JSON.stringify({ provider_id })
    }),
  updatePlan: (tier: "free" | "pro") =>
    request<ProviderSettings>("/settings/plan", {
      method: "POST",
      body: JSON.stringify({ tier })
    }),
  ingest: () =>
    request<LlmOperationResult>("/llm/wiki/ingest", {
      method: "POST"
    }),
  lint: () =>
    request<LlmOperationResult>("/llm/wiki/lint", {
      method: "POST"
    }),
  suggestConnections: () =>
    request<LlmOperationResult>("/llm/wiki/suggest-connections", {
      method: "POST"
    }),
  approveConnections: () =>
    request<LlmOperationResult>("/llm/wiki/approve-connections", {
      method: "POST"
    })
};
