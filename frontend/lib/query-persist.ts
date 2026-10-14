import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "clinic-compass-query-cache-v2";
const RETIRED_STORAGE_KEYS = ["clinic-compass-query-cache-v1"];

/** Patient names, phones, visits, and money stay in memory only. */
const PRIVATE_QUERY_ROOTS = [
  "all-patients",
  "analytics",
  "appointments",
  "arrive-phone",
  "audit-logs",
  "billing",
  "clinic-settings",
  "dashboard",
  "dashboard-metrics",
  "dashboard-outstanding",
  "duplicate-check-phone",
  "duplicate-family-phones",
  "flow",
  "flow-balances",
  "followups",
  "followups-counts",
  "installment-plan-lookup",
  "invoice",
  "invoice-bill-preview",
  "invoices",
  "online-appointment-requests",
  "online-converted-appointment-ids",
  "outstanding-invoices",
  "active-installment-plans",
  "patient",
  "patient-recurring-treatments",
  "patient-treatments",
  "patients",
  "patients-search",
  "patients-search-modal",
  "payments-history",
  "profile",
  "quick-entry-duplicate-phone",
  "quick-entry-family-phones",
  "visits",
] as const;

function isPrivateQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === "string" && (PRIVATE_QUERY_ROOTS as readonly string[]).includes(root);
}
/** Saved clinic data older than this is dropped instead of shown. */
const MAX_AGE_MS = 24 * 60 * 60_000;
/** localStorage is ~5 MB; stop before we fill it. */
const MAX_BYTES = 3_000_000;
const WRITE_DELAY_MS = 4_000;

/** Shows the last loaded data straight away, then queries refresh it in the background. */
export function restoreQueryCache(client: QueryClient) {
  if (typeof window === "undefined") return;
  try {
    for (const retired of RETIRED_STORAGE_KEYS) {
      window.localStorage.removeItem(retired);
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { savedAt?: number; state?: unknown };
    if (!saved.savedAt || Date.now() - saved.savedAt > MAX_AGE_MS || !saved.state) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    hydrate(client, saved.state);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function startPersistingQueryCache(client: QueryClient) {
  if (typeof window === "undefined") return;
  let timer: number | undefined;

  client.getQueryCache().subscribe(() => {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      const write = () => {
        try {
          const state = dehydrate(client, {
            shouldDehydrateQuery: (query) => {
              if (query.state.status !== "success") return false;
              if (isPrivateQuery(query.queryKey)) return false;
              // Short-lived signed URLs must not outlive Storage expiry.
              if (query.queryKey[0] === "education-signed-urls") return false;
              // JSON.stringify turns Map/Set into `{}`, which later crashes `.get`/`.has`.
              const data = query.state.data;
              if (data instanceof Map || data instanceof Set) return false;
              return true;
            },
          });
          const raw = JSON.stringify({ savedAt: Date.now(), state });
          if (raw.length > MAX_BYTES) {
            window.localStorage.removeItem(STORAGE_KEY);
            return;
          }
          window.localStorage.setItem(STORAGE_KEY, raw);
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(write, { timeout: 2000 });
      } else {
        write();
      }
    }, WRITE_DELAY_MS);
  });
}

/** Sign-out must not leave patient data on the device. */
export function clearPersistedQueryCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to do — the cache is already unreadable.
  }
}
