import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const IMAGE_DIR = join(process.cwd(), "public", "listing-images");

// Ensure directory exists
async function ensureDir() {
  await mkdir(IMAGE_DIR, { recursive: true });
}

/**
 * Save a single base64 data URL to a local file.
 * Returns the public path like "/listing-images/abc123.jpg".
 * If the input is already a local path (starts with "/"), returns it as-is.
 * If the input is an external URL, downloads and saves locally.
 */
export async function saveImageToLocal(input: string): Promise<string> {
  if (!input) return "";

  // Already a local path
  if (input.startsWith("/listing-images/") || input.startsWith("/cat-icons/")) {
    return input;
  }

  // Base64 data URL: "data:image/jpeg;base64,/9j/4AAQ..."
  if (input.startsWith("data:")) {
    await ensureDir();
    const match = input.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return input; // fallback: return as-is if can't parse

    const mime = match[1]; // e.g. "image/jpeg"
    const base64 = match[2];
    const ext = mimeToExt(mime);
    const filename = `${randomUUID().slice(0, 12)}.${ext}`;
    const filepath = join(IMAGE_DIR, filename);

    const buffer = Buffer.from(base64, "base64");
    await writeFile(filepath, buffer);

    return `/listing-images/${filename}`;
  }

  // External URL (https://...): download and save
  if (input.startsWith("https://") || input.startsWith("http://")) {
    await ensureDir();
    try {
      const res = await fetch(input, {
        headers: { "User-Agent": "GomesinBot/1.0", Accept: "image/*" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return input; // fallback: keep external URL

      const contentType = res.headers.get("content-type") || "image/jpeg";
      const ext = mimeToExt(contentType);
      const filename = `${randomUUID().slice(0, 12)}.${ext}`;
      const filepath = join(IMAGE_DIR, filename);

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile(filepath, buffer);

      return `/listing-images/${filename}`;
    } catch {
      // If download fails, return a placeholder to avoid broken images
      return "/listing-images/placeholder.jpg";
    }
  }

  // Unknown format — return as-is
  return input;
}

/**
 * Save multiple images to local storage.
 * Handles mixed input: base64, external URLs, and local paths.
 */
export async function saveImagesToLocal(images: string[]): Promise<string[]> {
  const results = await Promise.all(images.map(saveImageToLocal));
  return results.filter(Boolean);
}

function mimeToExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg"; // default to jpg
}
