import { describe, it, expect, beforeEach } from "vitest";

// Map 백엔드 fake localStorage — node vitest 환경엔 없다(feynmanStore.test.ts 와 동형).
// persist 미들웨어가 store 생성 시점에 window.localStorage 를 읽으므로 store import 보다 먼저 심는다.
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key() {
    return null;
  }
  get length() {
    return this.m.size;
  }
}
const g = globalThis as { localStorage?: Storage; window?: { localStorage: Storage } };
const fake = new FakeStorage() as unknown as Storage;
g.localStorage = fake;
g.window = { localStorage: fake }; // zustand persist 기본 storage 는 window.localStorage 를 본다

const { useWorkspaceStore } = await import("./workspaceStore");

beforeEach(() => {
  useWorkspaceStore.setState({
    openTabs: [],
    activeTabId: null,
    collapsedTreeIds: [],
    pinnedDocs: [],
    studyHomeDocs: [],
    recentDocs: [],
    navBack: [],
    navForward: [],
  });
});

// 공간 rename 은 slug(=폴더명)까지 바꾼다(rename_space) — 옛 slug 가 박힌 id 를 안 이으면
// 열린 탭 저장이 "unknown space" 로 무소음 실패하고 고정·홈·최근·접힘 항목이 고아가 된다.
describe("remapSpace — 공간 slug 변경 리매핑", () => {
  it("탭 id·space 필드·활성 탭을 새 slug 로 잇는다 (다른 공간은 그대로)", () => {
    useWorkspaceStore.setState({
      openTabs: [
        { id: "wiki:old:paging.md", kind: "wiki", title: "페이징", space: "old", file: "paging.md" },
        { id: "archive:old:2026-07-01-a.md", kind: "archive", title: "노트", space: "old", file: "2026-07-01-a.md" },
        { id: "graph:old", kind: "graph", title: "Graph", space: "old" },
        { id: "wiki:other:x.md", kind: "wiki", title: "남의 위키", space: "other", file: "x.md" },
        { id: "home", kind: "home", title: "Study Home" },
      ],
      activeTabId: "wiki:old:paging.md",
    });
    useWorkspaceStore.getState().remapSpace("old", "new");
    const s = useWorkspaceStore.getState();
    expect(s.openTabs.map((t) => t.id)).toEqual([
      "wiki:new:paging.md",
      "archive:new:2026-07-01-a.md",
      "graph:new",
      "wiki:other:x.md",
      "home",
    ]);
    expect(s.openTabs[0].space).toBe("new");
    expect(s.openTabs[3].space).toBe("other");
    expect(s.activeTabId).toBe("wiki:new:paging.md");
  });

  it("inbox 탭 id 는 불투명 키(초안 스토어 key)라 그대로 두고 space 필드만 잇는다", () => {
    useWorkspaceStore.setState({
      openTabs: [{ id: "inbox:old:uid1", kind: "inbox", title: "새 노트", space: "old" }],
      activeTabId: "inbox:old:uid1",
    });
    useWorkspaceStore.getState().remapSpace("old", "new");
    const s = useWorkspaceStore.getState();
    expect(s.openTabs[0].id).toBe("inbox:old:uid1");
    expect(s.openTabs[0].space).toBe("new");
    expect(s.activeTabId).toBe("inbox:old:uid1");
  });

  it("고정·홈·최근 문서 id 와 트리 접힘 id 를 잇는다", () => {
    useWorkspaceStore.setState({
      pinnedDocs: ["wiki:old:paging.md", "archive:other:b.md"],
      studyHomeDocs: ["archive:old:2026-07-01-a.md"],
      recentDocs: ["wiki:old:paging.md"],
      collapsedTreeIds: ["sp:old", "af:old", "wf:old", "sp:other"],
    });
    useWorkspaceStore.getState().remapSpace("old", "new");
    const s = useWorkspaceStore.getState();
    expect(s.pinnedDocs).toEqual(["wiki:new:paging.md", "archive:other:b.md"]);
    expect(s.studyHomeDocs).toEqual(["archive:new:2026-07-01-a.md"]);
    expect(s.recentDocs).toEqual(["wiki:new:paging.md"]);
    expect(s.collapsedTreeIds).toEqual(["sp:new", "af:new", "wf:new", "sp:other"]);
  });

  it("탭 히스토리(navBack/navForward)도 잇는다 — 뒤로가기가 죽은 id 를 가리키지 않게", () => {
    useWorkspaceStore.setState({ navBack: ["wiki:old:paging.md", "home"], navForward: ["graph:old"] });
    useWorkspaceStore.getState().remapSpace("old", "new");
    const s = useWorkspaceStore.getState();
    expect(s.navBack).toEqual(["wiki:new:paging.md", "home"]);
    expect(s.navForward).toEqual(["graph:new"]);
  });
});
