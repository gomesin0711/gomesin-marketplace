import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

// GET /api/proof/[filename]
// Serve bukti pembayaran gambar LANGSUNG (content-type: image/*, tanpa redirect).
// Ini penting supaya WhatsApp menampilkan PREVIEW gambar (bukan link teks)
// karena WhatsApp hanya generate image preview untuk URL yang return gambar
// murni dengan content-type image/* dan tidak redirect.
const PROOFS_DIR = join(process.cwd(), "proofs");

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Validasi filename (hindari path traversal).
  if (!filename || !/^[a-zA-Z0-9-]+\.(png|jpe?g|gif|webp)$/i.test(filename)) {
    return NextResponse.json({ error: "Filename tidak valid" }, { status: 400 });
  }

  const filePath = join(PROOFS_DIR, filename);
  try {
    await stat(filePath);
  } catch {
    return NextResponse.json({ error: "Bukti tidak ditemukan" }, { status: 404 });
  }

  const buffer = await readFile(filePath);
  const ext = filename.split(".").pop()?.toLowerCase() || "png";
  const contentType = CONTENT_TYPES[ext] || "image/png";

  // Return gambar dengan header cache + content-type yang benar.
  // no-cache supaya WhatsApp selalu fetch versi terbaru.
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(buffer.length),
    },
  });
}
