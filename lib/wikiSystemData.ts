import { BookOpen, CheckCircle2, FileText, GitBranch, ShieldCheck, UserCheck } from "lucide-react";

export type WikiLayer = {
  title: string;
  subtitle: string;
  action: string;
  rule: string;
  icon: typeof FileText;
};

export type WikiFlowStep = {
  title: string;
  description: string;
};

export type IsolatedNode = {
  id: string;
  title: string;
  reason: string;
  recommendedAction: string;
  severity: "높음" | "중간" | "낮음";
};

export type ConnectionCandidate = {
  id: string;
  source: string;
  target: string;
  rationale: string;
  status: "검토 필요" | "승인 가능" | "보류";
};

export const wikiLayers: WikiLayer[] = [
  {
    title: "자료 보관함",
    subtitle: "원본을 안전하게 보관",
    action: "PDF, 링크, 녹음, 사진, 메모를 추가",
    rule: "사용자는 자료를 넣기만 하면 됩니다. PiecePool은 원본을 그대로 보관하고 정리 결과만 따로 만듭니다.",
    icon: ShieldCheck
  },
  {
    title: "지식 페이지",
    subtitle: "AI가 정리한 개념과 요약",
    action: "개념 카드, 비교표, 요약 페이지 확인",
    rule: "사용자는 문서를 직접 구조화하지 않아도 됩니다. AI가 자료를 읽고 계속 업데이트되는 지식 페이지로 바꿉니다.",
    icon: BookOpen
  },
  {
    title: "운영 설정",
    subtitle: "정리 방식과 검토 규칙",
    action: "정리 기준, 연결 승인, 복습 흐름 관리",
    rule: "사용자는 코드나 파일명을 다루지 않고, PiecePool이 제안한 정리 방식과 연결 관계를 승인합니다.",
    icon: FileText
  }
];

export const wikiFlowSteps: WikiFlowStep[] = [
  {
    title: "1. 자료 추가",
    description: "흩어진 PDF, 링크, 녹음, 사진, 메모를 Inbox에 넣습니다."
  },
  {
    title: "2. AI 정리 제안",
    description: "AI가 개념, 요약, 관련 프로젝트, 복습 후보를 제안합니다."
  },
  {
    title: "3. 사용자 확인",
    description: "사용자가 중요한 연결을 승인하거나 보류합니다."
  },
  {
    title: "4. 정리 상태 점검",
    description: "고립된 자료, 빠진 연결, 오래된 요약을 확인하고 정리합니다."
  }
];

export const isolatedNodes: IsolatedNode[] = [
  {
    id: "iso-1",
    title: "Transformer 시각화 글 링크",
    reason: "Self-Attention 외 다른 발표 구성 페이지로 이어지는 명시적 연결이 부족합니다.",
    recommendedAction: "딥러닝 발표 페이지와 직접 연결할지 검토",
    severity: "중간"
  },
  {
    id: "iso-2",
    title: "창업 아이디어 스케치",
    reason: "현재 raw source와 wiki concept 양쪽 모두에 충분히 연결되어 있지 않습니다.",
    recommendedAction: "문제 정의 인터뷰 source를 추가하거나 독립 프로젝트로 유지",
    severity: "높음"
  },
  {
    id: "iso-3",
    title: "Round Robin 예제",
    reason: "CPU Scheduling에 언급되었지만 별도 페이지나 복습 태스크가 없습니다.",
    recommendedAction: "하위 개념 페이지 생성",
    severity: "낮음"
  }
];

export const connectionCandidates: ConnectionCandidate[] = [
  {
    id: "conn-1",
    source: "Transformer 시각화 글 링크",
    target: "딥러닝 발표",
    rationale: "시각 자료가 발표 슬라이드 근거로 재사용될 가능성이 큽니다.",
    status: "승인 가능"
  },
  {
    id: "conn-2",
    source: "Round Robin 예제",
    target: "CPU Scheduling 요약본 복습",
    rationale: "계산 문제 복습 태스크에 직접 포함될 수 있습니다.",
    status: "검토 필요"
  },
  {
    id: "conn-3",
    source: "창업 아이디어 스케치",
    target: "문제 정의 인터뷰",
    rationale: "프로젝트 목표와 raw source를 잇는 인간 승인 연결 후보입니다.",
    status: "보류"
  }
];

export const wikiOpsSummary = [
  {
    label: "새 자료",
    value: "Inbox로 수집",
    icon: GitBranch
  },
  {
    label: "연결 검토",
    value: "사용자 승인",
    icon: UserCheck
  },
  {
    label: "정리 필요",
    value: "3개 발견",
    icon: CheckCircle2
  }
];
