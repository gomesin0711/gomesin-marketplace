import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { parseListing, formatRupiahFull } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, message, history } = body as {
      slug: string;
      message: string;
      history?: { role: "user" | "assistant"; content: string }[];
    };

    if (!slug || !message) {
      return NextResponse.json({ error: "slug dan message wajib diisi" }, { status: 400 });
    }

    const listing = await db.listing.findUnique({
      where: { slug },
      include: { category: true, seller: true },
    });

    if (!listing) {
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
    }

    const l = parseListing(listing);
    const specsText = Object.entries(l.specs)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const systemPrompt = `Kamu adalah "${l.seller.name}", seorang penjual mesin industri di Gomesin (marketplace mesin industri Indonesia).
Kamu sedang menerima chat dari calon pembeli mengenai iklan berikut:

Judul: ${l.title}
Kategori: ${l.category.name}
Harga: ${formatRupiahFull(l.price)} (${l.priceType === "negotiable" ? "masih bisa dinegosiasikan" : "harga pas/fixed"})
Kondisi: ${l.condition === "baru" ? "Baru" : "Bekas"}
Brand: ${l.brand || "-"}
Tahun Produksi: ${l.yearProduced || "-"}
Lokasi: ${l.city}, ${l.province}
Spesifikasi:
${specsText}

Deskripsi iklan: ${l.description}

Aturan membalas:
- Balas dalam Bahasa Indonesia yang ramah, sopan, profesional, dan ringkas (maksimal 3-4 kalimat).
- Bertindaklah sebagai penjual asli yang mengetahui produknya. Jawab pertanyaan teknis sesuai spesifikasi di atas.
- Jika ditanya harga, sebutkan harga di atas dan jelaskan apakah bisa nego.
- Jika ditanya stok/ketersediaan, jawab "masih tersedia, siap dilihat langsung di ${l.city}".
- Jika diminta COD / survei, setujui untuk bertemu di sekitar ${l.city} dan tawarkan jadwal.
- Jika ditanya pengiriman luar kota, jawab bisa dikirim via ekspedisi dengan ongkir ditanggung pembeli.
- Jika pembeli menawar harga jauh di bawah, tolak dengan sopan dan beri penawaran kecil atau alasan harga sesuai kondisi.
- JANGAN mengarang spesifikasi yang tidak ada di data. Jika tidak tahu, sarankan pembeli survei langsung.
- Jangan pernah menyebutkan bahwa kamu AI atau asisten.`;

    const zai = await ZAI.create();

    const messages: { role: "assistant" | "user"; content: string }[] = [
      { role: "assistant", content: systemPrompt },
      ...(history || []).slice(-8),
      { role: "user", content: message },
    ];

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Halo, terima kasih sudah menghubungi. Iklan ini masih tersedia. Silakan beri tahu pertanyaan Anda lebih lanjut ya.";

    return NextResponse.json({ reply, sellerName: l.seller.name });
  } catch (e: any) {
    console.error("chat error", e);
    return NextResponse.json(
      {
        reply:
          "Maaf, terjadi kendala teknis di server chat. Silakan hubungi penjual langsung via WhatsApp untuk respon cepat.",
        error: e?.message,
      },
      { status: 200 }
    );
  }
}
