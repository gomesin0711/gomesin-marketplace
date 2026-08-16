// Client-side image compression utility.
// Compresses an image File to a base64 data URL under maxBytes (default 150KB).

const MAX_DIMENSION = 1024; // max width/height in pixels (raised for ad photos)
const TARGET_BYTES = 150_000; // ~150KB — target for ad photos

/**
 * Route external image URLs through our server-side proxy to avoid CORS issues.
 * Only proxies external URLs (https://...). Local/relative paths and data URLs pass through unchanged.
 */
export function proxyUrl(src: string | undefined | null): string {
  if (!src) return src || "";
  if (src.startsWith("data:") || src.startsWith("/") || src.startsWith("blob:")) return src;
  try {
    const u = new URL(src, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (u.origin === (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")) return src;
    // It's an external URL — proxy it
    return "/api/img-proxy?url=" + encodeURIComponent(src);
  } catch {
    return src;
  }
}

/**
 * Normalize external image URLs for chat rendering.
 *
 * tmpfiles.org returns a "viewer" page URL (HTML) when you upload, but we need
 * the DIRECT image URL to render in an <img> tag. The direct URL has /dl/ in
 * the path. If the URL is already a /dl/ URL, catbox.moe, or a data URL, it
 * passes through unchanged.
 *
 * IMPORTANT: tmpfiles.org recently changed their /dl/ URL behavior — old /dl/
 * URLs now 302-redirect to the viewer HTML page instead of serving the image.
 * To handle this, tmpfiles.org AND catbox.moe URLs are routed through our
 * /api/img-proxy endpoint, which follows redirects, detects HTML responses,
 * extracts the new direct /dl/ URL from the viewer page, and serves the
 * actual image bytes. This makes legacy payment-proof images render again.
 */
export function normalizeImageUrl(src: string | undefined | null): string {
  if (!src) return "";
  // data URLs and relative paths — pass through
  if (src.startsWith("data:") || src.startsWith("/") || src.startsWith("blob:")) return src;
  // Route tmpfiles.org + catbox.moe through our server-side proxy so the
  // server can follow redirects, handle the tmpfiles.org /dl/ → viewer HTML
  // redirect, and serve actual image bytes.
  if (
    src.includes("tmpfiles.org") ||
    src.includes("files.catbox.moe") ||
    src.includes("catbox.moe")
  ) {
    return "/api/img-proxy?url=" + encodeURIComponent(src);
  }
  return src;
}

export async function compressImage(
  file: File,
  maxBytes: number = TARGET_BYTES
): Promise<string> {
  // Only process image files
  if (!file.type.startsWith("image/")) {
    throw new Error("File bukan gambar");
  }

  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  // Scale down if exceeds max dimension, preserving aspect ratio
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // Iteratively compress: try decreasing quality at current dimensions, and
  // if still over target, reduce dimensions by 20% and retry the full quality
  // ladder. This reliably hits the maxBytes target even for large sources.
  // Allow a small 5% tolerance so we don't over-compress needlessly.
  const tolerance = Math.round(maxBytes * 0.05);
  const hardLimit = maxBytes + tolerance;

  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.1];

  let curW = width;
  let curH = height;
  let result = "";
  let done = false;

  while (!done && curW >= 100 && curH >= 100) {
    const canvas = document.createElement("canvas");
    canvas.width = curW;
    canvas.height = curH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak didukung");
    ctx.drawImage(img, 0, 0, curW, curH);

    for (const q of qualities) {
      result = canvas.toDataURL("image/jpeg", q);
      if (estimateBytes(result) <= hardLimit) {
        done = true;
        break;
      }
    }
    if (!done) {
      curW = Math.round(curW * 0.8);
      curH = Math.round(curH * 0.8);
    }
  }

  // Fallback: if we somehow exited without a result, produce a tiny one.
  if (!result) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(curW, 200);
    canvas.height = Math.min(curH, 200);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL("image/jpeg", 0.1);
    }
  }

  return result;
}

function estimateBytes(dataUrl: string): number {
  return Math.round((dataUrl.length - 23) * 0.75);
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat gambar"));
    img.src = src;
  });
}
