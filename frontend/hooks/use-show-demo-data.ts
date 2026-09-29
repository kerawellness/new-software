import { useCallback, useEffect, useState } from "react";

import { isShowDemoDataStored, SHOW_DEMO_DATA_KEY } from "@/lib/demo-data";

function readShowDemoData(): boolean {
  return isShowDemoDataStored();
}

/** Frontend-only toggle. Dummy rows never write to Supabase. */
export function useShowDemoData() {
  const [showDemoData, setShowDemoDataState] = useState(() => readShowDemoData());

  useEffect(() => {
    setShowDemoDataState(readShowDemoData());
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHOW_DEMO_DATA_KEY) setShowDemoDataState(readShowDemoData());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setShowDemoData = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(SHOW_DEMO_DATA_KEY, next ? "1" : "0");
    } catch {
      // ignore quota / private mode
    }
    setShowDemoDataState(next);
    window.dispatchEvent(new Event("clinic-compass-demo-data"));
  }, []);

  useEffect(() => {
    const onLocal = () => setShowDemoDataState(readShowDemoData());
    window.addEventListener("clinic-compass-demo-data", onLocal);
    return () => window.removeEventListener("clinic-compass-demo-data", onLocal);
  }, []);

  return { showDemoData, setShowDemoData };
}
