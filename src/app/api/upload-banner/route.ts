import { NextRequest, NextResponse } from "next/server";

// POST /api/upload-banner
// Simpan banner/logo image langsung sebagai base64 data URL di DB.
// Gambar sudah di-compress client-side ke max 200KB, jadi base64 (~270KB) muat di SQLite.
// Tidak pakai external host (tmpfiles/catbox) supaya tidak expired/hilang.
export async function POST(req: NextRequest) {
  try {
    const { image } = (await req.json()) as { image: string };
    if (!image || !image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Image data URL wajib" }, { status: 400 });
    }

    // Validasi ukuran (max 300KB base64 ≈ 220KB actual)
    if (image.length > 400000) {
      return NextResponse.json({ error: "Ukuran gambar terlalu besar (maks 200KB)" }, { status: 400 });
    }

    // Return data URL langsung — disimpan di DB sebagai string
    return NextResponse.json({ url: image, direct: true, host: "db" });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gagal upload: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
