import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface Ctx {
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemeChoice) => void;
}

const ThemeContext = createContext<Ctx>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === "system" ? getSystemTheme() : choice;
}

const THEME_COLOR = { light: "#f8f6f2", dark: "#242420" };

function applyThemeColor(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
  const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
  if (meta) meta.content = THEME_COLOR[resolved];
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(
    () => (localStorage.getItem("theme") as ThemeChoice | null) ?? "system"
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolve((localStorage.getItem("theme") as ThemeChoice | null) ?? "system")
  );

  useEffect(() => {
    applyThemeColor(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolvedTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: ThemeChoice) => {
    localStorage.setItem("theme", t);
    setThemeState(t);
    const r = resolve(t);
    setResolvedTheme(r);
    applyThemeColor(r);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
