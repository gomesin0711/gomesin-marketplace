// Client-side image compression utility.
// Compresses an image File to a base64 data URL under maxBytes (default 120KB).

const MAX_DIMENSION = 800; // max width/height in pixels
const TARGET_BYTES = 120_000; // ~120KB

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

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");
  ctx.drawImage(img, 0, 0, width, height);

  // Try decreasing JPEG quality until under maxBytes
  const qualities = [0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.1];
  let result = canvas.toDataURL("image/jpeg", 0.75);

  for (const q of qualities) {
    result = canvas.toDataURL("image/jpeg", q);
    // Estimate base64 size: data URL header ~23 chars, base64 is ~4/3 of binary
    const bytes = Math.round((result.length - 23) * 0.75);
    if (bytes <= maxBytes) break;
  }

  // If still too large, progressively halve dimensions
  let scale = 0.8;
  while (estimateBytes(result) > maxBytes && scale > 0.1) {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    result = canvas.toDataURL("image/jpeg", 0.5);
    scale *= 0.8;
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
