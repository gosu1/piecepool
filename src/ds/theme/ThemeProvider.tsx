import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

// 라이트/다크 테마를 <html data-theme> 로 적용하고 localStorage 에 저장한다.
// 시맨틱 토큰(--ds-*)이 data-theme 에 따라 자동으로 색을 바꾸므로, 컴포넌트는
// dark: 변형 없이도 bg-surface / text-fg 만 쓰면 두 테마 모두에서 올바르게 보인다.

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "piecepool-theme";

function readInitialTheme(defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return defaultTheme;
}

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = "light" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme(defaultTheme));

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState((t) => (t === "light" ? "dark" : "light"));

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
