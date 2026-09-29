import { useEffect, useState } from "react";

import { applyTheme, getTheme, type Theme } from "@/lib/theme";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const sync = () => setThemeState(getTheme());
    sync();
    window.addEventListener("clinic-theme-change", sync);
    return () => window.removeEventListener("clinic-theme-change", sync);
  }, []);

  function toggle() {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
  }

  return { theme, toggle };
}
