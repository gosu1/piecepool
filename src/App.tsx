import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import PiecePoolApp from "./app/PiecePoolApp";
import DesignSystemScreen from "./screens/DesignSystemScreen";
import HomeDemoScreen from "./screens/HomeDemoScreen";
import WorkspaceScreen from "./screens/WorkspaceScreen";
import InboxScreen from "./screens/InboxScreen";
import MarkdownEditorScreen from "./screens/MarkdownEditorScreen";
import WikiViewScreen from "./screens/WikiViewScreen";
import GraphViewScreen from "./screens/GraphViewScreen";

const NAV = [
  { to: "/inbox", label: "Inbox" },
  { to: "/wiki", label: "Wiki" },
  { to: "/graph", label: "Graph" },
  { to: "/editor", label: "Editor" },
  { to: "/workspace", label: "Workspace" },
];

// 기존 IPC 검증용 stub 화면들을 감싸는 개발 레이아웃.
function DevLayout() {
  return (
    <div className="flex h-screen bg-canvas text-ink">
      <nav className="w-44 shrink-0 space-y-1 border-r border-hairline p-3">
        <NavLink to="/" className="block px-2 pb-2 text-sm font-bold">
          PiecePool · Dev
        </NavLink>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `block rounded-md px-2 py-1 text-sm ${
                isActive ? "bg-surface-soft text-ink" : "text-ink-muted hover:bg-surface-soft"
              }`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 실제 앱(첫 화면) */}
        <Route path="/" element={<PiecePoolApp />} />
        {/* 디자인 시스템 참고용 */}
        <Route path="/ds" element={<DesignSystemScreen />} />
        <Route path="/home-demo" element={<HomeDemoScreen />} />

        {/* 개발용 IPC 검증 화면 */}
        <Route element={<DevLayout />}>
          <Route path="/inbox" element={<InboxScreen />} />
          <Route path="/wiki" element={<WikiViewScreen />} />
          <Route path="/graph" element={<GraphViewScreen />} />
          <Route path="/editor" element={<MarkdownEditorScreen />} />
          <Route path="/workspace" element={<WorkspaceScreen />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
