import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AppShell,
  TopBar,
  Sidebar,
  SubjectCard,
  ConceptGraph,
  PlaceholderPanel,
  Card,
  Button,
  Icons,
} from "../ds";
import type { GraphNode, GraphEdge, TreeNode } from "../ds";

// PDF "첫화면" 디자인을 디자인 시스템 컴포넌트로 충실히 재현한 데모 화면.
const TREE: TreeNode[] = [
  { id: "dl", label: "딥러닝", type: "folder", children: [{ id: "dl-1", label: "신경망", type: "file" }] },
  {
    id: "ai",
    label: "AI공부",
    type: "folder",
    children: [
      { id: "os", label: "운영체제론", type: "folder", children: [{ id: "os-1", label: "스케줄링", type: "file" }] },
      { id: "la", label: "선형대수", type: "folder", children: [{ id: "vec", label: "벡터", type: "file" }] },
    ],
  },
  { id: "pp", label: "PiecePool", type: "folder", children: [{ id: "pp-1", label: "위키", type: "file" }] },
];

const SUBJECTS = [
  { title: "운영체제론", description: "시스템 아키텍처 및 커널 분석", documentCount: 12 },
  { title: "AI 딥러닝", description: "신경망 모델 및 트랜스포머 연구", documentCount: 8 },
  { title: "PiecePool", description: "디자인 시스템 및 위키 아카이브", documentCount: 24 },
  { title: "데이터베이스", description: "관계형 DB 및 NoSQL 최적화", documentCount: 5 },
];

const NODES: GraphNode[] = [
  { id: "os", label: "운영체제", x: 0.5, y: 0.18, kind: "core" },
  { id: "dl", label: "딥러닝", x: 0.22, y: 0.58, kind: "core" },
  { id: "la", label: "선형대수", x: 0.8, y: 0.55, kind: "core" },
  { id: "calc", label: "미적분학", x: 0.5, y: 0.86, kind: "result" },
];
const EDGES: GraphEdge[] = [
  { source: "os", target: "dl" },
  { source: "os", target: "la" },
  { source: "dl", target: "calc", weak: true },
  { source: "la", target: "calc" },
];

export default function HomeDemoScreen() {
  const [selected, setSelected] = useState(0);

  return (
    <div className="h-screen">
      <AppShell
        topBar={<TopBar user={{ name: "Admin" }} />}
        sidebar={<Sidebar nodes={TREE} selectedId="vec" defaultExpandedIds={["ai", "la"]} />}
        contentClassName="space-y-5"
      >
        {/* 갤러리로 돌아가기 */}
        <div>
          <Link to="/">
            <Button variant="ghost" size="sm" leftIcon={<Icons.ArrowRightIcon size={14} className="rotate-180" />}>
              디자인 시스템으로
            </Button>
          </Link>
        </div>

        {/* 과목 카드 그리드 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUBJECTS.map((s, i) => (
            <SubjectCard key={s.title} {...s} selected={selected === i} onClick={() => setSelected(i)} />
          ))}
        </div>

        {/* 학습 개념 그래프 */}
        <Card padding="lg">
          <ConceptGraph
            title="학습 개념 그래프"
            nodes={NODES}
            edges={EDGES}
            height={300}
            caption="노드에 마우스를 올리면 연결 관계가 보여요."
          />
        </Card>

        {/* 향후 분석 모듈 자리 */}
        <PlaceholderPanel minHeight={120} />
      </AppShell>
    </div>
  );
}
