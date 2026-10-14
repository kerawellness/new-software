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
  it("shows the last loaded catalogue in a fresh session", () => {
    const saved = new QueryClient();
    startPersistingQueryCache(saved);
    saved.setQueryData(["treatment-catalogue", "all", "c1"], [{ id: "t1", name: "Filling" }]);
    vi.advanceTimersByTime(4_500);

    const reopened = new QueryClient();
    restoreQueryCache(reopened);
    expect(reopened.getQueryData(["treatment-catalogue", "all", "c1"])).toEqual([
      { id: "t1", name: "Filling" },
    ]);
  });

  it("drops data older than a day and data cleared at sign-out", () => {
    const stale = { savedAt: Date.now() - 25 * 60 * 60_000, state: { queries: [], mutations: [] } };
    (globalThis as unknown as { window: ReturnType<typeof fakeWindow> }).window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(stale),
    );
    const client = new QueryClient();
    restoreQueryCache(client);
    expect(client.getQueryData(["treatment-catalogue"])).toBeUndefined();

    const saved = new QueryClient();
    startPersistingQueryCache(saved);
    saved.setQueryData(["patients"], [{ id: "p1" }]);
    vi.advanceTimersByTime(4_500);
    clearPersistedQueryCache();

    const reopened = new QueryClient();
    restoreQueryCache(reopened);
    expect(reopened.getQueryData(["patients"])).toBeUndefined();
  });

  it("does not persist Map/Set or short-lived education signed URLs", () => {
    const saved = new QueryClient();
    startPersistingQueryCache(saved);
    saved.setQueryData(["online-converted-appointment-ids", "c1"], new Set(["a1"]));
    saved.setQueryData(["education-signed-urls", "c1"], { id: "https://example.invalid" });
    saved.setQueryData(["patients", ""], [{ full_name: "Asha", phone: "9999999999" }]);
    saved.setQueryData(
      ["all-patients-billing", "c1"],
      [{ full_name: "Asha", phone: "9999999999" }],
    );
    saved.setQueryData(["invoice", "inv-1"], { invoice_number: "INV-1", grand_total: 500 });
    saved.setQueryData(["profile"], { clinic_id: "c1", clinic: { address: "GSTIN: 29ABCDE1234F1Z5" } });
    saved.setQueryData(["treatment-catalogue", "quick", "c1"], [{ id: "t1" }]);
    vi.advanceTimersByTime(4_500);

    const reopened = new QueryClient();
    restoreQueryCache(reopened);
    expect(reopened.getQueryData(["online-converted-appointment-ids", "c1"])).toBeUndefined();
    expect(reopened.getQueryData(["education-signed-urls", "c1"])).toBeUndefined();
    expect(reopened.getQueryData(["patients", ""])).toBeUndefined();
    expect(reopened.getQueryData(["all-patients-billing", "c1"])).toBeUndefined();
    expect(reopened.getQueryData(["invoice", "inv-1"])).toBeUndefined();
    expect(reopened.getQueryData(["profile"])).toBeUndefined();
    expect(reopened.getQueryData(["treatment-catalogue", "quick", "c1"])).toEqual([{ id: "t1" }]);
  });

  it("drops the old cache that stored patient lists", () => {
    (globalThis as unknown as { window: ReturnType<typeof fakeWindow> }).window.localStorage.setItem(
      "clinic-compass-query-cache-v1",
      JSON.stringify({ savedAt: Date.now(), state: { queries: [], mutations: [] } }),
    );
    const client = new QueryClient();
    restoreQueryCache(client);
    expect(
      (globalThis as unknown as { window: ReturnType<typeof fakeWindow> }).window.localStorage.getItem(
        "clinic-compass-query-cache-v1",
      ),
    ).toBeNull();
  });
});
