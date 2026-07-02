import { IconButton } from "../primitives/IconButton";
import { SunIcon, MoonIcon } from "../icons";
import { useTheme } from "./ThemeProvider";

// 라이트 ↔ 다크 토글 버튼. TopBar 액션 영역에 둔다.
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      className={className}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={toggle}
    >
      {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </IconButton>
  );
}
