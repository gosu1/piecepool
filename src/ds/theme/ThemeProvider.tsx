import { createContext, useContext, useLayoutEffect, useState } from "react";
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
// 과거 버전이 마운트마다 STORAGE_KEY 를 자동 기록해 모든 프로필에 값이 남아 있다.
// 사용자가 직접 고른 값만 존중하기 위해 명시 선택 플래그가 있을 때만 저장값을 읽는다.
const EXPLICIT_KEY = "piecepool-theme-explicit";

function readInitialTheme(defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;
  if (window.localStorage.getItem(EXPLICIT_KEY) !== "1") return defaultTheme;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return defaultTheme;
}

function persistExplicit(t: Theme) {
  window.localStorage.setItem(STORAGE_KEY, t);
  window.localStorage.setItem(EXPLICIT_KEY, "1");
}

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = "light" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme(defaultTheme));

  // layout effect: 자식들의 passive effect(예: CytoscapeGraph 의 getComputedStyle 토큰 읽기)보다
  // 먼저 data-theme 이 DOM 에 반영되어야 테마 전환이 한 박자 늦지 않는다.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 저장은 사용자 액션에서만 — 마운트 자동 기록은 "기본 테마 변경"을 무력화한다.
  const setTheme = (t: Theme) => {
    persistExplicit(t);
    setThemeState(t);
  };
  const toggle = () =>
    setThemeState((t) => {
      const next = t === "light" ? "dark" : "light";
      persistExplicit(next);
      return next;
    });

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
