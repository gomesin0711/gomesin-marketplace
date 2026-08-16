import { NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getFallbackMostSearchedListings } from "@/lib/fallback-data";
import { normalizeSupabaseDate } from "@/lib/supabase-helpers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nyyvmttbwlwqunigkrms.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8";

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function safeJsonParse(s: string, fallback: any) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function parseSupabaseListing(row: any) {
  if (!row) return row;
  const seller = row.seller
    ? { ...row.seller, joinedAt: normalizeSupabaseDate(row.seller.joinedAt) }
    : null;
  return {
    ...row,
    price: typeof row.price === "string" ? Number(row.price) : row.price ?? 0,
    images: row.images ? (typeof row.images === "string" ? safeJsonParse(row.images, []) : row.images) : [],
    specs: row.specs ? (typeof row.specs === "string" ? safeJsonParse(row.specs, {}) : row.specs) : {},
    createdAt: normalizeSupabaseDate(row.createdAt),
    paymentExpiry: normalizeSupabaseDate(row.paymentExpiry),
    // Mirror Prisma's parseListing: expose seller.joinedAt at the top level too.
    joinedAt: seller?.joinedAt ?? null,
    category: row.category ?? null,
    seller,
    user: row.user ?? null,
  };
}

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

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
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

      // 3. Skor: chatCount*10 + views*2.
      const scored = allActive.map((l) => {
        const chatCount = chatCounts[l.id] || 0;
        const views = l.views || 0;
        const score = chatCount * 10 + views * 2;
        return { listing: l, chatCount, views, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, limit);

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
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
      });
    } catch (error) {
      console.error("GET /api/listings/most-searched Prisma error, trying Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();

    // 1. Fetch all messages with a listingId (for chat counts).
    const { data: messages, error: msgError } = await supabase
      .from("Message")
      .select("listingId")
      .not("listingId", "is", null);
    if (msgError) throw new Error(msgError.message);

    const chatCounts: Record<string, number> = {};
    for (const m of messages || []) {
      if (m.listingId) chatCounts[m.listingId] = (chatCounts[m.listingId] || 0) + 1;
    }

    // 2. Fetch all active + paid listings.
    const { data: listings, error: listError } = await supabase
      .from("Listing")
      .select("*")
      .eq("status", "active")
      .eq("paymentStatus", "paid")
      .eq("violationFlag", false);
    if (listError) throw new Error(listError.message);

    // 3. Batch-fetch related Category/Seller/User rows.
    const categoryIds = [...new Set((listings || []).map((r: any) => r.categoryId).filter(Boolean))];
    const sellerIds = [...new Set((listings || []).map((r: any) => r.sellerId).filter(Boolean))];
    const userIds = [...new Set((listings || []).map((r: any) => r.userId).filter(Boolean))];

    const [catsRes, sellersRes, usersRes] = await Promise.all([
      categoryIds.length
        ? supabase.from("Category").select("*").in("id", categoryIds)
        : Promise.resolve({ data: [], error: null }),
      sellerIds.length
        ? supabase.from("Seller").select("*").in("id", sellerIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("User").select("id,name,phone,email,city,logoImage,bannerImage").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const categoryMap = new Map((catsRes.data || []).map((c: any) => [c.id, c]));
    const sellerMap = new Map((sellersRes.data || []).map((s: any) => [s.id, s]));
    const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

    // 4. Score and sort.
    const scored = (listings || []).map((row: any) => {
      const chatCount = chatCounts[row.id] || 0;
      const views = row.views || 0;
      const score = chatCount * 10 + views * 2;
      const withRelations = {
        ...row,
        category: categoryMap.get(row.categoryId) ?? null,
        seller: sellerMap.get(row.sellerId) ?? null,
        user: userMap.get(row.userId) ?? null,
      };
      return { listing: parseSupabaseListing(withRelations), chatCount, views, score };
    });

    scored.sort((a: any, b: any) => b.score - a.score);
    const top = scored.slice(0, limit);

    const result = top.map((s: any) => ({
      ...s.listing,
      chatCount: s.chatCount,
      views: s.views,
    }));

    return NextResponse.json({
      listings: result,
      total: result.length,
      page: 1,
      limit,
      totalPages: 1,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error("GET /api/listings/most-searched Supabase error, falling back to seed data:", error);
    return NextResponse.json(getFallbackMostSearchedListings(limit), {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  }
}
