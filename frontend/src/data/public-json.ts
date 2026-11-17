/**
 * Reading public JSON from the browser, with no sign-in.
 *
 * Used by the update pages to read build progress and the change list from
 * public web pages. Nothing about this home is sent: only the address of the
 * public file is requested. Every failure is turned into a result value; the
 * functions here never throw.
 */

/** The one place that names the public updates log of the project. */
export const PUBLIC_UPDATES_ORIGIN =
  "https://ding-ding-projects.github.io/home-assistant-material-updates";

export type PublicFetchFailure =
  | { ok: false; reason: "rate_limited"; resetAt?: Date }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "offline" }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "http"; status: number }
  | { ok: false; reason: "aborted" };

export type PublicFetchResult<T> = { ok: true; data: T } | PublicFetchFailure;

/**
 * Works out when a rate limited request can be tried again, from the
 * `x-ratelimit-reset` header (seconds since 1970) or `retry-after` (seconds
 * from now). Returns undefined when neither is usable.
 */
export const rateLimitResetFromHeaders = (
  getHeader: (name: string) => string | null,
  now: number = Date.now()
): Date | undefined => {
  const reset = Number(getHeader("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    return new Date(reset * 1000);
  }
  const retry = Number(getHeader("retry-after"));
  if (Number.isFinite(retry) && retry > 0) {
    return new Date(now + retry * 1000);
  }
  return undefined;
};

/** How long one public read may take. */
export const PUBLIC_FETCH_TIMEOUT_MS = 10000;

/** Reads one public JSON file. Never throws. */
export const fetchPublicJson = async (
  url: string,
  signal?: AbortSignal
): Promise<PublicFetchResult<unknown>> => {
  let response: Response;
  // A read that does not answer in time counts as offline, so a block that
  // waits for it shows its own state instead of loading for ever.
  const limit = new AbortController();
  const timer = setTimeout(() => limit.abort(), PUBLIC_FETCH_TIMEOUT_MS);
  const onAbort = () => limit.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    response = await fetch(url, { signal: limit.signal, credentials: "omit" });
  } catch (_err) {
    if (signal?.aborted) {
      return { ok: false, reason: "aborted" };
    }
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (response.status === 404) {
    return { ok: false, reason: "not_found" };
  }
  if (response.status === 403 || response.status === 429) {
    return {
      ok: false,
      reason: "rate_limited",
      resetAt: rateLimitResetFromHeaders((name) => response.headers.get(name)),
    };
  }
  if (!response.ok) {
    return { ok: false, reason: "http", status: response.status };
  }
  try {
    return { ok: true, data: await response.json() };
  } catch (_err) {
    if (signal?.aborted) {
      return { ok: false, reason: "aborted" };
    }
    return { ok: false, reason: "invalid" };
  }
};
