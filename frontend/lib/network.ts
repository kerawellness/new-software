/** True when the browser says there is no network. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isConnectionFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "You are offline." || error.message === "The connection timed out.")
  );
}

/** Reject immediately when the browser is offline, instead of waiting on a hung request. */
export function failIfOffline(): void {
  if (isBrowserOffline()) throw new Error("You are offline.");
}

/** True when the browser reports a metered or very slow link. */
export function isSlowConnection(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
    }
  ).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g") return true;
  return typeof connection.downlink === "number" && connection.downlink > 0 && connection.downlink < 1.5;
}

/** Stop waiting if a request never answers. Slow links get longer. */
export function withNetworkTimeout<T>(promise: Promise<T>, ms = isSlowConnection() ? 30_000 : 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The connection timed out.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
