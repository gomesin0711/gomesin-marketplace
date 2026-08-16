import { NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getFallbackPopularListings } from "@/lib/fallback-data";
import { normalizeSupabaseDate } from "@/lib/supabase-helpers";

export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yzxeinqoryvprhuibtzn.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eGVpbnFvcnl2cHJodWlidHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjA5NTcsImV4cCI6MjEwMjQzNjk1N30.gmDvyEmNGP2PbL_3a8k18pTggRE9zQ3yBrBPQNJjWTI";

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
    joinedAt: seller?.joinedAt ?? null,
    category: row.category ?? null,
    seller,
    user: row.user ?? null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(24, Math.max(1, parseInt(searchParams.get("limit") || "8", 10)));

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const messages = await db.message.findMany({
        where: { listingId: { not: null } },
        select: { listingId: true },
      });
      const chatCounts: Record<string, number> = {};
      for (const m of messages) {
        if (m.listingId) chatCounts[m.listingId] = (chatCounts[m.listingId] || 0) + 1;
      }

      const chattedIds = Object.entries(chatCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

      const allActive = await db.listing.findMany({
        where: { status: "active", paymentStatus: "paid", violationFlag: false },
        include: { category: true, seller: true, user: { select: { id: true, name: true, phone: true, email: true, city: true } } },
      });

      const chattedListings = chattedIds
        .map((id) => allActive.find((l) => l.id === id))
        .filter((l): l is NonNullable<typeof l> => !!l);

      const chattedIdsSet = new Set(chattedIds);
      const otherListings = allActive
        .filter((l) => !chattedIdsSet.has(l.id))
        .sort((a, b) => {
          const rank: Record<string, number> = { spotlight: 0, highlight: 1, colek: 2, sundul: 3 };
          const ra = rank[a.packageType] ?? 3;
          const rb = rank[b.packageType] ?? 3;
          if (ra !== rb) return ra - rb;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });

      const combined = [...chattedListings, ...otherListings].slice(0, limit);
      const listings = combined.map(parseListing);

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
      console.error("GET /api/listings/popular Prisma error, trying Supabase:", error);
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();

    // 1. Count messages per listingId.
    const { data: messages, error: msgError } = await supabase
      .from("Message")
      .select("listingId")
      .not("listingId", "is", null);
    if (msgError) throw new Error(msgError.message);

    const chatCounts: Record<string, number> = {};
    for (const m of messages || []) {
      if (m.listingId) chatCounts[m.listingId] = (chatCounts[m.listingId] || 0) + 1;
    }

    const chattedIds = Object.entries(chatCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    // 2. Fetch all active + paid listings.
    const { data: listings, error: listError } = await supabase
      .from("Listing")
      .select("*")
      .eq("status", "active")
      .eq("paymentStatus", "paid")
      .eq("violationFlag", false);
    if (listError) throw new Error(listError.message);

    // 3. Batch-fetch related rows.
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
        ? supabase.from("User").select("id,name,phone,email,city").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const categoryMap = new Map((catsRes.data || []).map((c: any) => [c.id, c]));
    const sellerMap = new Map((sellersRes.data || []).map((s: any) => [s.id, s]));
    const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

    const allParsed = (listings || []).map((row: any) =>
      parseSupabaseListing({
        ...row,
        category: categoryMap.get(row.categoryId) ?? null,
        seller: sellerMap.get(row.sellerId) ?? null,
        user: userMap.get(row.userId) ?? null,
      })
    );

    // 4. Build result: chatted listings first, then fill with others.
    const chattedListings = chattedIds
      .map((id) => allParsed.find((l: any) => l.id === id))
      .filter((l: any): l is any => !!l);

    const chattedIdsSet = new Set(chattedIds);
    const otherListings = allParsed
      .filter((l: any) => !chattedIdsSet.has(l.id))
      .sort((a: any, b: any) => {
        const rank: Record<string, number> = { spotlight: 0, highlight: 1, colek: 2, sundul: 3 };
        const ra = rank[a.packageType] ?? 3;
        const rb = rank[b.packageType] ?? 3;
        if (ra !== rb) return ra - rb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const combined = [...chattedListings, ...otherListings].slice(0, limit);

    return NextResponse.json({
      listings: combined,
      total: combined.length,
      page: 1,
      limit,
      totalPages: 1,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error("GET /api/listings/popular Supabase error, falling back to seed data:", error);
    return NextResponse.json(getFallbackPopularListings(limit), {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  }
}
