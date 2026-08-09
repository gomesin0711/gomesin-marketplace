import { NextRequest, NextResponse } from "next/server";

// POST /api/upload-proof
// Menerima bukti pembayaran (base64 data URL) → upload ke tmpfiles.org (host
// gambar gratis, anonymous) → return URL gambar LANGSUNG (bukan viewer page).
//
// Expiry: 60 hari (86400 menit) — sesuai permintaan user.
// Jika tmpfiles.org gagal, fallback ke catbox.moe (permanent storage).
//
// URL ini disisipkan ke pesan WhatsApp admin. Karena URL mengarah ke gambar
// langsung (content-type: image/png), WhatsApp akan menampilkan PREVIEW gambar,
// bukan cuma link teks.
export async function POST(req: NextRequest) {
  try {
    const { image } = (await req.json()) as { image: string };
    if (!image || !image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Image data URL wajib" }, { status: 400 });
    }

    // Decode base64 data URL → binary buffer.
    const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: "Format data URL tidak valid" }, { status: 400 });
    }
    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const mime = `image/${matches[1]}`;

    // === PRIMARY: tmpfiles.org (60-day expiry) ===
    // tmpfiles.org expire parameter is in MINUTES. Max 172800 (120 days).
    // We use 86400 minutes = 60 days.
    try {
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: mime }), `proof.${ext}`);
      form.append("expire", "86400"); // 60 days

      const upRes = await fetch("https://tmpfiles.org/api/v1/upload", {
        method: "POST",
        body: form,
      });

      if (upRes.ok) {
        const upData = await upRes.json();
        const viewerUrl: string = upData?.data?.url;
        if (viewerUrl) {
          // Fetch viewer page HTML → extract direct image URL
          // Pattern: https://tmpfiles.org/dl/{token}/{filename}
          const viewerRes = await fetch(viewerUrl);
          const html = await viewerRes.text();
          const directMatch = html.match(
            /https:\/\/tmpfiles\.org\/dl\/[^"' ]+\.(?:png|jpg|jpeg|gif|webp)/i
          );
          const directUrl = directMatch?.[0];
          if (directUrl) {
            return NextResponse.json({ url: directUrl, direct: true, host: "tmpfiles" });
          }
          // Fallback: return viewer URL (less ideal — WhatsApp shows as link, not image)
          return NextResponse.json({ url: viewerUrl, direct: false, host: "tmpfiles" });
        }
      }
    } catch (e) {
      console.error("tmpfiles upload failed:", e);
      // Continue to fallback
    }

    // === FALLBACK: catbox.moe (permanent storage, no expiry) ===
    try {
      const form = new FormData();
      form.append("reqtype", "fileupload");
      form.append("fileToUpload", new Blob([buffer], { type: mime }), `proof.${ext}`);

      const catRes = await fetch("https://catbox.moe/user/api.php", {
        method: "POST",
        body: form,
      });

      if (catRes.ok) {
        const text = await catRes.text();
        // catbox returns plain text URL: https://files.catbox.moe/xxxxx.jpg
        if (text.startsWith("https://")) {
          return NextResponse.json({ url: text.trim(), direct: true, host: "catbox" });
        }
      }
    } catch (e) {
      console.error("catbox upload failed:", e);
    }

    return NextResponse.json(
      { error: "Semua host upload gagal. Coba lagi nanti." },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gagal upload bukti: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
