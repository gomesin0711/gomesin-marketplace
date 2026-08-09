import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getFallbackMostSearchedListings } from "@/lib/fallback-data";

// GET /api/listings/most-searched?limit=12
//
// Mengembalikan iklan yang paling banyak "dicari" / diminati pembeli.
// Skor dihitung dari:
//   - jumlah chat penjual (bobot tinggi = minat kuat):  chatCount * 10
//   - jumlah views iklan (minat ringan):                views * 1
//
// Dihitung dari SEMUA iklan aktif (bukan hanya 7 hari terakhir seperti
// sebelumnya), supaya iklan populer lama yang masih relevan tetap muncul.
// Setiap iklan disertai `chatCount` + `views` agar frontend bisa tampilkan
// badge "X chat" / "X views".
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(24, Math.max(1, parseInt(searchParams.get("limit") || "12", 10)));

  try {
    // 1. Hitung jumlah chat per listingId (semua pesan, bukan hanya minggu ini).
    const messages = await db.message.findMany({
      where: { listingId: { not: null } },
      select: { listingId: true },
    });
    const chatCounts: Record<string, number> = {};
    for (const m of messages) {
      if (m.listingId) chatCounts[m.listingId] = (chatCounts[m.listingId] || 0) + 1;
    }

    // 2. Ambil semua iklan aktif + lunas (tanpa filter 7 hari).
    const allActive = await db.listing.findMany({
      where: { status: "active", paymentStatus: "paid", violationFlag: false },
      include: {
        category: true,
        seller: true,
        user: { select: { id: true, name: true, phone: true, email: true, city: true, logoImage: true, bannerImage: true } },
      },
    });

    // 3. Skor: chatCount*10 + views*2. Chat = paling banyak di-chat/WhatsApp,
    //    views = paling banyak diklik/favorit (proxy minat).
    const scored = allActive.map((l) => {
      const chatCount = chatCounts[l.id] || 0;
      const views = l.views || 0;
      const score = chatCount * 10 + views * 2;
      return { listing: l, chatCount, views, score };
    });

    // 4. Urutkan skor desc, ambil top N.
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);

    // 5. Sertakan chatCount + views di response untuk badge di frontend.
    const listings = top.map((s) => ({
      ...parseListing(s.listing),
      chatCount: s.chatCount,
      views: s.views,
    }));

    return NextResponse.json({
      listings,
      total: listings.length,
      page: 1,
      limit,
      totalPages: 1,
    });
  } catch (error) {
    console.error("GET /api/listings/most-searched DB error, falling back to seed data", error);
    return NextResponse.json(getFallbackMostSearchedListings(limit));
  }
}
