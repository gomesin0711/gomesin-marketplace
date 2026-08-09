import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppImage } from "@/lib/whatsapp";

// POST /api/send-wa-proof
// Kirim bukti pembayaran (gambar) LANGSUNG ke WhatsApp admin via Fonnte API.
// Gambar dikirim sebagai base64 → muncul sebagai GAMBAR di chat admin, bukan link.
//
// Body:
//   imageBase64  — base64 data URL gambar bukti (wajib)
//   caption      — caption pesan (opsional)
//   fileName     — nama file (opsional, default "bukti-pembayaran.jpg")
//
// Butuh env var: FONNTE_API_KEY (dapatkan di https://fonnte.com)
// Admin number: WHATSAPP_ADMIN_NUMBER atau default 6285888082208
export async function POST(req: NextRequest) {
  try {
    const { imageBase64, caption, fileName } = (await req.json()) as {
      imageBase64: string;
      caption?: string;
      fileName?: string;
    };

    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 wajib" }, { status: 400 });
    }

    const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER || "6285888082208";
    const finalFileName = fileName || `bukti-pembayaran-${Date.now()}.jpg`;
    const finalCaption = caption || "Bukti Pembayaran Iklan Gomesin";

    // Kirim gambar via Fonnte API (base64 langsung, tidak perlu URL publik).
    const result = await sendWhatsAppImage(
      adminNumber,
      finalCaption,
      imageBase64,
      finalFileName
    );

    if (result.success) {
      return NextResponse.json({ success: true, method: "fonnte" });
    }

    return NextResponse.json(
      { success: false, error: result.error || "Gagal mengirim gambar" },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gagal kirim WA: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
