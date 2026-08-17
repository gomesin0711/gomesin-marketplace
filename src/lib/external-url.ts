/**
 * Open an external URL (e.g. https://wa.me/...) reliably, even from inside a
 * sandboxed iframe (e.g. the Preview Panel).
 *
 * === THE PROBLEM ===
 * When the app runs inside a sandboxed iframe WITHOUT `allow-popups`:
 *   1. `window.open(url, "_blank")` returns null (popup blocked)
 *   2. Navigating the iframe to wa.me → "X-Frame-Options: DENY" → "refused to connect"
 *
 * Additionally, `window.open()` called AFTER an `await` (e.g. after uploading
 * a proof image) is blocked because the browser's "user gesture" context has
 * expired by the time the async code runs.
 *
 * === THE FIX ===
 * Use a programmatic `<a target="_blank">` click as the PRIMARY strategy.
 * Browsers treat anchor-element clicks as user-initiated navigation (not
 * script popups), so they bypass popup blockers in most cases — even when
 * triggered from async code or inside a sandboxed iframe.
 *
 * Strategy order:
 *   1. Anchor-click in window.top (escapes iframe → new tab on parent)
 *   2. Anchor-click in current window (works if iframe allows navigation)
 *   3. window.top.open (escapes iframe via popup)
 *   4. window.open (same-context popup)
 *
 * We intentionally DO NOT fall back to `window.location.href = url` because
 * navigating the iframe to wa.me → "refused to connect" (X-Frame-Options).
 *
 * @returns true if a popup/tab was successfully opened, false otherwise
 */
export function openExternalUrl(url: string): boolean {
  // Strategy 1: Anchor-click in window.top (escapes sandboxed iframe)
  // This is the most reliable: creates a real <a target="_blank"> element
  // in the top window's document and clicks it. Browsers treat this as
  // user-initiated navigation, bypassing popup blockers.
  try {
    const top = (window as any).top;
    if (top) {
      const topDoc = top.document;
      const a = topDoc.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      // tempVisually-hidden so it doesn't affect layout
      a.style.position = "fixed";
      a.style.left = "-9999px";
      a.style.top = "0";
      a.style.width = "1px";
      a.style.height = "1px";
      a.style.opacity = "0";
      topDoc.body.appendChild(a);
      a.click();
      // Clean up after a delay (immediate removal can abort navigation in some browsers)
      setTimeout(() => {
        try { topDoc.body.removeChild(a); } catch {}
      }, 1000);
      return true;
    }
  } catch {
    // Cross-origin window.top access throws SecurityError — fall through
  }

  // Strategy 2: Anchor-click in current window (iframe context)
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    a.style.top = "0";
    a.style.width = "1px";
    a.style.height = "1px";
    a.style.opacity = "0";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch {}
    }, 1000);
    return true;
  } catch {
    // fall through
  }

  // Strategy 3: window.top.open (escapes iframe, popup-based)
  try {
    const top = (window as any).top;
    if (top && top !== window.self) {
      const w = top.open(url, "_blank", "noopener,noreferrer");
      if (w) return true;
    }
  } catch {
    // fall through
  }

  // Strategy 4: window.open (same-context popup)
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) return true;
  } catch {
    // fall through
  }

  // DO NOT navigate the page away (causes "wa.me refused to connect").
  return false;
}

/**
 * Open a URL via anchor-click, intended for use inside a user gesture (e.g.
 * a toast action button onClick). More reliable than window.open() because
 * anchor clicks are treated as user-initiated navigation.
 *
 * @returns true if opened, false if blocked (caller can copy to clipboard).
 */
export function openUrlViaAnchor(url: string): boolean {
  // Try in window.top first (escapes iframe), then current window.
  for (const win of [(window as any).top, window.self]) {
    if (!win) continue;
    try {
      const doc = win.document;
      const a = doc.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.position = "fixed";
      a.style.left = "-9999px";
      a.style.top = "0";
      a.style.width = "1px";
      a.style.height = "1px";
      a.style.opacity = "0";
      doc.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { doc.body.removeChild(a); } catch {}
      }, 1000);
      return true;
    } catch {
      // cross-origin or other error — try next
    }
  }
  return false;
}
