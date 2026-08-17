/**
 * Per-tab session token management.
 *
 * === WHY ===
 * httpOnly cookies are SHARED across all browser tabs for the same origin.
 * This means if Tab 1 logs in as User A, every other tab opened in the same
 * browser is ALSO User A — there's no way to have Tab 2 be User B.
 *
 * To enable multi-account-per-tab, we store the session token in
 * `sessionStorage` (which is per-tab, NOT shared across tabs) and send it
 * as an `Authorization: Bearer <token>` header on every API request.
 *
 * The server's getSessionUser() checks the Authorization header FIRST (per-tab
 * token), then falls back to the httpOnly cookie (shared). So a tab with a
 * per-tab token overrides the shared cookie.
 *
 * === FLOW ===
 * - On login/register success: API returns { user, sessionToken }.
 *   Client calls setSessionToken(token) to store it in sessionStorage.
 * - On every fetch: apiFetch() wrapper adds Authorization header automatically.
 * - On logout: clearSessionToken() removes it from sessionStorage.
 * - On app mount: app-shell reads the per-tab token (if any) and uses it
 *   for /api/auth/me (so a logged-in tab stays logged in as ITS user,
 *   not the shared-cookie user).
 */

const SESSION_KEY = "mesinku_session_token";

/** Get the per-tab session token (or null if this tab has no per-tab session). */
export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Store the per-tab session token after a successful login/register. */
export function setSessionToken(token: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, token);
  } catch {
    // sessionStorage might be unavailable (private mode, etc.) — fall back to
    // cookie-only auth for this tab.
  }
}

/** Clear the per-tab session token on logout. */
export function clearSessionToken(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

/**
 * fetch() wrapper that automatically attaches the per-tab Authorization header
 * if a per-tab session token exists. Use this for ALL authenticated API calls
 * so multi-account-per-tab works transparently.
 *
 * Falls back to the shared httpOnly cookie when no per-tab token is set
 * (e.g. the first tab that logged in via cookie only).
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

// === GLOBAL FETCH PATCH (multi-account per-tab) =============================
// Patch the global fetch() so EVERY fetch in the app automatically attaches
// the per-tab Authorization header. This avoids having to rewrite hundreds of
// `fetch("/api/...")` call sites to use apiFetch().
//
// The patch:
//   - Only applies to same-origin relative URLs ("/api/...") — never touches
//     cross-origin requests (preserves CORS behavior).
//   - Only adds the header if a per-tab token exists in sessionStorage.
//   - Does NOT overwrite an explicit Authorization header set by the caller.
//
// This runs once on module import (client-side only, guarded by typeof window).
if (typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  // Guard against double-patching in HMR.
  if (!(window as any).__mesinkuFetchPatched) {
    (window as any).__mesinkuFetchPatched = true;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      // Resolve the URL to check origin.
      let urlStr = "";
      try {
        if (typeof input === "string") urlStr = input;
        else if (input instanceof URL) urlStr = input.toString();
        else if (input && typeof (input as Request).url === "string") urlStr = (input as Request).url;
      } catch {
        // ignore — fall through to originalFetch
      }
      // Only patch same-origin relative URLs (start with "/" and not "//").
      const isRelative = urlStr.startsWith("/") && !urlStr.startsWith("//");
      if (isRelative) {
        const token = getSessionToken();
        if (token) {
          const headers = new Headers(init?.headers || (input as Request)?.headers || {});
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
          }
          return originalFetch(input, { ...init, headers });
        }
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
  }
}
