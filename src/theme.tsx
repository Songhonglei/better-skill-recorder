import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { useLanguage } from "./i18n";

export type UiTheme = "dark" | "light";

const STORAGE_KEY = "better-skill-recorder.theme";
const THEME_EVENT = "better-skill-recorder-theme-change";

function preferredTheme(): UiTheme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

export function getUiTheme(): UiTheme {
  return preferredTheme();
}

type ThemeContextValue = {
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>(preferredTheme);

  const setTheme = useCallback((next: UiTheme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent | Event) => {
      if (event instanceof StorageEvent && event.key !== STORAGE_KEY) return;
      const detail = event instanceof CustomEvent ? event.detail : null;
      setThemeState(detail === "dark" || detail === "light" ? detail : preferredTheme());
    };
    window.addEventListener("storage", sync);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

export function ThemeSwitcher() {
  const { language } = useLanguage();
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = language === "zh-CN"
    ? `当前为${theme === "dark" ? "暗色" : "亮色"}模式，点击切换为${next === "dark" ? "暗色" : "亮色"}模式`
    : `${theme === "dark" ? "Dark" : "Light"} mode. Switch to ${next} mode`;
  const switchTheme = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="interface-control theme-switcher"
      data-theme-state={theme}
      data-no-localize
      aria-label={label}
      onClick={switchTheme}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 20 20" aria-hidden>
          <path d="M15.8 12.9A6.2 6.2 0 0 1 7.1 4.2a6.25 6.25 0 1 0 8.7 8.7Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="10" r="3.1" />
          <path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5 6 6M14 14l1.5 1.5M15.5 4.5 14 6M6 14l-1.5 1.5" />
        </svg>
      )}
    </button>
  );
}
