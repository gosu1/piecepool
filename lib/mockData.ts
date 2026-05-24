import {
  BookOpen,
  Brain,
  CalendarClock,
  Camera,
  CheckCircle2,
  FileText,
  Link2,
  Mic,
  Network,
  NotebookText,
  Sparkles,
  Target
} from "lucide-react";

export type Project = {
  id: string;
  name: string;
  type: "course" | "exam" | "presentation" | "idea";
  accent: string;
  sourceCount: number;
  wikiCount: number;
};

export type InboxItem = {
  id: string;
  title: string;
  source: string;
  project: string;
  type: "PDF" | "녹음" | "사진" | "링크" | "메모";
  status: "분류 완료" | "요약 대기" | "Wiki 생성 중";
  time: string;
};

export type WikiConcept = {
  id: string;
  title: string;
  project: string;
  mastery: number;
  importance: "높음" | "중간";
  sources: number;
  summary: string;
};

export type TodayTask = {
  id: string;
  title: string;
  project: string;
  estimate: string;
  reason: string;
  done: boolean;
};

export type ProgressGoal = {
  id: string;
  title: string;
  dday: string;
  progress: number;
  next: string;
  tone: string;
};

export type GraphNode = {
  id: string;
  label: string;
  type: "piece";
  category: "project" | "concept" | "source" | "task";
  description?: string;
  contentPreview?: string;
  strength?: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  label?: string;
};

export const navItems = [
  { label: "Inbox", icon: FileText, href: "/inbox" },
  { label: "Wiki", icon: BookOpen, href: "/wiki-system" },
  { label: "Plan", icon: CalendarClock, href: "/" },
  { label: "Graph", icon: Network, href: "/graph" },
  { label: "Reminder", icon: CheckCircle2, href: "/" }
];

export const intakeActions = [
  { label: "파일 업로드", icon: FileText, description: "PDF, DOC, 슬라이드" },
  { label: "녹음 추가", icon: Mic, description: "수업 음성 메모" },
  { label: "사진 저장", icon: Camera, description: "칠판, 필기 이미지" },
  { label: "링크 수집", icon: Link2, description: "글, 영상, 레퍼런스" }
];

export const projects: Project[] = [
  {
    id: "os",
    name: "운영체제",
    type: "exam",
    accent: "bg-pool",
    sourceCount: 18,
    wikiCount: 9
  },
  {
    id: "dl",
    name: "딥러닝",
    type: "presentation",
    accent: "bg-coral",
    sourceCount: 11,
    wikiCount: 6
  },
  {
    id: "startup",
    name: "창업 아이디어",
    type: "idea",
    accent: "bg-leaf",
    sourceCount: 7,
    wikiCount: 4
  }
];

export const inboxItems: InboxItem[] = [
  {
    id: "inbox-1",
    title: "운영체제 5주차 CPU Scheduling PDF",
    source: "LMS",
    project: "운영체제",
    type: "PDF",
    status: "분류 완료",
    time: "오늘 09:42"
  },
  {
    id: "inbox-2",
    title: "딥러닝 수업 녹음 12분",
    source: "Voice Memo",
    project: "딥러닝",
    type: "녹음",
    status: "Wiki 생성 중",
    time: "오늘 08:10"
  },
  {
    id: "inbox-3",
    title: "칠판 필기 사진 - Deadlock 조건",
    source: "Gallery",
    project: "운영체제",
    type: "사진",
    status: "분류 완료",
    time: "어제 18:35"
  },
  {
    id: "inbox-4",
    title: "Transformer 시각화 글 링크",
    source: "Browser",
    project: "딥러닝",
    type: "링크",
    status: "요약 대기",
    time: "어제 14:20"
  }
];

export const wikiConcepts: WikiConcept[] = [
  {
    id: "wiki-1",
    title: "CPU Scheduling",
    project: "운영체제",
    mastery: 72,
    importance: "높음",
    sources: 5,
    summary: "FCFS, SJF, Round Robin을 시험 문제 관점으로 묶고 평균 대기시간 계산 예제를 연결했습니다."
  },
  {
    id: "wiki-2",
    title: "Deadlock 4조건",
    project: "운영체제",
    mastery: 58,
    importance: "높음",
    sources: 4,
    summary: "상호 배제, 점유 대기, 비선점, 순환 대기의 정의와 예방 전략을 한 카드로 정리했습니다."
  },
  {
    id: "wiki-3",
    title: "Self-Attention",
    project: "딥러닝",
    mastery: 64,
    importance: "중간",
    sources: 3,
    summary: "Query, Key, Value 흐름과 시각화 링크를 발표 슬라이드 초안으로 재사용할 수 있게 묶었습니다."
  }
];

export const todayTasks: TodayTask[] = [
  {
    id: "task-1",
    title: "CPU Scheduling 요약본 복습",
    project: "운영체제",
    estimate: "20분",
    reason: "중간고사 D-6, 관련 자료 5개",
    done: false
  },
  {
    id: "task-2",
    title: "Deadlock 4조건을 말로 설명하기",
    project: "운영체제",
    estimate: "10분",
    reason: "이해도 58%",
    done: false
  },
  {
    id: "task-3",
    title: "Self-Attention 예상문제 3개 풀기",
    project: "딥러닝",
    estimate: "25분",
    reason: "발표 질문 대비",
    done: true
  }
];

export const progressGoals: ProgressGoal[] = [
  {
    id: "goal-1",
    title: "운영체제 중간고사",
    dday: "D-6",
    progress: 68,
    next: "Deadlock 복습 카드 완성",
    tone: "bg-pool"
  },
  {
    id: "goal-2",
    title: "딥러닝 발표",
    dday: "D-12",
    progress: 44,
    next: "Transformer 자료 2개 요약",
    tone: "bg-coral"
  },
  {
    id: "goal-3",
    title: "창업 아이디어 스케치",
    dday: "D-18",
    progress: 31,
    next: "문제 정의 인터뷰 정리",
    tone: "bg-leaf"
  }
];

export const insightCards = [
  {
    label: "수집된 조각",
    value: "36",
    detail: "PDF, 녹음, 사진, 링크",
    icon: NotebookText
  },
  {
    label: "AI Wiki",
    value: "19",
    detail: "개념 단위로 재구성",
    icon: Brain
  },
  {
    label: "오늘 추천",
    value: "4",
    detail: "자료와 목표 기반",
    icon: Target
  },
  {
    label: "자동 분류",
    value: "82%",
    detail: "과목/프로젝트 매칭",
    icon: Sparkles
  }
];

export const graphNodes: GraphNode[] = [
  {
    id: "source-os-pdf",
    label: "운영체제 5주차 PDF",
    type: "piece",
    category: "source",
    description: "CPU Scheduling 알고리즘과 평균 대기시간 예제가 포함된 강의 PDF입니다.",
    contentPreview: "FCFS, SJF, Round Robin의 차이와 평균 대기시간 계산 예제가 정리되어 있습니다.",
    strength: 86
  },
  {
    id: "source-deadlock-photo",
    label: "칠판 필기 사진 - Deadlock 조건",
    type: "piece",
    category: "source",
    description: "수업 중 칠판에 정리한 Deadlock 발생 조건 사진입니다.",
    contentPreview: "상호 배제, 점유 대기, 비선점, 순환 대기 조건이 칠판 필기 형태로 남아 있습니다.",
    strength: 78
  },
  {
    id: "source-dl-recording",
    label: "딥러닝 수업 녹음 12분",
    type: "piece",
    category: "source",
    description: "Self-Attention 설명과 발표 질문 힌트가 포함된 수업 녹음입니다.",
    contentPreview: "Query, Key, Value를 직관적으로 설명한 부분과 발표 질의응답 힌트가 포함되어 있습니다.",
    strength: 68
  },
  {
    id: "source-transformer-link",
    label: "Transformer 시각화 글 링크",
    type: "piece",
    category: "source",
    description: "Query, Key, Value 흐름을 시각적으로 이해할 수 있는 참고 링크입니다.",
    contentPreview: "Transformer 내부 attention score 계산을 그림으로 설명하는 외부 레퍼런스입니다.",
    strength: 72
  },
  {
    id: "concept-cpu",
    label: "CPU Scheduling",
    type: "piece",
    category: "concept",
    description: "운영체제 시험에서 자주 나오는 스케줄링 방식과 계산 문제를 묶은 AI Wiki 개념입니다.",
    contentPreview: "여러 자료에서 추출된 CPU Scheduling 개념을 시험 문제 풀이 관점으로 재구성했습니다.",
    strength: 92
  },
  {
    id: "concept-deadlock",
    label: "Deadlock 4조건",
    type: "piece",
    category: "concept",
    description: "Deadlock 발생 조건과 예방 전략을 설명할 수 있도록 재구성한 개념 카드입니다.",
    contentPreview: "발생 조건과 예방/회피 전략을 한 페이지에서 복습할 수 있게 연결했습니다.",
    strength: 88
  },
  {
    id: "concept-attention",
    label: "Self-Attention",
    type: "piece",
    category: "concept",
    description: "Transformer 발표에 필요한 핵심 개념과 시각 자료를 연결한 AI Wiki 개념입니다.",
    contentPreview: "녹음과 링크를 바탕으로 Self-Attention의 흐름을 발표용 설명으로 정리했습니다.",
    strength: 84
  },
  {
    id: "project-os-midterm",
    label: "운영체제 중간고사",
    type: "piece",
    category: "project",
    description: "D-6 시험 목표입니다. CPU Scheduling과 Deadlock이 핵심 범위로 묶여 있습니다.",
    contentPreview: "시험 목표 piece입니다. 연결된 개념을 통해 오늘 복습해야 할 범위를 보여줍니다.",
    strength: 95
  },
  {
    id: "project-dl-presentation",
    label: "딥러닝 발표",
    type: "piece",
    category: "project",
    description: "Transformer와 Self-Attention 설명을 발표 흐름으로 구성하는 프로젝트입니다.",
    contentPreview: "발표 목표 piece입니다. 관련 개념과 참고 자료가 발표 준비 흐름으로 연결됩니다.",
    strength: 81
  },
  {
    id: "task-cpu-review",
    label: "CPU Scheduling 요약본 복습",
    type: "piece",
    category: "task",
    description: "운영체제 중간고사 대비로 평균 대기시간 계산 예제를 다시 확인합니다.",
    contentPreview: "CPU Scheduling 개념에서 파생된 복습 태스크입니다.",
    strength: 74
  },
  {
    id: "task-deadlock-explain",
    label: "Deadlock 4조건을 말로 설명하기",
    type: "piece",
    category: "task",
    description: "개념 이해도가 낮은 영역을 말로 설명하며 복습하는 오늘의 추천 태스크입니다.",
    contentPreview: "Deadlock 개념 이해를 점검하기 위한 말하기 복습 태스크입니다.",
    strength: 69
  },
  {
    id: "task-attention-quiz",
    label: "Self-Attention 예상문제 3개 풀기",
    type: "piece",
    category: "task",
    description: "딥러닝 발표 질문 대비를 위한 예상문제 풀이 태스크입니다.",
    contentPreview: "Self-Attention 개념에서 파생된 발표 질문 대비 태스크입니다.",
    strength: 71
  }
];

export const graphEdges: GraphEdge[] = [
  { source: "source-os-pdf", target: "concept-cpu", label: "개념 추출" },
  { source: "concept-cpu", target: "project-os-midterm", label: "시험 범위" },
  { source: "concept-cpu", target: "task-cpu-review", label: "복습 추천" },
  { source: "source-deadlock-photo", target: "concept-deadlock", label: "OCR 정리" },
  { source: "concept-deadlock", target: "project-os-midterm", label: "핵심 범위" },
  { source: "concept-deadlock", target: "task-deadlock-explain", label: "이해도 보완" },
  { source: "source-dl-recording", target: "concept-attention", label: "녹음 요약" },
  { source: "source-transformer-link", target: "concept-attention", label: "참고 자료" },
  { source: "concept-attention", target: "project-dl-presentation", label: "발표 구성" },
  { source: "concept-attention", target: "task-attention-quiz", label: "질문 대비" }
];
