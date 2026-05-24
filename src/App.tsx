import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api/client";
import { AiEngineView } from "./components/AiEngineView";
import { GraphView } from "./components/GraphView";
import { InboxView } from "./components/InboxView";
import { PlanView } from "./components/PlanView";
import { ProjectsView } from "./components/ProjectsView";
import { ReminderView } from "./components/ReminderView";
import { Shell, Panel } from "./components/Shell";
import { Sidebar } from "./components/Sidebar";
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
  CreateReminderPayload,
  CreateStudyTaskPayload,
  Fragment,
  GraphData,
  Project,
  ProviderSettings,
  Reminder,
  StudyTask,
  UpdateProjectPayload,
  ViewKey,
  WikiConcept
} from "./types";

const viewCopy: Record<ViewKey, { title: string; eyebrow: string; description: string }> = {
  inbox: {
    eyebrow: "Local workspace",
    title: "흩어진 자료를 로컬 Inbox에 모읍니다.",
    description: "PDF, 텍스트, 이미지, 링크, 오디오 조각을 한 곳에 보관하고 나중에 AI 정리 흐름으로 연결합니다."
  },
  wiki: {
    eyebrow: "Living wiki",
    title: "자료가 다시 사용할 수 있는 지식 페이지로 바뀝니다.",
    description: "AI가 정리한 예시 개념 페이지와 관련 조각, 이해도 상태를 확인합니다."
  },
  plan: {
    eyebrow: "Today plan",
    title: "오늘 해야 할 학습 액션을 봅니다.",
    description: "자료와 목표에서 파생된 복습 태스크를 로컬 워크스페이스 안에서 관리합니다."
  },
  projects: {
    eyebrow: "Courses and projects",
    title: "시험, 발표, 프로젝트를 목표 단위로 추적합니다.",
    description: "D-day, 진행률, 다음 액션을 한 화면에서 확인합니다."
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
  const [activeView, setActiveView] = useState<ViewKey>("inbox");
  const [fragments, setFragments] = useState<Fragment[]>(fallbackFragments);
  const [wiki, setWiki] = useState<WikiConcept[]>(fallbackWiki);
  const [tasks, setTasks] = useState<StudyTask[]>(fallbackTasks);
  const [projects, setProjects] = useState<Project[]>(fallbackProjects);
  const [graph, setGraph] = useState<GraphData>(fallbackGraph);
  const [reminders, setReminders] = useState<Reminder[]>(fallbackReminders);
  const [providers, setProviders] = useState<ProviderSettings>(fallbackProviders);
  const [apiOnline, setApiOnline] = useState(false);

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

  const createFallbackFragment = (payload: CreateFragmentPayload): Fragment => ({
    id: `fragment-local-${Date.now()}`,
    title: payload.title,
    kind: payload.kind,
    source: payload.source || "직접 입력",
    project: payload.project || "미분류",
    summary: payload.summary || "아직 요약이 없습니다.",
    status: "연결 필요",
    created_at: "방금 전"
  });

  const handleCreateFragment = async (payload: CreateFragmentPayload) => {
    try {
      const created = await api.createFragment(payload);
      const nextGraph = await api.graph();
      setFragments((current) => [created, ...current]);
      setGraph(nextGraph);
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
      setApiOnline(true);
    } catch {
      setFragments(previousFragments);
      setGraph(previousGraph);
      setWiki(previousWiki);
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

  const handleUpdateProject = async (projectId: string, payload: UpdateProjectPayload) => {
    setProjects((current) => current.map((item) => (item.id === projectId ? { ...item, ...payload } : item)));

    try {
      const updated = await api.updateProject(projectId, payload);
      setProjects((current) => current.map((item) => (item.id === projectId ? updated : item)));
      setApiOnline(true);
    } catch {
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

  const currentCopy = viewCopy[activeView];
  const selectedProvider = useMemo(() => providers.providers.find((provider) => provider.selected), [providers]);

  return (
    <div className="flex h-screen overflow-hidden text-ink">
      <Sidebar activeView={activeView} onChangeView={setActiveView} />
      <Shell
        eyebrow={currentCopy.eyebrow}
        title={currentCopy.title}
        description={currentCopy.description}
        aside={
          <div className="space-y-5">
            <Panel>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Local Engine</p>
              <p className="mt-2 text-lg font-black text-ink">{apiOnline ? "Ready" : "Offline preview"}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {apiOnline
                  ? "이 기기에서 워크스페이스 데이터를 불러오고 있습니다."
                  : "로컬 엔진이 꺼져 있어 내장된 예시 데이터로 미리 봅니다."}
              </p>
            </Panel>
            <Panel>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">AI Engine</p>
              <p className="mt-2 text-lg font-black text-ink">{selectedProvider?.name ?? "Local LLM"}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                기본은 로컬 AI입니다. 클라우드 AI는 Pro 옵션으로 준비되어 있습니다.
              </p>
            </Panel>
          </div>
        }
      >
        {activeView === "inbox" ? (
          <InboxView fragments={fragments} onCreateFragment={handleCreateFragment} onDeleteFragment={handleDeleteFragment} />
        ) : null}
        {activeView === "wiki" ? <WikiView concepts={wiki} fragments={fragments} /> : null}
        {activeView === "plan" ? (
          <PlanView tasks={tasks} onCreateTask={handleCreateTask} onToggleTask={handleToggleTask} onDeleteTask={handleDeleteTask} />
        ) : null}
        {activeView === "projects" ? <ProjectsView projects={projects} onUpdateProject={handleUpdateProject} /> : null}
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
