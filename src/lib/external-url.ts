/**
 * Open an external URL (e.g. https://wa.me/...) reliably, even from inside a
 * sandboxed iframe (e.g. the Preview Panel).
 *
 * === THE PROBLEM ===
 * When the app runs inside a sandboxed iframe WITHOUT `allow-popups`:
 *   1. `window.open(url, "_blank")` returns null (popup blocked)
 *   2. `<a target="_blank">` falls back to navigating the IFRAME itself
 *   3. The iframe navigates to wa.me → wa.me sends `X-Frame-Options: DENY`
 *      → browser shows "wa.me refused to connect"
 *
 * === THE FIX ===
 * Try strategies in order until one succeeds:
 *   1. `window.top.open(url, "_blank", "noopener,noreferrer")`
 *      — escapes the iframe; top window has full popup permissions
 *   2. `window.open(url, "_blank", "noopener,noreferrer")`
 *      — same-context popup (works if iframe has allow-popups)
 *   3. `window.top.location.href = url`
 *      — navigates the TOP window (escapes iframe entirely, no X-Frame-Options issue)
 *   4. `window.location.href = url`
 *      — final fallback (may navigate iframe → refused; last resort only)
 *
 * @returns true if any strategy successfully opened the URL
 */
export function openExternalUrl(url: string): boolean {
  // Strategy 1: window.top.open (escapes sandboxed iframe)
  try {
    const top = (window as any).top;
    if (top && top !== window.self) {
      const w = top.open(url, "_blank", "noopener,noreferrer");
      if (w) return true;
    }
  } catch {
    // Cross-origin window.top access throws SecurityError — fall through
  }

  // Strategy 2: window.open (same context)
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) return true;
  } catch {
    // fall through
  }

  // Strategy 3: navigate TOP window (escapes iframe, no X-Frame-Options issue)
  try {
    const top = (window as any).top;
    if (top) {
      top.location.href = url;
      return true;
    }
  } catch {
    // Cross-origin — fall through
  }

  // Strategy 4: navigate current location (last resort — may be blocked by
  // X-Frame-Options if the URL refuses to be embedded in an iframe)
  try {
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}
