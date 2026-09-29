import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPersistedQueryCache,
  restoreQueryCache,
  startPersistingQueryCache,
} from "./query-persist";

const STORAGE_KEY = "clinic-compass-query-cache-v1";

function fakeWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { window?: unknown }).window = fakeWindow();
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: unknown }).window;
});

describe("query cache persistence", () => {
  it("shows the last loaded data in a fresh session", () => {
    const saved = new QueryClient();
    startPersistingQueryCache(saved);
    saved.setQueryData(["profile"], { clinic_id: "c1", name: "testm" });
    vi.advanceTimersByTime(4_500);

    const reopened = new QueryClient();
    restoreQueryCache(reopened);
    expect(reopened.getQueryData(["profile"])).toEqual({ clinic_id: "c1", name: "testm" });
  });

  it("drops data older than a day and data cleared at sign-out", () => {
    const stale = { savedAt: Date.now() - 25 * 60 * 60_000, state: { queries: [], mutations: [] } };
    (globalThis as unknown as { window: ReturnType<typeof fakeWindow> }).window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(stale),
    );
    const client = new QueryClient();
    restoreQueryCache(client);
    expect(client.getQueryData(["profile"])).toBeUndefined();

    const saved = new QueryClient();
    startPersistingQueryCache(saved);
    saved.setQueryData(["patients"], [{ id: "p1" }]);
    vi.advanceTimersByTime(4_500);
    clearPersistedQueryCache();

    const reopened = new QueryClient();
    restoreQueryCache(reopened);
    expect(reopened.getQueryData(["patients"])).toBeUndefined();
  });
});
