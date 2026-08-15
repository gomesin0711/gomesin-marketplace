/**
 * Server-side broadcast helper.
 *
 * Calls the chat-service's HTTP `/internal/broadcast` endpoint to fan out
 * a socket.io event to ALL connected clients. Used by Next.js API routes
 * (which run in a separate process from the chat-service) to trigger
 * realtime UI updates without relying on a client-side socket emit.
 *
 * Endpoint: POST http://localhost:3003/internal/broadcast
 * Body: { event: string, payload?: any }
 *
 * Failures are swallowed (logged) — broadcasts are best-effort. The
 * frontend's polling fallback still catches changes within a few seconds
 * even if this call fails.
 */

const CHAT_SERVICE_URL = "http://localhost:3004/internal/broadcast";

export async function broadcastToAll(
  event: string,
  payload?: any
): Promise<{ ok: boolean; delivered?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(CHAT_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[broadcast] ${event} failed: HTTP ${res.status} ${text.slice(0, 200)}`
      );
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => ({ ok: true }));
    return { ok: true, delivered: data.delivered };
  } catch (e: any) {
    console.warn(
      `[broadcast] ${event} error: ${e?.name === "AbortError" ? "timeout" : e?.message || "unknown"}`
    );
    return { ok: false, error: e?.message || "unknown" };
  }
}

/**
 * Broadcast a freshly published listing (status changed to "active") to all
 * clients. Triggers the homepage's "Iklan Baru" section to invalidate +
 * refetch immediately, AND the notification bell to invalidate + play sound.
 */
export async function broadcastListingNew(listing: any): Promise<void> {
  await broadcastToAll("listing:new", { listing });
}

/**
 * Broadcast a freshly submitted pending listing (user just posted + paid) to
 * all clients. Triggers the admin's "Iklan Baru" tab to invalidate +
 * refetch immediately so the admin can review it without waiting for the
 * 3-second poll.
 */
export async function broadcastListingPending(listing: any): Promise<void> {
  await broadcastToAll("listing:pending", { listing });
}
