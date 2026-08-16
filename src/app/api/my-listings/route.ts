import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { normalizeSupabaseDate } from "@/lib/supabase-helpers";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/admin/listings/route.ts.
// ---------------------------------------------------------------------------
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

// Parse a raw Supabase row into the same shape as parseListing(Prisma row).
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

// GET listings owned by a specific user or seller (for "My Ads" dashboard & seller page)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const sellerId = searchParams.get("sellerId");

  if (!userId && !sellerId) {
    return NextResponse.json(
      { error: "User ID atau Seller ID wajib diisi." },
      { status: 400 }
    );
  }

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      // Try userId first; if none found, fall back to sellerId
      const whereClause: any = userId ? { userId } : { sellerId };
      let listings = await db.listing.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        include: { category: true, seller: true, user: true },
      });

      // If userId was provided but no listings found, try sellerId as fallback
      if (listings.length === 0 && userId) {
        listings = await db.listing.findMany({
          where: { sellerId: userId },
          orderBy: { createdAt: "desc" },
          include: { category: true, seller: true, user: true },
        });
      }

      return NextResponse.json({
        listings: listings.map(parseListing),
        total: listings.length,
      });
    } catch (prismaErr) {
      console.error("[my-listings] Prisma GET error, falling back to Supabase:", prismaErr);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();

    // Try userId first; if none found, fall back to sellerId
    const filterCol = userId ? "userId" : "sellerId";
    const filterVal = userId || sellerId;

    const { data: rows, error } = await supabase
      .from("Listing")
      .select("*")
      .eq(filterCol, filterVal as string)
      .order("createdAt", { ascending: false });

    let finalRows = rows || [];

    // If userId was provided but no listings found, try sellerId as fallback
    if (finalRows.length === 0 && userId) {
      const { data: sellerRows, error: sellerErr } = await supabase
        .from("Listing")
        .select("*")
        .eq("sellerId", userId)
        .order("createdAt", { ascending: false });
      if (!sellerErr) finalRows = sellerRows || [];
    }

    if (error) {
      console.error("[my-listings] Supabase GET error:", error);
    }

    return NextResponse.json({
      listings: finalRows.map(parseSupabaseListing),
      total: finalRows.length,
    });
  } catch (error) {
    console.error("[my-listings] GET error:", error);
    return NextResponse.json({
      listings: [],
      total: 0,
    });
  }
}
