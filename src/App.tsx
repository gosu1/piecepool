import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
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

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen text-neutral-900">
        <nav className="w-44 shrink-0 space-y-1 border-r border-neutral-200 p-3">
          <div className="px-2 pb-2 font-bold">PiecePool</div>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `block rounded px-2 py-1 text-sm ${
                  isActive ? "bg-neutral-200" : "hover:bg-neutral-100"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 overflow-auto">
          <Routes>
            {/* 첫 진입 = Inbox (scope-mvp §2.3) */}
            <Route path="/" element={<Navigate to="/inbox" replace />} />
            <Route path="/inbox" element={<InboxScreen />} />
            <Route path="/wiki" element={<WikiViewScreen />} />
            <Route path="/graph" element={<GraphViewScreen />} />
            <Route path="/editor" element={<MarkdownEditorScreen />} />
            <Route path="/workspace" element={<WorkspaceScreen />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
