import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import { AiEngineView } from "./components/AiEngineView";
import { GraphView } from "./components/GraphView";
import { InboxView } from "./components/InboxView";
import { PlanView } from "./components/PlanView";
import { ProjectsView } from "./components/ProjectsView";
import { ReminderView } from "./components/ReminderView";
import { SearchView } from "./components/SearchView";
import { Shell, Panel } from "./components/Shell";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceGate } from "./components/WorkspaceGate";
import { WorkspaceView } from "./components/WorkspaceView";
import { WikiView } from "./components/WikiView";
import {
  fallbackFragments,
  fallbackGraph,
  fallbackProjects,
  fallbackProviders,
  fallbackReminders,
  fallbackTasks,
  fallbackWiki
} from "./data/mockData";
import type {
  CreateFragmentPayload,
  CreateProjectPayload,
  CreateReminderPayload,
  CreateStudyTaskPayload,
  Fragment,
  GraphData,
  Project,
  ProviderSettings,
  Reminder,
  StudyTask,
  SyncUser,
  ThemeMode,
  ViewKey,
  WorkspaceProfile,
  WikiConcept
} from "./types";

const workspaceStorageKey = "piecepool.localWorkspace";
const syncUserStorageKey = "piecepool.syncUser";
const themeStorageKey = "piecepool.themeMode";

const mockSyncUser: SyncUser = {
  name: "서준 박",
  email: "gz5yv5h5yv@privaterelay.app"
};

function readWorkspaceProfile(): WorkspaceProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(workspaceStorageKey);
    return raw ? (JSON.parse(raw) as WorkspaceProfile) : null;
  } catch {
    return null;
  }
}

function writeWorkspaceProfile(profile: WorkspaceProfile) {
  window.localStorage.setItem(workspaceStorageKey, JSON.stringify(profile));
}

function readSyncUser(): SyncUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(syncUserStorageKey);
    return raw ? (JSON.parse(raw) as SyncUser) : null;
  } catch {
    return null;
  }
}

function writeSyncUser(user: SyncUser) {
  window.localStorage.setItem(syncUserStorageKey, JSON.stringify(user));
}

function clearSyncUser() {
  window.localStorage.removeItem(syncUserStorageKey);
}

function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";

  const raw = window.localStorage.getItem(themeStorageKey);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

function writeThemeMode(mode: ThemeMode) {
  window.localStorage.setItem(themeStorageKey, mode);
}

const viewCopy: Record<ViewKey, { title: string; eyebrow: string; description: string }> = {
  workspace: {
    eyebrow: "Local workspace",
    title: "My Study Pool",
    description: "내 기기 안에 모인 자료, 오늘 할 일, 프로젝트 진행 상태를 한 번에 확인합니다."
  },
  inbox: {
    eyebrow: "Local pieces",
    title: "내 컴퓨터 안의 조각을 Inbox에 모읍니다.",
    description: "PDF, 사진, 녹음, 링크, 메모를 로컬 Workspace에 추가하고 AI 정리 흐름으로 보냅니다."
  },
  wiki: {
    eyebrow: "Living wiki",
    title: "자료가 다시 사용할 수 있는 지식 페이지로 바뀝니다.",
    description: "AI가 정리한 예시 개념 페이지와 관련 조각, 이해도 상태를 확인합니다."
  },
  plan: {
    eyebrow: "AI Today",
    title: "오늘 해야 할 학습 액션을 봅니다.",
    description: "자료와 목표에서 파생된 복습 태스크를 로컬 워크스페이스 안에서 관리합니다."
  },
  search: {
    eyebrow: "Local search",
    title: "Workspace 안의 조각과 지식을 찾습니다.",
    description: "자료, Wiki, 프로젝트, 할 일을 로컬 데이터 기준으로 빠르게 검색합니다."
  },
  projects: {
    eyebrow: "Courses and projects",
    title: "시험, 발표, 프로젝트를 목표 단위로 추적합니다.",
    description: "사용자가 넣은 자료를 바탕으로 로컬 AI가 목표별 진행률과 다음 액션을 갱신합니다."
  },
  graph: {
    eyebrow: "Knowledge graph",
    title: "Piece 사이의 연결 관계를 탐색합니다.",
    description: "저장한 자료, 개념, 학습 목표가 어떻게 이어지는지 한 화면에서 확인합니다."
  },
  reminder: {
    eyebrow: "Reminder",
    title: "복습 알림은 로컬 알림으로 확장될 예정입니다.",
    description: "오늘의 복습 타이밍을 확인하고, 이후 로컬 알림으로 확장할 수 있게 준비합니다."
  },
  "ai-engine": {
    eyebrow: "Model settings",
    title: "로컬 AI를 기본으로 쓰고, Pro 플랜에서 클라우드 AI를 선택합니다.",
    description: "기본 엔진은 기기 안에서 실행되고, GPT와 Gemini는 유료 플랜의 선택 옵션으로 표시됩니다."
  }
};

export function App() {
  const [recentWorkspace, setRecentWorkspace] = useState<WorkspaceProfile | null>(() => readWorkspaceProfile());
  const [workspace, setWorkspace] = useState<WorkspaceProfile | null>(null);
  const [syncUser, setSyncUser] = useState<SyncUser | null>(() => readSyncUser());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode());
  const [activeView, setActiveView] = useState<ViewKey>("workspace");
  const [fragments, setFragments] = useState<Fragment[]>(fallbackFragments);
  const [wiki, setWiki] = useState<WikiConcept[]>(fallbackWiki);
  const [tasks, setTasks] = useState<StudyTask[]>(fallbackTasks);
  const [projects, setProjects] = useState<Project[]>(fallbackProjects);
  const [graph, setGraph] = useState<GraphData>(fallbackGraph);
  const [reminders, setReminders] = useState<Reminder[]>(fallbackReminders);
  const [providers, setProviders] = useState<ProviderSettings>(fallbackProviders);
  const [apiOnline, setApiOnline] = useState(false);

  const openWorkspace = (profile: WorkspaceProfile) => {
    const nextProfile = { ...profile, lastOpenedAt: new Date().toISOString() };
    writeWorkspaceProfile(nextProfile);
    setRecentWorkspace(nextProfile);
    setWorkspace(nextProfile);
    setActiveView("workspace");
  };

  const createWorkspace = (name: string) => {
    const now = new Date().toISOString();
    openWorkspace({
      id: `workspace-local-${Date.now()}`,
      name,
      storageLabel: "Local Device",
      createdAt: now,
      lastOpenedAt: now
    });
  };

  const loadData = useCallback(async () => {
    await api.health();
    const [nextFragments, nextWiki, nextTasks, nextProjects, nextGraph, nextReminders, nextProviders] =
      await Promise.all([
        api.fragments(),
        api.wiki(),
        api.todayTasks(),
        api.projects(),
        api.graph(),
        api.reminders(),
        api.providers()
      ]);

    setFragments(nextFragments);
    setWiki(nextWiki);
    setTasks(nextTasks);
    setProjects(nextProjects);
    setGraph(nextGraph);
    setReminders(nextReminders);
    setProviders(nextProviders);
    setApiOnline(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadData().catch(() => {
      if (!cancelled) setApiOnline(false);
    });

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const darkEnabled = themeMode === "dark" || (themeMode === "system" && mediaQuery.matches);
      document.documentElement.classList.toggle("dark", darkEnabled);
      document.documentElement.dataset.theme = themeMode;
    };

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);

    return () => {
      mediaQuery.removeEventListener("change", applyTheme);
    };
  }, [themeMode]);

  const createFallbackFragment = (payload: CreateFragmentPayload): Fragment => ({
    id: `fragment-local-${Date.now()}`,
    title: payload.title,
    kind: payload.kind,
    source: payload.source || "직접 입력",
    project: payload.project || "미분류",
    summary: payload.summary || "아직 요약이 없습니다.",
    status: "Imported",
    created_at: "방금 전"
  });

  const createFallbackProject = (payload: CreateProjectPayload): Project => {
    const goals = payload.goals.filter(Boolean).map((goal, index) => ({
      id: `goal-local-${Date.now()}-${index}`,
      title: goal,
      status: "not_started" as const
    }));

    return {
      id: `project-local-${Date.now()}`,
      title: payload.title,
      kind: payload.kind,
      d_day: payload.d_day || "상시",
      progress: 0,
      next_action: "프로젝트 목표와 관련된 첫 자료를 Inbox에 추가하세요.",
      goals: goals.length > 0 ? goals : [{ id: `goal-local-${Date.now()}`, title: "목표 정의", status: "not_started" }],
      evidence_count: 0,
      progress_note: "로컬 엔진이 꺼져 있어 예시 계산값으로 표시합니다."
    };
  };

  const handleCreateFragment = async (payload: CreateFragmentPayload) => {
    try {
      const created = await api.createFragment(payload);
      const [nextGraph, nextProjects] = await Promise.all([api.graph(), api.projects()]);
      setFragments((current) => [created, ...current]);
      setGraph(nextGraph);
      setProjects(nextProjects);
      setApiOnline(true);
    } catch {
      const created = createFallbackFragment(payload);
      setFragments((current) => [created, ...current]);
      setGraph((current) => ({
        ...current,
        nodes: [{ id: created.id, label: created.title, category: "fragment", summary: created.summary }, ...current.nodes]
      }));
      setApiOnline(false);
    }
  };

  const handleDeleteFragment = async (fragmentId: string) => {
    const previousFragments = fragments;
    const previousGraph = graph;
    const previousWiki = wiki;
    const previousProjects = projects;

    setFragments((current) => current.filter((item) => item.id !== fragmentId));
    setGraph((current) => ({
      nodes: current.nodes.filter((node) => node.id !== fragmentId),
      edges: current.edges.filter((edge) => edge.source !== fragmentId && edge.target !== fragmentId)
    }));
    setWiki((current) =>
      current.map((concept) => ({
        ...concept,
        related_fragments: concept.related_fragments.filter((item) => item !== fragmentId)
      }))
    );

    try {
      await api.deleteFragment(fragmentId);
      const nextProjects = await api.projects();
      setProjects(nextProjects);
      setApiOnline(true);
    } catch {
      setFragments(previousFragments);
      setGraph(previousGraph);
      setWiki(previousWiki);
      setProjects(previousProjects);
      setApiOnline(false);
    }
  };

  const handleCreateTask = async (payload: CreateStudyTaskPayload) => {
    try {
      const created = await api.createTodayTask(payload);
      const nextGraph = await api.graph();
      setTasks((current) => [created, ...current]);
      setGraph(nextGraph);
      setApiOnline(true);
    } catch {
      const created: StudyTask = { id: `task-local-${Date.now()}`, done: false, ...payload };
      setTasks((current) => [created, ...current]);
      setGraph((current) => ({
        ...current,
        nodes: [{ id: created.id, label: created.title, category: "task", summary: created.reason }, ...current.nodes]
      }));
      setApiOnline(false);
    }
  };

  const handleToggleTask = async (task: StudyTask) => {
    const nextDone = !task.done;
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, done: nextDone } : item)));

    try {
      const updated = await api.updateTodayTask(task.id, nextDone);
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const previousTasks = tasks;
    const previousGraph = graph;

    setTasks((current) => current.filter((item) => item.id !== taskId));
    setGraph((current) => ({
      nodes: current.nodes.filter((node) => node.id !== taskId),
      edges: current.edges.filter((edge) => edge.source !== taskId && edge.target !== taskId)
    }));

    try {
      await api.deleteTodayTask(taskId);
      setApiOnline(true);
    } catch {
      setTasks(previousTasks);
      setGraph(previousGraph);
      setApiOnline(false);
    }
  };

  const handleCreateProject = async (payload: CreateProjectPayload) => {
    try {
      const created = await api.createProject(payload);
      const nextGraph = await api.graph();
      setProjects((current) => [created, ...current]);
      setGraph(nextGraph);
      setApiOnline(true);
    } catch {
      const created = createFallbackProject(payload);
      setProjects((current) => [created, ...current]);
      setGraph((current) => ({
        ...current,
        nodes: [{ id: created.id, label: created.title, category: "project", summary: created.kind }, ...current.nodes]
      }));
      setApiOnline(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const previousProjects = projects;
    const previousGraph = graph;

    setProjects((current) => current.filter((project) => project.id !== projectId));
    setGraph((current) => ({
      nodes: current.nodes.filter((node) => node.id !== projectId),
      edges: current.edges.filter((edge) => edge.source !== projectId && edge.target !== projectId)
    }));

    try {
      await api.deleteProject(projectId);
      setApiOnline(true);
    } catch {
      setProjects(previousProjects);
      setGraph(previousGraph);
      setApiOnline(false);
    }
  };

  const handleCreateReminder = async (payload: CreateReminderPayload) => {
    try {
      const created = await api.createReminder(payload);
      setReminders((current) => [created, ...current]);
      setApiOnline(true);
    } catch {
      setReminders((current) => [{ id: `reminder-local-${Date.now()}`, ...payload }, ...current]);
      setApiOnline(false);
    }
  };

  const handleDeleteReminder = async (reminderId: string) => {
    const previous = reminders;
    setReminders((current) => current.filter((item) => item.id !== reminderId));

    try {
      await api.deleteReminder(reminderId);
      setApiOnline(true);
    } catch {
      setReminders(previous);
      setApiOnline(false);
    }
  };

  const handlePlanChange = async (tier: "free" | "pro") => {
    try {
      const nextProviders = await api.updatePlan(tier);
      setProviders(nextProviders);
      setApiOnline(true);
    } catch {
      setProviders((current) => ({
        plan: { tier, cloudProvidersEnabled: tier === "pro" },
        providers: current.providers.map((provider) => {
          if (provider.requiredPlan === "free") {
            return { ...provider, selected: tier === "free" || provider.selected, status: "available" };
          }

          const available = tier === "pro";
          return { ...provider, status: available ? "available" : "locked", selected: available ? provider.selected : false };
        })
      }));
      setApiOnline(false);
    }
  };

  const refreshWorkspace = async () => {
    try {
      await loadData();
    } catch {
      setApiOnline(false);
    }
  };

  const handleSyncLogin = () => {
    writeSyncUser(mockSyncUser);
    setSyncUser(mockSyncUser);
  };

  const handleSyncLogout = () => {
    clearSyncUser();
    setSyncUser(null);
  };

  const handleThemeChange = (mode: ThemeMode) => {
    writeThemeMode(mode);
    setThemeMode(mode);
  };

  const currentCopy = viewCopy[activeView];
  const organizedCount = fragments.filter((fragment) => fragment.status === "Organized" || fragment.status.includes("완료")).length;
  const workspaceName = workspace?.name ?? "My Study Pool";

  if (!workspace) {
    return (
      <WorkspaceGate
        recentWorkspace={recentWorkspace}
        onCreateWorkspace={createWorkspace}
        onOpenWorkspace={openWorkspace}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-mist text-ink">
      <Sidebar
        activeView={activeView}
        workspaceName={workspaceName}
        syncUser={syncUser}
        themeMode={themeMode}
        onChangeView={setActiveView}
        onSelectWorkspace={() => setWorkspace(null)}
        onLogin={handleSyncLogin}
        onLogout={handleSyncLogout}
        onThemeChange={handleThemeChange}
      />
      <Shell
        eyebrow={currentCopy.eyebrow}
        title={activeView === "workspace" ? workspaceName : currentCopy.title}
        description={currentCopy.description}
        localStatus={apiOnline ? "Offline Ready" : "Local Preview"}
        workspaceName={workspaceName}
        aside={
          activeView === "graph" ? undefined : (
            <div className="space-y-5">
            <Panel>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Workspace Status</p>
              <p className="mt-2 text-lg font-black text-ink">{workspaceName}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {apiOnline
                  ? "저장 위치: Local Device. 네트워크 없이도 자료를 확인할 수 있습니다."
                  : "로컬 엔진이 꺼져 있어 내장 예시 데이터로 미리 봅니다."}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-mist p-3">
                  <p className="text-xs font-bold text-slate-500">Pieces</p>
                  <p className="mt-1 text-lg font-black text-ink">{fragments.length}</p>
                </div>
                <div className="rounded-lg bg-mist p-3">
                  <p className="text-xs font-bold text-slate-500">Organized</p>
                  <p className="mt-1 text-lg font-black text-ink">{organizedCount}</p>
                </div>
              </div>
            </Panel>
            <Panel>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Plan</p>
              <p className="mt-2 text-lg font-black text-ink">{providers.plan.tier === "pro" ? "Pro Preview" : "Free Local"}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                로컬 정리는 기본 제공이고, 클라우드 AI 선택은 Plan 화면에서 잠긴 옵션으로만 미리 보여줍니다.
              </p>
            </Panel>
          </div>
          )
        }
      >
        {activeView === "workspace" ? (
          <WorkspaceView
            workspaceName={workspaceName}
            fragments={fragments}
            tasks={tasks}
            projects={projects}
            graph={graph}
            apiOnline={apiOnline}
            onCreateFragment={handleCreateFragment}
            onChangeView={setActiveView}
          />
        ) : null}
        {activeView === "inbox" ? (
          <InboxView
            fragments={fragments}
            projectOptions={projects.map((project) => project.title)}
            onCreateFragment={handleCreateFragment}
            onDeleteFragment={handleDeleteFragment}
          />
        ) : null}
        {activeView === "search" ? <SearchView fragments={fragments} concepts={wiki} projects={projects} tasks={tasks} /> : null}
        {activeView === "wiki" ? <WikiView concepts={wiki} fragments={fragments} /> : null}
        {activeView === "plan" ? (
          <PlanView
            tasks={tasks}
            providerSettings={providers}
            onCreateTask={handleCreateTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onPlanChange={handlePlanChange}
          />
        ) : null}
        {activeView === "projects" ? (
          <ProjectsView projects={projects} onCreateProject={handleCreateProject} onDeleteProject={handleDeleteProject} />
        ) : null}
        {activeView === "graph" ? <GraphView graph={graph} /> : null}
        {activeView === "reminder" ? (
          <ReminderView reminders={reminders} onCreateReminder={handleCreateReminder} onDeleteReminder={handleDeleteReminder} />
        ) : null}
        {activeView === "ai-engine" ? (
          <AiEngineView
            settings={providers}
            onSettingsChange={setProviders}
            onPlanChange={handlePlanChange}
            onWorkspaceRefresh={refreshWorkspace}
          />
        ) : null}
      </Shell>
    </div>
  );
}
