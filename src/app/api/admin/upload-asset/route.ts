import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/admin/upload-asset
//
// Admin-only endpoint to upload site-wide asset files (QRIS image, chat
// ringtone, listing ringtone) directly to the `public/` folder so they are
// served statically by Next.js.
//
// Accepts multipart/form-data with:
//   - file    : the uploaded File (image/jpeg/png for QRIS, audio/wav/mp3/ogg for sounds)
//   - type    : "qris" | "chat-sound" | "listing-sound"
//   - userId  : the admin user's id (for server-side auth check)
//
// On success, writes the file to public/ and upserts two settings:
//   - <assetKey>Url     : the public URL path (e.g. "/qris-mesinKU.jpeg")
//   - <assetKey>Version : a cache-bust version (epoch millis)
//
// The frontend then refetches settings to get the new URL+version and uses
// `?v=<version>` to force the browser to reload the asset.
// ---------------------------------------------------------------------------

// Map asset type → { settingKey, directory, baseFilename, allowedMime, allowedExts }
type AssetSpec = {
  settingKey: string; // e.g. "qrisImage"
  directory: string;  // relative to public/
  baseFilename: string; // e.g. "qris-mesinKU"
  allowedMime: string[]; // allowed MIME types
  allowedExts: string[]; // allowed file extensions (lowercase, no dot)
};

const ASSET_SPECS: Record<string, AssetSpec> = {
  qris: {
    settingKey: "qrisImage",
    directory: "", // public/ root
    baseFilename: "qris-mesinKU",
    allowedMime: ["image/jpeg", "image/png", "image/webp"],
    allowedExts: ["jpg", "jpeg", "png", "webp"],
  },
  "chat-sound": {
    settingKey: "chatSound",
    directory: "sounds",
    baseFilename: "mesinku-chat",
    allowedMime: ["audio/wav", "audio/mpeg", "audio/ogg", "audio/mp3", "audio/x-wav"],
    allowedExts: ["wav", "mp3", "ogg"],
  },
  "listing-sound": {
    settingKey: "listingSound",
    directory: "sounds",
    baseFilename: "iklan-masuk",
    allowedMime: ["audio/wav", "audio/mpeg", "audio/ogg", "audio/mp3", "audio/x-wav"],
    allowedExts: ["wav", "mp3", "ogg"],
  },
};

// Max file size: 5MB for images, 2MB for audio.
const MAX_SIZE: Record<string, number> = {
  qris: 5 * 1024 * 1024,
  "chat-sound": 2 * 1024 * 1024,
  "listing-sound": 2 * 1024 * 1024,
};

const PUBLIC_DIR = join(process.cwd(), "public");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const type = formData.get("type");
    const userId = formData.get("userId");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }
    if (typeof type !== "string" || !ASSET_SPECS[type]) {
      return NextResponse.json({ error: "Tipe aset tidak valid" }, { status: 400 });
    }
    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const spec = ASSET_SPECS[type];

    // --- Server-side auth check (same pattern as /api/admin/settings) ---
    if (!isDbAvailable()) {
      return NextResponse.json(
        { error: "Database tidak tersedia di environment ini" },
        { status: 503 }
      );
    }
    try {
      const requester = await db.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!requester || (requester.role !== "admin" && requester.role !== "superadmin")) {
        return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
      }
    } catch (error) {
      console.error("[admin/upload-asset] auth check error:", error);
      return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
    }

    // --- Validate file size ---
    const maxSize = MAX_SIZE[type];
    if (file.size > maxSize) {
      const maxMB = (maxSize / 1024 / 1024).toFixed(1);
      return NextResponse.json(
        { error: `Ukuran file terlalu besar (maks ${maxMB}MB)` },
        { status: 400 }
      );
    }

    // --- Validate MIME type & extension ---
    const mimeType = file.type || "";
    const originalName = file.name || "";
    const ext = (originalName.split(".").pop() || "").toLowerCase();

    // Determine extension: prefer from filename, fall back to MIME type.
    let finalExt = "";
    if (spec.allowedExts.includes(ext)) {
      finalExt = ext;
      // Normalize jpeg → jpg for consistency
      if (finalExt === "jpeg") finalExt = "jpg";
    } else {
      // Infer from MIME type
      const mimeToExt: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/ogg": "ogg",
      };
      finalExt = mimeToExt[mimeType] || "";
    }

    if (!finalExt || !spec.allowedExts.includes(finalExt)) {
      return NextResponse.json(
        { error: `Format file tidak didukung. Diperbolehkan: ${spec.allowedExts.join(", ")}` },
        { status: 400 }
      );
    }

    // --- Build file path ---
    const targetDir = spec.directory
      ? join(PUBLIC_DIR, spec.directory)
      : PUBLIC_DIR;
    const targetFilename = `${spec.baseFilename}.${finalExt}`;
    const targetPath = join(targetDir, targetFilename);

    // Ensure directory exists.
    if (!existsSync(targetDir)) {
      try {
        await mkdir(targetDir, { recursive: true });
      } catch {
        // ignore — likely already exists
      }
    }

    // --- Remove old files with different extensions (cleanup) ---
    // e.g. if previously .wav and now .mp3, delete the old .wav.
    for (const oldExt of spec.allowedExts) {
      if (oldExt === finalExt) continue;
      const oldPath = join(targetDir, `${spec.baseFilename}.${oldExt}`);
      try {
        await unlink(oldPath);
      } catch {
        // ignore — file may not exist
      }
    }
    // Also handle .jpeg variant if we normalized to .jpg
    if (finalExt === "jpg") {
      const jpegVariant = join(targetDir, `${spec.baseFilename}.jpeg`);
      try {
        await unlink(jpegVariant);
      } catch {
        // ignore
      }
    }

    // --- Write file bytes ---
    const bytes = new Uint8Array(await file.arrayBuffer());
    await writeFile(targetPath, bytes);

    // --- Build public URL path ---
    const publicUrl = spec.directory
      ? `/${spec.directory}/${targetFilename}`
      : `/${targetFilename}`;

    // --- Bump version setting (epoch millis) ---
    const version = Date.now().toString();
    const urlKey = `${spec.settingKey}Url`;
    const versionKey = `${spec.settingKey}Version`;

    try {
      await db.$transaction([
        db.siteSetting.upsert({
          where: { key: urlKey },
          create: { key: urlKey, value: publicUrl },
          update: { value: publicUrl },
        }),
        db.siteSetting.upsert({
          where: { key: versionKey },
          create: { key: versionKey, value: version },
          update: { value: version },
        }),
      ]);
    } catch (error) {
      console.error("[admin/upload-asset] failed to update settings:", error);
      // File was written but settings failed — still return success with the
      // URL so the frontend can use it. Cache-bust will use a fallback.
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      version,
    });
  } catch (e: any) {
    console.error("[admin/upload-asset] error:", e);
    return NextResponse.json(
      { error: "Gagal upload: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
