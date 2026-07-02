import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PiecePoolApp from "./app/PiecePoolApp";
import DesignSystemScreen from "./screens/DesignSystemScreen";
import HomeDemoScreen from "./screens/HomeDemoScreen";
import WorkspaceScreen from "./screens/WorkspaceScreen";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 실제 앱(첫 화면) */}
        <Route path="/" element={<PiecePoolApp />} />
        {/* 디자인 시스템 참고용 */}
        <Route path="/ds" element={<DesignSystemScreen />} />
        <Route path="/home-demo" element={<HomeDemoScreen />} />
        {/* IPC 왕복 디버그 */}
        <Route path="/debug" element={<WorkspaceScreen />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
