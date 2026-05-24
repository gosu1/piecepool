export type FragmentKind = "pdf" | "text" | "image" | "link" | "audio";

export type Fragment = {
  id: string;
  title: string;
  kind: FragmentKind;
  source: string;
  project: string;
  summary: string;
  status: string;
  created_at: string;
};

export type CreateFragmentPayload = {
  title: string;
  kind: FragmentKind;
  source: string;
  project: string;
  summary: string;
};

export type WikiConcept = {
  id: string;
  title: string;
  tags: string[];
  understanding: number;
  related_fragments: string[];
  summary: string;
};

export type StudyTask = {
  id: string;
  title: string;
  project: string;
  estimate: string;
  reason: string;
  done: boolean;
};

export type CreateStudyTaskPayload = {
  title: string;
  project: string;
  estimate: string;
  reason: string;
};

export type Project = {
  id: string;
  title: string;
  kind: string;
  d_day: string;
  progress: number;
  next_action: string;
};

export type UpdateProjectPayload = {
  progress?: number;
  next_action?: string;
};

export type GraphNode = {
  id: string;
  label: string;
  category: string;
  summary: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  label: string;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type Reminder = {
  id: string;
  title: string;
  schedule: string;
  project: string;
};

export type CreateReminderPayload = {
  title: string;
  schedule: string;
  project: string;
};

export type Plan = {
  tier: "free" | "pro";
  cloudProvidersEnabled: boolean;
};

export type LlmProvider = {
  id: "local" | "openai" | "gemini";
  name: string;
  mode: "local" | "cloud";
  status: "available" | "locked" | "not_configured";
  requiredPlan: "free" | "pro";
  selected: boolean;
  description: string;
};

export type ProviderSettings = {
  plan: Plan;
  providers: LlmProvider[];
};

export type LlmOperationResult = {
  operation: string;
  provider_id: string;
  provider_name: string;
  message: string;
  suggested_actions: string[];
};

export type ViewKey = "inbox" | "wiki" | "plan" | "projects" | "graph" | "reminder" | "ai-engine";
