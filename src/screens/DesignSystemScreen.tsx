import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Logo,
  ThemeToggle,
  Button,
  IconButton,
  Card,
  Input,
  Field,
  SearchInput,
  Badge,
  Avatar,
  SkeletonText,
  Tabs,
  Divider,
  Waveform,
  TopBar,
  Sidebar,
  SubjectCard,
  PricingCard,
  ConceptGraph,
  GraphLegend,
  WikiPage,
  WikiHeading,
  WikiParagraph,
  FileDropzone,
  EmptyState,
  AIWritingBanner,
  PlaceholderPanel,
  Icons,
} from "../ds";
import type { GraphNode, GraphEdge, TreeNode } from "../ds";

// ── 데모 데이터 ──────────────────────────────────────────────
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

const GRAPH_NODES: GraphNode[] = [
  { id: "proc", label: "프로세스", x: 0.5, y: 0.16, kind: "core" },
  { id: "thread", label: "스레드", x: 0.2, y: 0.5, kind: "core" },
  { id: "cpu", label: "CPU 스케줄링", x: 0.82, y: 0.5, kind: "core" },
  { id: "sync", label: "동기화", x: 0.42, y: 0.85, kind: "core" },
  { id: "dead", label: "교착상태", x: 0.72, y: 0.85, kind: "result" },
];
const GRAPH_EDGES: GraphEdge[] = [
  { source: "proc", target: "thread" },
  { source: "proc", target: "cpu" },
  { source: "proc", target: "sync" },
  { source: "thread", target: "sync", weak: true },
  { source: "sync", target: "dead" },
];

// ── 갤러리 헬퍼 ──────────────────────────────────────────────
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="ds-eyebrow text-ink-faint uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const SWATCHES: { name: string; cls: string }[] = [
  { name: "canvas", cls: "bg-canvas" },
  { name: "surface", cls: "bg-surface" },
  { name: "surface-soft", cls: "bg-surface-soft" },
  { name: "primary (blue)", cls: "bg-primary" },
  { name: "primary-active", cls: "bg-primary-active" },
  { name: "fill (ink)", cls: "bg-fill" },
  { name: "secondary", cls: "bg-secondary" },
  { name: "hairline", cls: "bg-hairline" },
];

const STICKERS = ["bg-sticker-sky", "bg-sticker-purple", "bg-sticker-pink", "bg-sticker-orange", "bg-sticker-teal", "bg-sticker-green"];

export default function DesignSystemScreen() {
  return (
    <div className="min-h-full bg-canvas text-ink">
      {/* 갤러리 헤더 */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-canvas/90 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Logo size={22} />
          <Divider orientation="vertical" className="h-5" />
          <span className="text-[15px] text-ink-muted">Design System · Notion</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/home-demo">
            <Button variant="primary" size="sm" rightIcon={<Icons.ArrowRightIcon size={14} />}>
              홈 화면 데모
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-14 px-8 py-10">
        {/* Foundations */}
        <Section title="Foundations · Color">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SWATCHES.map((s) => (
              <div key={s.name} className="space-y-1.5">
                <div className={`h-16 rounded-lg border border-hairline ${s.cls}`} />
                <p className="text-[13px] text-ink-muted">{s.name}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[13px] text-ink-muted">sticker palette (장식 전용 — CTA/구조에 사용 금지)</p>
            <div className="flex gap-2">
              {STICKERS.map((c) => (
                <span key={c} className={`h-8 w-8 rounded-md ${c}`} />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Foundations · Typography (NotionInter)">
          <Card padding="lg" className="space-y-3">
            <p className="ds-display-2 text-ink">Display · 64/54</p>
            <p className="ds-h1 text-ink">Heading 1 · 운영체제론</p>
            <p className="ds-h3 text-ink">Heading 3 · 프로세스 스케줄링</p>
            <p className="ds-body text-ink-2">Body · 운영체제의 핵심 기능 중 하나인 프로세스 스케줄링은 CPU 이용률을 극대화합니다.</p>
            <p className="ds-eyebrow text-primary">EYEBROW · ESSENTIAL FOR STAYING ORGANIZED</p>
          </Card>
        </Section>

        {/* Primitives */}
        <Section title="Primitives · Buttons">
          <Row label="variants">
            <Button variant="primary">Get started</Button>
            <Button variant="solid">파일 선택</Button>
            <Button variant="secondary">Request a demo</Button>
            <Button variant="utility">Select plan</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Learn more</Button>
            <Button variant="primary" rightIcon={<Icons.ArrowRightIcon size={16} />}>
              Sign In
            </Button>
          </Row>
          <Row label="sizes / state">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </Row>
          <Row label="icon buttons">
            <IconButton aria-label="검색">
              <Icons.SearchIcon size={18} />
            </IconButton>
            <IconButton aria-label="알림" circular>
              <Icons.BellIcon size={18} />
            </IconButton>
            <IconButton aria-label="설정" active>
              <Icons.GearIcon size={18} />
            </IconButton>
          </Row>
        </Section>

        <Section title="Primitives · Inputs">
          <div className="grid max-w-md gap-4">
            <SearchInput containerClassName="w-72" />
            <Field label="Username">
              <Input placeholder="Enter your identity" />
            </Field>
            <Field label="Password" action="Forgot?">
              <Input type="password" placeholder="••••••••" />
            </Field>
            <Field label="Invalid" hint="이 필드는 필수입니다.">
              <Input invalid defaultValue="잘못된 값" />
            </Field>
          </div>
        </Section>

        <Section title="Primitives · Badges / Avatar / Tabs / Skeleton">
          <Row label="badges (pill)">
            <Badge variant="primary" eyebrow>
              ESSENTIAL
            </Badge>
            <Badge variant="solid">RECOMMENDED</Badge>
            <Badge variant="neutral">neutral</Badge>
          </Row>
          <Row label="avatar / waveform">
            <Avatar name="Min Park" />
            <Avatar />
            <span className="text-ink">
              <Waveform />
            </span>
          </Row>
          <Row label="tabs">
            <Tabs
              items={[
                { value: "wiki", label: "위키", icon: <Icons.FileIcon size={14} /> },
                { value: "graph", label: "그래프", icon: <Icons.GraphIcon size={14} /> },
              ]}
            />
          </Row>
          <div className="max-w-md space-y-3">
            <p className="text-[13px] text-ink-muted">skeleton</p>
            <SkeletonText lines={3} />
          </div>
        </Section>

        {/* Components */}
        <Section title="Components · Subject cards">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SUBJECTS.map((s, i) => (
              <SubjectCard key={s.title} {...s} selected={i === 0} />
            ))}
          </div>
        </Section>

        <Section title="Components · Pricing">
          <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
            <PricingCard eyebrow="Entry level" name="Basic" price="$0" period="/ month" cta="Get Started" />
            <PricingCard
              recommended
              eyebrow="Institutional choice"
              name="Professional"
              price="$49"
              period="/ month"
              description="Advanced precision tools for research teams."
              features={["무제한 위키 생성", "그래프 관계 분석", "우선 지원"]}
              cta="Upgrade to Pro"
            />
          </div>
        </Section>

        <Section title="Components · Concept graph">
          <Card padding="lg">
            <ConceptGraph
              title="학습 개념 그래프"
              nodes={GRAPH_NODES}
              edges={GRAPH_EDGES}
              caption="노드에 마우스를 올리면 연결 관계가 보여요."
            />
          </Card>
          <GraphLegend items={[{ kind: "core", label: "개념" }, { kind: "edge", label: "연결" }, { kind: "weak", label: "약한 관계" }]} />
        </Section>

        <Section title="Components · Wiki page">
          <WikiPage title="운영체제론" onSave={() => {}} onShare={() => {}}>
            <div>
              <WikiHeading>운영체제 개요 (Operating Systems Overview)</WikiHeading>
            </div>
            <p className="text-[16px] font-bold text-ink">1. 프로세스 스케줄링 (Process Scheduling)</p>
            <WikiParagraph>
              운영체제의 핵심 기능 중 하나인 프로세스 스케줄링은 CPU 이용률을 극대화하기 위해 실행 가능한 프로세스들 사이에서
              CPU를 할당하는 과정을 관리합니다.
            </WikiParagraph>
            <p className="text-[16px] font-bold text-ink">2. 메모리 관리 (Memory Management)</p>
            <WikiParagraph>
              가상 메모리 시스템은 물리적 메모리의 한계를 극복하게 해줍니다. 페이징과 세그멘테이션 기법을 통해 프로세스는 실제
              물리 메모리보다 큰 주소 공간을 사용할 수 있습니다.
            </WikiParagraph>
          </WikiPage>
        </Section>

        <Section title="Components · AI writing / dropzone / empty / placeholder">
          <AIWritingBanner />
          <FileDropzone />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card padding="none">
              <EmptyState
                icon={<Icons.FileIcon size={28} />}
                title="아직 문서가 없어요"
                description="PDF를 업로드하면 위키가 자동 생성됩니다."
                action={<Button variant="solid" size="sm">파일 선택</Button>}
              />
            </Card>
            <PlaceholderPanel />
          </div>
        </Section>

        <Section title="Components · Navigation (TopBar · Sidebar)">
          <Card padding="none" className="overflow-hidden">
            <TopBar user={{ name: "Admin" }} />
            <div className="flex h-72">
              <Sidebar nodes={TREE} selectedId="vec" defaultExpandedIds={["ai", "la"]} />
              <div className="flex-1 p-6 text-[15px] text-ink-muted">본문 영역</div>
            </div>
          </Card>
        </Section>
      </div>
    </div>
  );
}
