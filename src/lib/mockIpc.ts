// Tauri 밖(브라우저 vite)에서 UI를 확인하기 위한 mock. 백엔드 seed 와 동일한 데이터 형태.
// 실제 동작은 Tauri 데스크톱(get_workspace 가 ~/PiecePool 시드)에서 한다.
import type {
  Workspace,
  KnowledgeSpace,
  Subject,
  ArchiveNote,
  WikiPage,
  Relation,
  GraphData,
  GraphNode,
  SourceType,
} from "./types";

const NOW = "2026-07-01T00:00:00Z";
let memNotes: Record<string, ArchiveNote[]> = {
  "operating-systems": [
    {
      id: "source-os-overview",
      spaceId: "space-os",
      sourceId: "source-os-overview",
      path: "2026-07-01-os-overview.md",
      title: "운영체제 개요 강의 노트",
      markdown:
        "# 운영체제 개요\n\n운영체제의 핵심 기능은 프로세스 관리, 메모리 관리, 동기화다.\n프로세스 스케줄링은 CPU 이용률을 극대화한다.",
      subjectIds: ["subject-os"],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  deeplearning: [],
};

const SPACES: KnowledgeSpace[] = [
  { id: "space-os", name: "운영체제", slug: "operating-systems", rootPath: "", createdAt: NOW, updatedAt: NOW },
  { id: "space-ai", name: "AI 딥러닝", slug: "deeplearning", rootPath: "", createdAt: NOW, updatedAt: NOW },
];

function wiki(space: string, concept: string, title: string, body: string): WikiPage {
  return {
    id: `wiki-${concept}`,
    spaceId: space,
    conceptId: `concept-${concept}`,
    title,
    path: `${concept}.md`,
    subjectIds: [space === "space-os" ? "subject-os" : "subject-ai"],
    sourceIds: [],
    sourceRefs: [],
    markdown: body,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const WIKI: Record<string, WikiPage[]> = {
  "operating-systems": [
    wiki("space-os", "process", "프로세스", "# 프로세스\n\n프로세스는 실행 중인 프로그램의 인스턴스다. 코드·데이터·스택·PCB로 구성된다.\n\n## 상태\n\n생성 → 준비 → 실행 → 대기 → 종료.\n\n## 관련 개념\n\n실행 단위는 [[스레드]], 실행 순서는 [[CPU 스케줄링]]이 결정한다."),
    wiki("space-os", "thread", "스레드", "# 스레드\n\n스레드는 프로세스 내부의 실행 단위다. 같은 프로세스의 스레드는 코드·데이터·힙을 공유한다."),
    wiki("space-os", "cpu-scheduling", "CPU 스케줄링", "# CPU 스케줄링\n\n실행 가능한 프로세스들 사이에서 CPU를 할당한다. 선점형/비선점형.\n\n- FCFS, SJF, Round Robin, Priority"),
    wiki("space-os", "synchronization", "동기화", "# 동기화\n\n공유 자원 동시 접근을 조율한다. 임계 구역 문제를 뮤텍스·세마포어·모니터로 해결한다.\n\n여러 [[스레드]]가 경쟁할 때 잘못 다루면 [[교착상태]]가 발생한다."),
    wiki("space-os", "deadlock", "교착상태", "# 교착상태 (Deadlock)\n\n둘 이상의 프로세스가 서로의 자원을 기다리며 진행하지 못하는 상태.\n\n## 발생 조건\n\n상호 배제, 점유와 대기, 비선점, 순환 대기."),
  ],
  deeplearning: [
    wiki("space-ai", "transformer", "트랜스포머", "# 트랜스포머\n\nself-attention 만으로 시퀀스를 처리하는 신경망 구조. 인코더-디코더."),
    wiki("space-ai", "self-attention", "셀프 어텐션", "# 셀프 어텐션\n\n토큰들이 서로의 관계를 계산해 문맥 표현을 만든다. Query·Key·Value 내적."),
    wiki("space-ai", "embedding", "임베딩", "# 임베딩\n\n토큰을 연속 벡터 공간으로 사상한다. 의미가 가까우면 벡터도 가깝다."),
  ],
};

function rel(space: string, s: string, t: string, type: string, strength: number): Relation {
  return {
    id: `rel-${s}-${t}`,
    spaceId: space,
    sourceNodeId: `concept-${s}`,
    targetNodeId: `concept-${t}`,
    relationType: type as Relation["relationType"],
    strength,
    confidence: 0.9,
    explanation: "",
    evidence: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const RELATIONS: Record<string, Relation[]> = {
  "operating-systems": [
    rel("space-os", "thread", "process", "part_of", 0.9),
    rel("space-os", "cpu-scheduling", "process", "used_in", 0.8),
    rel("space-os", "synchronization", "process", "related_to", 0.6),
    rel("space-os", "synchronization", "thread", "prerequisite", 0.5),
    rel("space-os", "synchronization", "deadlock", "causes", 0.85),
  ],
  deeplearning: [
    rel("space-ai", "self-attention", "transformer", "part_of", 0.9),
    rel("space-ai", "embedding", "transformer", "prerequisite", 0.7),
    rel("space-ai", "embedding", "self-attention", "used_in", 0.6),
  ],
};

const SUBJECTS: Record<string, Subject[]> = {
  "operating-systems": [{ id: "subject-os", spaceId: "space-os", name: "운영체제론", color: "#0075de", createdAt: NOW, updatedAt: NOW }],
  deeplearning: [{ id: "subject-ai", spaceId: "space-ai", name: "AI 딥러닝", color: "#2a9d99", createdAt: NOW, updatedAt: NOW }],
};

const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

function graphOf(space: string): GraphData {
  const rels = RELATIONS[space] ?? [];
  const out: Record<string, number> = {};
  const inn: Record<string, number> = {};
  rels.forEach((r) => {
    out[r.sourceNodeId] = (out[r.sourceNodeId] ?? 0) + 1;
    inn[r.targetNodeId] = (inn[r.targetNodeId] ?? 0) + 1;
  });
  const nodes: GraphNode[] = (WIKI[space] ?? []).map((w) => {
    const id = w.conceptId;
    const kind: GraphNode["kind"] = (out[id] ?? 0) === 0 && (inn[id] ?? 0) > 0 ? "result" : "core";
    return { id, title: w.title, kind, subjectIds: w.subjectIds, path: w.path };
  });
  return { nodes, relations: rels };
}

export const mock = {
  getWorkspace: () =>
    delay<Workspace>({ id: "ws", name: "PiecePool Workspace", rootPath: "~/PiecePool", createdAt: NOW, updatedAt: NOW }),
  listSpaces: () => delay(SPACES),
  listSubjects: (space: string) => delay(SUBJECTS[space] ?? []),
  listSources: (_space: string) => delay<string[]>([]),
  extractPdfText: (_space: string, file: string) =>
    delay({ pageCount: 1, pages: [{ page: 1, text: `(브라우저 mock — ${file} 의 PDF 추출은 Tauri 데스크톱에서)` }] }),
  readFileBytes: (_space: string, _file: string) => delay<string>(""),
  listNotes: (space: string) => delay(memNotes[space] ?? []),
  listSourceTypes: (_space: string) => delay<[string, SourceType][]>([]),
  readNote: (space: string, file: string) => delay((memNotes[space] ?? []).find((n) => n.path === file)!),
  createNote: (space: string, title: string, markdown: string, subjectIds: string[]) => {
    const n: ArchiveNote = {
      id: `source-${Date.now()}`,
      spaceId: space,
      sourceId: `source-${Date.now()}`,
      path: `2026-07-01-${title}.md`,
      title,
      markdown,
      subjectIds,
      createdAt: NOW,
      updatedAt: NOW,
    };
    memNotes[space] = [n, ...(memNotes[space] ?? [])];
    return delay(n);
  },
  saveNote: (space: string, file: string, markdown: string) => {
    const n = (memNotes[space] ?? []).find((x) => x.path === file)!;
    n.markdown = markdown;
    return delay(n);
  },
  moveNote: (space: string, file: string, toSpace: string) => {
    const n = (memNotes[space] ?? []).find((x) => x.path === file);
    if (!n || space === toSpace) return Promise.reject(new Error("이동할 수 없습니다"));
    memNotes[space] = (memNotes[space] ?? []).filter((x) => x.path !== file);
    const targetSpaceId = SPACES.find((s) => s.slug === toSpace)?.id ?? n.spaceId;
    // 과목은 공간별 — 대상 공간에 없는 subject 는 떨군다(백엔드와 동일 규칙).
    const known = new Set((SUBJECTS[toSpace] ?? []).map((s) => s.id));
    const moved: ArchiveNote = { ...n, spaceId: targetSpaceId, subjectIds: n.subjectIds.filter((id) => known.has(id)), updatedAt: NOW };
    memNotes[toSpace] = [moved, ...(memNotes[toSpace] ?? [])];
    return delay(moved);
  },
  deleteNote: (space: string, file: string) => {
    memNotes[space] = (memNotes[space] ?? []).filter((x) => x.path !== file);
    return delay(undefined as void);
  },
  renameNote: (space: string, file: string, newTitle: string) => {
    const n = (memNotes[space] ?? []).find((x) => x.path === file)!;
    n.title = newTitle;
    n.updatedAt = NOW;
    return delay(n);
  },
  listWiki: (space: string) => delay(WIKI[space] ?? []),
  readWiki: (space: string, file: string) => delay((WIKI[space] ?? []).find((w) => w.path === file)!),
  saveWiki: (space: string, page: WikiPage) => {
    const arr = WIKI[space] ?? (WIKI[space] = []);
    const i = arr.findIndex((w) => w.path === page.path);
    if (i >= 0) arr[i] = page;
    else arr.push(page);
    return delay(page);
  },
  deleteWiki: (space: string, file: string) => {
    const page = (WIKI[space] ?? []).find((w) => w.path === file);
    WIKI[space] = (WIKI[space] ?? []).filter((w) => w.path !== file);
    const before = (RELATIONS[space] ?? []).length;
    if (page) {
      RELATIONS[space] = (RELATIONS[space] ?? []).filter(
        (r) => r.sourceNodeId !== page.conceptId && r.targetNodeId !== page.conceptId,
      );
    }
    return delay(before - (RELATIONS[space] ?? []).length);
  },
  renameWiki: (space: string, file: string, newTitle: string) => {
    const w = (WIKI[space] ?? []).find((x) => x.path === file)!;
    w.title = newTitle;
    w.updatedAt = NOW;
    return delay(w);
  },
  saveSourceFile: (_space: string, name: string, _dataBase64: string) => delay(name),
  deleteSource: (_space: string, _file: string) => delay<void>(undefined),
  getGraph: (space: string) => delay(graphOf(space)),
  appendRelations: (space: string, relations: Relation[]) => {
    RELATIONS[space] = [...(RELATIONS[space] ?? []), ...relations];
    return delay(RELATIONS[space].length);
  },
};
