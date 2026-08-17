/**
 * Show a user-friendly toast when a WhatsApp popup is blocked by the browser
 * (common in sandboxed iframes like the Preview Panel).
 *
 * Instead of navigating the iframe to wa.me (which would show
 * "wa.me refused to connect" due to X-Frame-Options: DENY), we show a toast
 * with a clickable action button that opens the wa.me URL via an anchor-click
 * (more reliable than window.open() inside a toast action).
 *
 * Usage:
 *   const result = await openWhatsAppWithUrl({ ... });
 *   if (!showWhatsAppFallbackToast(result)) {
 *     // result was "opened" or an unrelated error — handle normally
 *   }
 *
 * @returns true if a fallback toast was shown (caller should stop), false otherwise.
 */
import { toast } from "sonner";
import type { ShareImageResult } from "@/lib/share-image";
import { openUrlViaAnchor } from "@/lib/external-url";

export function showWhatsAppFallbackToast(result: ShareImageResult): boolean {
  if (result.status === "blocked") {
    toast("Popup WhatsApp diblokir browser.", {
      description: "Klik tombol di bawah untuk membuka WhatsApp.",
      action: {
        label: "Buka WhatsApp",
        onClick: () => {
          // Anchor-click is more reliable than window.open() here because
          // the toast action click IS a fresh user gesture, and browsers
          // treat <a target="_blank"> clicks as user-initiated navigation
          // (bypasses popup blockers that would block window.open()).
          const ok = openUrlViaAnchor(result.url);
          if (!ok) {
            // Last resort: copy to clipboard so the user can paste it manually.
            try {
              navigator.clipboard?.writeText(result.url);
              toast.success("Link WhatsApp disalin ke clipboard. Tempel di tab baru.");
            } catch {
              toast.error("Tidak bisa membuka WhatsApp. Salin link manual: " + result.url);
            }
          }
        },
      },
      duration: 15000, // keep toast visible long enough for user to click
    });
    return true;
  }
  if (result.status === "error" && result.url) {
    // Some "error" results may still carry a URL (older callers).
    toast("Gagal membuka WhatsApp.", {
      description: "Klik tombol di bawah untuk mencoba lagi.",
      action: {
        label: "Buka WhatsApp",
        onClick: () => {
          const ok = openUrlViaAnchor(result.url);
          if (!ok) {
            try {
              navigator.clipboard?.writeText(result.url);
              toast.success("Link WhatsApp disalin ke clipboard.");
            } catch {
              toast.error("Tidak bisa membuka WhatsApp.");
            }
          }
        },
      },
      duration: 15000,
    });
    return true;
  }
  return false;
}
