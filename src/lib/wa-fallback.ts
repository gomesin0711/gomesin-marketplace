/**
 * Show a user-friendly toast when a WhatsApp popup is blocked by the browser
 * (common in sandboxed iframes like the Preview Panel).
 *
 * Instead of navigating the iframe to wa.me (which would show
 * "wa.me refused to connect" due to X-Frame-Options: DENY), we show a toast
 * with a clickable action button that opens the wa.me URL in a new tab.
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

export function showWhatsAppFallbackToast(result: ShareImageResult): boolean {
  if (result.status === "blocked") {
    toast("Popup WhatsApp diblokir browser.", {
      description: "Klik tombol di bawah untuk membuka WhatsApp secara manual.",
      action: {
        label: "Buka WhatsApp",
        onClick: () => {
          // window.open in a direct user-gesture (click on the toast action)
          // is much more likely to succeed than an async popup attempt.
          const w = window.open(result.url, "_blank", "noopener,noreferrer");
          if (!w) {
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
  return false;
}
