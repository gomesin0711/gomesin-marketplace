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
 * Try ONLY popup-based strategies (never navigate the page away):
 *   1. `window.top.open(url, "_blank", "noopener,noreferrer")`
 *      — escapes the iframe; top window has full popup permissions
 *   2. `window.open(url, "_blank", "noopener,noreferrer")`
 *      — same-context popup (works if iframe has allow-popups)
 *
 * If BOTH fail (popup blocked), return false. The caller is responsible for
 * showing a fallback clickable link (e.g. via a toast with an action button).
 *
 * We intentionally DO NOT fall back to `window.location.href = url` or
 * `top.location.href = url` because:
 *   - Navigating the iframe to wa.me → "refused to connect" (X-Frame-Options)
 *   - Navigating the top window → destroys the app session entirely
 * Both are worse UX than simply showing a "click here to open WhatsApp" link.
 *
 * @returns true if a popup was successfully opened, false otherwise
 */
export function openExternalUrl(url: string): boolean {
  // Strategy 1: window.top.open (escapes sandboxed iframe, opens new tab on parent)
  try {
    const top = (window as any).top;
    if (top && top !== window.self) {
      const w = top.open(url, "_blank", "noopener,noreferrer");
      if (w) return true;
    }
  } catch {
    // Cross-origin window.top access throws SecurityError — fall through
  }

  // Strategy 2: window.open (same context popup)
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) return true;
  } catch {
    // fall through
  }

  // DO NOT navigate the page away. See header comment for why.
  // Return false and let the caller show a clickable fallback link.
  return false;
}
