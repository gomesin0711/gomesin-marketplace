/**
 * Share image to WhatsApp — LANGSUNG ke chat admin 085888082208.
 *
 * === CARA KERJA ===
 * Upload gambar bukti ke server-side /api/upload-proof route (CORS-safe).
 * Server akan:
 *   1. Upload ke tmpfiles.org dengan expire=86400 (60 hari)
 *   2. Fallback ke catbox.moe (permanent) jika tmpfiles gagal
 *   3. Extract direct image URL dari viewer page HTML
 * Setelah dapat URL, buka wa.me/6285888082208?text=caption+imageUrl
 * → WhatsApp langsung buka CHAT ADMIN dengan pesan pre-fill.
 * User tinggal tap "Kirim".
 *
 * === MOBILE vs DESKTOP ===
 * Mobile: window.location.href = wa.me URL (paling reliable, langsung
 *   buka WhatsApp app di HP).
 * Desktop: window.open dengan popup-blocker-safe pattern (buka window
 *   sync di click handler sebelum await, set location setelah upload).
 *   Fallback ke location.href kalau popup diblokir.
 *
 * Admin number: 085888082208 (6285888082208).
 *
 * === WHY SERVER-SIDE UPLOAD? ===
 * Browser-side fetch ke tmpfiles.org viewer page diblokir oleh CORS
 * (viewer page tidak mengirim Access-Control-Allow-Origin header).
 * Server-side fetch tidak terkena CORS, jadi extraction direct URL
 * bisa berjalan normal.
 */

export interface ShareImageOptions {
  blob: Blob;
  fileName: string;
  caption: string;
  phone?: string;
}

export type ShareImageResult =
  | { status: "shared" }
  | { status: "opened" }
  | { status: "cancelled" }
  | { status: "error"; error: string };

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Resolve the most reliable way to open a wa.me URL on the current device. */
function openWaUrl(waUrl: string): ShareImageResult {
  // Always prefer window.open(_blank, noopener) — opens a new tab without
  // navigating the current page, so in-flight JS (listing submit, chat send)
  // continues uninterrupted. This works on both mobile (opens WhatsApp app
  // via intent) and desktop (opens web.whatsapp.com in a new tab).
  let popupWin: Window | null = null;
  try {
    popupWin = window.open(waUrl, "_blank", "noopener,noreferrer");
  } catch {
    popupWin = null;
  }
  if (popupWin) {
    return { status: "opened" };
  }
  // Last-resort fallback: navigate current tab. This may abort in-flight JS.
  try {
    window.location.href = waUrl;
    return { status: "opened" };
  } catch {
    return { status: "error", error: "Tidak bisa membuka WhatsApp (popup diblokir browser)" };
  }
}
void isMobile;

/**
 * Convert blob → base64 data URL untuk dikirim ke /api/upload-proof.
 * Server-side route akan handle upload ke tmpfiles.org (expire 60 hari)
 * dengan fallback catbox.moe jika gagal.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca gambar"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload blob via server-side route → return direct image URL.
 * Server menghandle tmpfiles.org (60 hari) + fallback catbox.moe.
 * Server-side fetch menghindari CORS issue saat extracting direct URL.
 */
async function uploadImageServerSide(blob: Blob): Promise<string | null> {
  try {
    const dataUrl = await blobToDataUrl(blob);
    const res = await fetch("/api/upload-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

/**
 * Bangun URL wa.me dengan caption + optional image URL.
 * Phone dinormalisasi: "085888082208" → "6285888082208".
 */
function buildWhatsAppUrl(phone: string, caption: string, imageUrl: string | null): string {
  const msg = encodeURIComponent(
    caption + "\n\n" +
    (imageUrl
      ? `Bukti pembayaran (gambar):\n${imageUrl}`
      : `Bukti pembayaran terlampir — silakan kirim screenshot di chat ini.`)
  );
  const normalizedPhone = phone.replace(/[\s\-()+]/g, "").replace(/^0/, "62");
  return `https://wa.me/${normalizedPhone}?text=${msg}`;
}

export async function shareImageToWhatsApp({
  blob,
  fileName,
  caption,
  phone = "6285888082208",
}: ShareImageOptions): Promise<ShareImageResult> {
  // Upload gambar via server-side route → dapat direct image URL publik.
  // Server handles: tmpfiles.org (60 hari) + catbox.moe fallback + CORS-safe.
  const imageUrl = await uploadImageServerSide(blob);

  // Bangun URL WhatsApp ke nomor admin (6285888082208).
  const waUrl = buildWhatsAppUrl(phone, caption, imageUrl);

  return openWaUrl(waUrl);
}

/**
 * Open WhatsApp chat with a pre-uploaded image URL — NO blob upload needed.
 *
 * Use this when the image has already been uploaded to a public URL (e.g.
 * via /api/upload-proof). The URL is embedded in the caption so WhatsApp
 * shows a preview. This avoids double-uploading the same image.
 */
export async function openWhatsAppWithUrl({
  caption,
  imageUrl,
  phone = "6285888082208",
}: {
  caption: string;
  imageUrl: string | null;
  phone?: string;
}): Promise<ShareImageResult> {
  const waUrl = buildWhatsAppUrl(phone, caption, imageUrl);
  return openWaUrl(waUrl);
}
